import openai from '@/lib/openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pass2Result } from '../types';

const SYSTEM_PROMPT = `You are a professional expense analyst. You receive structured expense data and return ONLY a JSON object — no markdown, no asterisks, no preamble. Be specific with numbers. Every insight must reference actual dollar amounts, percentages, or z-scores from the data provided.

Return this exact JSON structure:
{
  "health_score": <integer 1-10>,
  "health_justification": "<one sentence explaining the score>",
  "narrative_summary": "<2-3 sentences, specific numbers, professional tone>",
  "insights": [
    {
      "title": "<short scannable title>",
      "description": "<one sentence with specific numbers>",
      "severity": "<success|info|warning|critical>",
      "category": "<category name or null>",
      "metric": "<e.g. 42% above rolling avg or z=2.8>"
    }
  ],
  "savings_opportunities": [
    {
      "title": "<short title>",
      "description": "<specific actionable recommendation>",
      "estimated_impact": "<dollar amount or percentage if calculable>"
    }
  ],
  "anomaly_explanations": [
    {
      "vendor": "<vendor name>",
      "amount": <number>,
      "reason": "<specific explanation with numbers>",
      "severity": "<warning|critical>"
    }
  ]
}

Scoring guide (1-10): 9-10=excellent spend discipline, 7-8=good with minor concerns, 5-6=needs attention, 3-4=concerning patterns, 1-2=critical issues requiring immediate action.
Severity: success=positive/under-budget, info=neutral observation, warning=z 1.5-2.5 or mild drift, critical=z>2.5 or duplicate or >50% over avg.
Generate 4-7 insights, 2-4 savings_opportunities, and one anomaly_explanation per top anomalous transaction (max 5).`;

export async function runPass2(
  uploadId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<Pass2Result> {
  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', userId)
    .single();
  if (uploadError || !upload) throw new Error(`Upload not found: ${uploadError?.message}`);

  const [
    { data: allItems },
    { data: catStats },
    { data: allVendors },
  ] = await Promise.all([
    supabase
      .from('line_items')
      .select('vendor, amount, category, subcategory, z_score, anomaly_severity, is_possible_duplicate, is_round_number, is_first_time_vendor')
      .eq('upload_id', uploadId)
      .order('z_score', { ascending: false }),
    supabase
      .from('category_stats')
      .select('category, total_spend_period, total_spend_alltime, pct_of_total_spend, mean_amount, std_dev, rolling_avg_5, rolling_avg_alltime, trend_direction')
      .eq('upload_id', uploadId),
    supabase
      .from('vendors')
      .select('vendor_name, primary_category, total_spend, total_occurrences, recurrence_tier')
      .eq('user_id', userId)
      .order('total_spend', { ascending: false })
      .limit(20),
  ]);

  const { data: prevUpload } = await supabase
    .from('uploads')
    .select('id')
    .eq('user_id', userId)
    .neq('id', uploadId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single();

  let prevCatStats: { category: string; total_spend_period: number }[] = [];
  if (prevUpload) {
    const { data } = await supabase
      .from('category_stats')
      .select('category, total_spend_period')
      .eq('upload_id', prevUpload.id);
    prevCatStats = data ?? [];
  }

  const items = allItems ?? [];
  const stats = catStats ?? [];
  const vendors = allVendors ?? [];

  const anomalies = items.filter((i) => i.anomaly_severity !== 'none');
  const duplicates = items.filter((i) => i.is_possible_duplicate);
  const firstTimeHighSpend = items.filter(
    (i) => i.is_first_time_vendor && i.anomaly_severity !== 'none'
  );
  const roundNumbers = items.filter(
    (i) => i.is_round_number && i.anomaly_severity !== 'none'
  );

  // Category breakdown — pre-aggregated, never raw rows
  const category_breakdown = stats.map((s) => {
    const period = Number(s.total_spend_period ?? 0);
    const rolling = Number(s.rolling_avg_5 ?? 0);
    const prev = prevCatStats.find((p) => p.category === s.category);
    const prevTotal = prev ? Number(prev.total_spend_period) : null;
    const catAnomalies = items.filter(
      (i) => i.category === s.category && i.anomaly_severity !== 'none'
    ).length;

    return {
      category: s.category,
      total_spend_period: period,
      rolling_avg_5: rolling,
      rolling_avg_alltime: Number(s.rolling_avg_alltime ?? 0),
      pct_of_total_spend: `${Number(s.pct_of_total_spend ?? 0).toFixed(1)}%`,
      trend_direction: s.trend_direction,
      mean_amount: Number(s.mean_amount ?? 0).toFixed(2),
      std_dev: Number(s.std_dev ?? 0).toFixed(2),
      anomalous_items_count: catAnomalies,
      vs_rolling_avg:
        rolling > 0
          ? `${(((period - rolling) / rolling) * 100).toFixed(1)}% ${period > rolling ? 'above' : 'below'} rolling avg`
          : 'no baseline yet',
      vs_prev_period:
        prevTotal && prevTotal > 0
          ? `${(((period - prevTotal) / prevTotal) * 100).toFixed(1)}% vs prev period`
          : 'first period on record',
    };
  });

  // Top anomalies by z-score — only aggregated stats
  const top_anomalies = anomalies.slice(0, 10).map((i) => ({
    vendor: i.vendor,
    amount: Number(i.amount ?? 0),
    category: i.category,
    anomaly_severity: i.anomaly_severity,
    z_score: Number(i.z_score ?? 0).toFixed(2),
    flags: [
      i.is_first_time_vendor && 'first_time_vendor',
      i.is_possible_duplicate && 'possible_duplicate',
      i.is_round_number && 'round_number',
    ].filter(Boolean),
  }));

  // Vendor flags
  const vendor_flags = {
    possible_duplicates: duplicates.slice(0, 5).map((d) => ({
      vendor: d.vendor,
      amount: Number(d.amount ?? 0),
      category: d.category,
    })),
    first_time_high_spend: firstTimeHighSpend.slice(0, 5).map((v) => ({
      vendor: v.vendor,
      amount: Number(v.amount ?? 0),
      category: v.category,
      z_score: Number(v.z_score ?? 0).toFixed(2),
    })),
    round_number_flags: roundNumbers.slice(0, 3).map((r) => ({
      vendor: r.vendor,
      amount: Number(r.amount ?? 0),
      category: r.category,
    })),
  };

  // Skewed categories (>25% above rolling avg)
  const skewed_categories = stats
    .filter((s) => {
      const period = Number(s.total_spend_period ?? 0);
      const rolling = Number(s.rolling_avg_5 ?? 0);
      return rolling > 0 && period > rolling * 1.25;
    })
    .map((s) => ({
      category: s.category,
      period_spend: Number(s.total_spend_period ?? 0),
      rolling_avg: Number(s.rolling_avg_5 ?? 0),
      deviation_pct: `${(((Number(s.total_spend_period ?? 0) - Number(s.rolling_avg_5 ?? 0)) / Number(s.rolling_avg_5 ?? 0)) * 100).toFixed(1)}%`,
    }));

  // Consolidation opportunities: categories with ≥3 distinct vendors
  const vendorsByCategory: Record<string, string[]> = {};
  for (const v of vendors) {
    const cat = v.primary_category ?? 'Misc';
    if (!vendorsByCategory[cat]) vendorsByCategory[cat] = [];
    vendorsByCategory[cat].push(v.vendor_name);
  }
  const consolidation_opportunities = Object.entries(vendorsByCategory)
    .filter(([, vList]) => vList.length >= 3)
    .map(([category, vList]) => ({
      category,
      vendor_count: vList.length,
      top_vendors: vList.slice(0, 4),
    }));

  const context = {
    period_summary: {
      filename: upload.filename,
      uploaded_at: upload.uploaded_at,
      total_spend: Number(upload.total_amount ?? 0),
      line_item_count: Number(upload.line_item_count ?? 0),
      categories_active: stats.length,
    },
    category_breakdown,
    top_anomalies,
    vendor_flags,
    skewed_categories,
    consolidation_opportunities,
    anomaly_counts: {
      total: anomalies.length,
      high: anomalies.filter((a) => a.anomaly_severity === 'high').length,
      medium: anomalies.filter((a) => a.anomaly_severity === 'medium').length,
      possible_duplicates: duplicates.length,
      first_time_high_spend: firstTimeHighSpend.length,
      round_number_flags: roundNumbers.length,
    },
  };

  const input = `System:\n${SYSTEM_PROMPT}\n\nUser:\nAnalyze this expense period:\n\n${JSON.stringify(context, null, 2)}`;

  let response;
  try {
    response = await openai.responses.create({
      model: 'gpt-4o',
      input,
      text: { format: { type: 'json_object' } },
    });
  } catch (openaiErr) {
    console.error('[pass2] OpenAI API call failed:', openaiErr);
    throw new Error(`OpenAI API failed: ${String(openaiErr)}`);
  }

  console.log('[pass2] Response received, output length:', response.output_text?.length);

  let result: Pass2Result;
  try {
    result = JSON.parse(response.output_text);
    if (typeof result.health_score !== 'number') throw new Error('Missing health_score');
    if (typeof result.health_justification !== 'string') throw new Error('Missing health_justification');
    if (typeof result.narrative_summary !== 'string') throw new Error('Missing narrative_summary');
    if (!Array.isArray(result.insights)) throw new Error('Missing insights array');
    if (!Array.isArray(result.savings_opportunities)) throw new Error('Missing savings_opportunities array');
    if (!Array.isArray(result.anomaly_explanations)) result.anomaly_explanations = [];
  } catch (err) {
    console.error('[pass2] JSON parse failed. Raw output:', response.output_text?.slice(0, 500));
    throw new Error(`Pass 2 JSON parse failed: ${String(err)}`);
  }

  // Clamp health_score to 1-10
  result.health_score = Math.max(1, Math.min(10, Math.round(result.health_score)));

  await supabase
    .from('uploads')
    .update({ pass2_status: 'complete', health_score: result.health_score, ai_analysis: result })
    .eq('id', uploadId);

  return result;
}

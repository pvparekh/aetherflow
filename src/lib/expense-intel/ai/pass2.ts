import openai from '@/lib/openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pass2Result } from '../types';

const SYSTEM_PROMPT = `You are a senior financial analyst reviewing a business expense report.
You have been given pre-aggregated statistical data — do not ask for raw data.
Identify financial health issues, anomalies, and savings opportunities based solely on what is provided.

Respond with ONLY a valid JSON object — no markdown, no code fences:
{
  "health_score": <0-100 integer>,
  "health_justification": "<1-2 sentence explanation>",
  "narrative_summary": "<3-4 sentence executive summary of the period's spending>",
  "insights": [
    {
      "title": "<short title>",
      "description": "<2-3 sentence analysis>",
      "severity": "<success|info|warning|critical>",
      "category": "<expense category>",
      "metric": "<key metric, e.g. $1,234 (+23% vs avg)>",
      "action": "<specific actionable recommendation>"
    }
  ],
  "savings_opportunities": [
    {
      "title": "<opportunity title>",
      "description": "<description>",
      "estimated_savings": "<e.g. $200-400/month>",
      "category": "<expense category>"
    }
  ]
}

Scoring guide: 100=excellent, 80+=good, 60-79=needs attention, 40-59=concerning, <40=critical.
Severity: success=positive finding, info=neutral, warning=needs review, critical=immediate action.
Generate 3-7 insights and 2-5 savings_opportunities.`;

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

  const [{ data: allItems }, { data: catStats }] = await Promise.all([
    supabase
      .from('line_items')
      .select('vendor, amount, category, subcategory, z_score, anomaly_severity, is_possible_duplicate, is_round_number, is_first_time_vendor')
      .eq('upload_id', uploadId)
      .order('z_score', { ascending: false }),
    supabase
      .from('category_stats')
      .select('category, total_spend_period, pct_of_total_spend, mean_amount, std_dev, rolling_avg_5, trend_direction')
      .eq('upload_id', uploadId),
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
  const anomalies = items.filter((i) => i.anomaly_severity !== 'none');
  const duplicates = items.filter((i) => i.is_possible_duplicate);
  const firstTimeVendors = items.filter((i) => i.is_first_time_vendor);
  const roundNumbers = items.filter((i) => i.is_round_number && i.anomaly_severity !== 'none');

  const categoryBreakdown = stats.map((s) => {
    const prev = prevCatStats.find((p) => p.category === s.category);
    const prevTotal = prev ? Number(prev.total_spend_period) : null;
    const currentTotal = Number(s.total_spend_period);
    const vsPrev =
      prevTotal && prevTotal > 0
        ? `${(((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1)}% vs prev period`
        : 'first period';
    return {
      category: s.category,
      total: currentTotal,
      pct_of_total: `${Number(s.pct_of_total_spend).toFixed(1)}%`,
      mean_per_item: Number(s.mean_amount).toFixed(2),
      std_dev: Number(s.std_dev).toFixed(2),
      rolling_avg_5: Number(s.rolling_avg_5).toFixed(2),
      trend: s.trend_direction,
      vs_prev_period: vsPrev,
    };
  });

  const context = {
    period_summary: {
      filename: upload.filename,
      total_spend: Number(upload.total_amount ?? 0),
      line_items: Number(upload.line_item_count ?? 0),
      categories_active: stats.length,
    },
    category_breakdown: categoryBreakdown,
    anomaly_summary: {
      total: anomalies.length,
      high: anomalies.filter((a) => a.anomaly_severity === 'high').length,
      medium: anomalies.filter((a) => a.anomaly_severity === 'medium').length,
      top_items: anomalies.slice(0, 5).map((a) => ({
        vendor: a.vendor,
        amount: a.amount,
        category: a.category,
        z_score: Number(a.z_score ?? 0).toFixed(2),
        severity: a.anomaly_severity,
      })),
    },
    vendor_flags: {
      possible_duplicates: duplicates.length,
      duplicate_examples: duplicates.slice(0, 3).map((d) => ({ vendor: d.vendor, amount: d.amount })),
      first_time_vendors: firstTimeVendors.length,
      round_number_anomalies: roundNumbers.length,
    },
  };

  const input = `System:\n${SYSTEM_PROMPT}\n\nUser:\nAnalyze this expense report data:\n\n${JSON.stringify(context, null, 2)}`;

  const response = await openai.responses.create({
    model: 'gpt-4o',
    input,
    text: { format: { type: 'json_object' } },
  });

  let result: Pass2Result;
  try {
    result = JSON.parse(response.output_text);
    if (typeof result.health_score !== 'number') throw new Error('Invalid health_score');
    if (!Array.isArray(result.insights)) throw new Error('Invalid insights');
    if (!Array.isArray(result.savings_opportunities)) throw new Error('Invalid savings_opportunities');
  } catch (err) {
    throw new Error(`Pass 2 JSON parse failed: ${String(err)}`);
  }

  result.health_score = Math.max(0, Math.min(100, Math.round(result.health_score)));

  await supabase
    .from('uploads')
    .update({ pass2_status: 'complete', health_score: result.health_score, ai_analysis: result })
    .eq('id', uploadId);

  return result;
}

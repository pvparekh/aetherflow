import openai from '@/lib/openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pass2Result } from '../types';

// ─── System prompts ────────────────────────────────────────────────────────

const SYSTEM_PROMPT_EXPENSE_REPORT = `You are a sharp, direct expense analyst reviewing a business expense report. You have the data — now give a real take. Be specific with numbers and vendor names. Sound like a trusted advisor, not a software report. Never use statistical jargon. Lead every insight with why it matters, not what the number is. If something looks fine, say so directly. If something looks off, say exactly why in plain english. Be concise — busy people are reading this.

Return ONLY valid JSON. No markdown, no asterisks, no preamble:
{
  "tone_context": "expense_report",
  "health_score": <integer 1-10>,
  "health_justification": "<one plain-english sentence — what's the main takeaway on this report's health>",
  "narrative_summary": "<2-3 conversational sentences — what happened this period, what stands out, what to check>",
  "insights": [
    {
      "title": "<short, direct title — no jargon>",
      "description": "<1-2 sentences with specific vendor names and dollar amounts — plain english>",
      "severity": "<success|info|warning|critical>",
      "category": "<category name, or null>",
      "metric": "<plain comparison like '$459 vs $280 avg' or '3 new vendors this month' — no z-scores or formulas>"
    }
  ],
  "savings_opportunities": [
    {
      "title": "<short actionable title>",
      "description": "<specific recommendation with vendor names where possible>",
      "estimated_impact": "<dollar amount or plain description>"
    }
  ],
  "anomaly_explanations": [
    {
      "vendor": "<vendor name>",
      "amount": <number — raw value, not formatted>,
      "reason": "<one sentence, plain english, why this is worth a second look>",
      "severity": "<warning|critical>"
    }
  ]
}

Scoring guide (1-10):
9-10 = spending looks controlled and consistent across the board
7-8 = mostly fine — one or two things worth a look, nothing serious
5-6 = a few things need attention, some categories running higher than normal
3-4 = concerning patterns, multiple categories off, something should change
1-2 = serious issues that need immediate attention

Rules:
- Generate 3-6 insights. Quality over quantity.
- Only generate a savings opportunity if there's a real, specific one — don't invent vague advice.
- Include one anomaly explanation per flagged transaction, up to 5 max.
- If everything looks normal, say so — do not manufacture concern to seem thorough.
- Never say "z-score", "rolling average", "std dev", "anomaly severity", "statistical", "baseline", or any technical metric term.
- Always reference actual vendor names and dollar amounts.
- Short sentences. No corporate filler like "It is worth noting that..."`;

const SYSTEM_PROMPT_BANK_STATEMENT = `You are a sharp, direct personal finance advisor reviewing someone's bank statement. You can see what came in and what went out. Give a real, honest take on their month. Be warm but direct. Specific vendor names and dollar amounts make insights useful — use them. Never use financial jargon or statistical terms. Lead with cash flow first (did they come out ahead?), then spending patterns, then anything that looks off. If their finances look healthy, say so clearly. Don't manufacture concern.

Return ONLY valid JSON. No markdown, no asterisks, no preamble:
{
  "tone_context": "bank_statement",
  "health_score": <integer 1-10>,
  "health_justification": "<one plain-english sentence about their financial health this period>",
  "narrative_summary": "<2-3 conversational sentences — cash flow first, then what stands out, then anything to check>",
  "insights": [
    {
      "title": "<short, direct title>",
      "description": "<1-2 sentences with specific vendor names and dollar amounts>",
      "severity": "<success|info|warning|critical>",
      "category": "<category name, or null>",
      "metric": "<plain comparison — no jargon>"
    }
  ],
  "savings_opportunities": [
    {
      "title": "<short actionable title>",
      "description": "<specific recommendation with vendor names where possible>",
      "estimated_impact": "<dollar amount or plain description>"
    }
  ],
  "anomaly_explanations": [
    {
      "vendor": "<vendor name>",
      "amount": <number>,
      "reason": "<one sentence, plain english>",
      "severity": "<warning|critical>"
    }
  ]
}

Scoring guide (1-10):
9-10 = healthy cash flow, spending well within income, consistent habits
7-8 = came out ahead but a few things worth watching
5-6 = broke even or slight overspend, nothing catastrophic
3-4 = spending materially more than coming in, patterns to address
1-2 = significant cash flow problem this period

Rules:
- Lead with whether they came out ahead financially.
- If they did well, say so warmly and directly — don't bury the good news.
- Only flag things that genuinely deserve attention.
- Specific vendor names and amounts, always.
- Max 5 anomaly explanations.
- No jargon. No filler. Short sentences.`;

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function vsRecent(period: number, rolling: number): string {
  if (rolling <= 0) return 'no history to compare against yet';
  const diff = period - rolling;
  const pct = Math.round(Math.abs((diff / rolling) * 100));
  if (pct < 10) return `about normal (recent avg ${fmt(rolling)})`;
  if (diff > 0) return `${pct}% more than recent average of ${fmt(rolling)}`;
  return `${pct}% less than recent average of ${fmt(rolling)}`;
}

function vsPrev(period: number, prevTotal: number | null): string {
  if (!prevTotal || prevTotal <= 0) return 'first report on record';
  const diff = period - prevTotal;
  const pct = Math.round(Math.abs((diff / prevTotal) * 100));
  if (pct < 5) return 'about the same as last period';
  if (diff > 0) return `up ${pct}% from last period (was ${fmt(prevTotal)})`;
  return `down ${pct}% from last period (was ${fmt(prevTotal)})`;
}

// ─── Main function ────────────────────────────────────────────────────────

export async function runPass2(
  uploadId: string,
  userId: string,
  supabase: SupabaseClient,
  documentType: 'expense_report' | 'bank_statement' = 'expense_report'
): Promise<Pass2Result> {
  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', userId)
    .single();
  if (uploadError || !upload) {
    console.error('[pass2] Upload fetch failed:', uploadError?.message);
    throw new Error(`Upload not found: ${uploadError?.message}`);
  }

  console.log('[pass2] Starting analysis for upload:', upload.filename);

  const [
    { data: allItems, error: itemsErr },
    { data: catStats, error: statsErr },
    { data: allVendors },
  ] = await Promise.all([
    supabase
      .from('line_items')
      .select('vendor, amount, category, subcategory, z_score, anomaly_severity, is_possible_duplicate, is_round_number, is_first_time_vendor')
      .eq('upload_id', uploadId)
      .order('amount', { ascending: false }),
    supabase
      .from('category_stats')
      .select('category, total_spend_period, pct_of_total_spend, mean_amount, rolling_avg_5, rolling_avg_alltime, trend_direction')
      .eq('upload_id', uploadId),
    supabase
      .from('vendors')
      .select('vendor_name, primary_category, total_spend, total_occurrences, recurrence_tier')
      .eq('user_id', userId)
      .order('total_spend', { ascending: false })
      .limit(20),
  ]);

  if (itemsErr) console.error('[pass2] line_items fetch error:', itemsErr.message);
  if (statsErr) console.error('[pass2] category_stats fetch error:', statsErr.message);

  console.log('[pass2] Data fetched — items:', allItems?.length, 'categories:', catStats?.length, 'vendors:', allVendors?.length);

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

  // ── Build plain-english context — no jargon keys ─────────────────────

  const spending_by_category = [...stats]
    .sort((a, b) => Number(b.total_spend_period ?? 0) - Number(a.total_spend_period ?? 0))
    .map((s) => {
      const period = Number(s.total_spend_period ?? 0);
      const rolling = Number(s.rolling_avg_5 ?? 0);
      const prev = prevCatStats.find((p) => p.category === s.category);
      const catAnomalies = items.filter(
        (i) => i.category === s.category && i.anomaly_severity !== 'none'
      ).length;

      return {
        category: s.category,
        spent_this_period: fmt(period),
        share_of_total: `${Number(s.pct_of_total_spend ?? 0).toFixed(1)}%`,
        vs_recent: vsRecent(period, rolling),
        vs_last_period: vsPrev(period, prev ? Number(prev.total_spend_period) : null),
        trend: s.trend_direction,
        notable_charges: catAnomalies > 0 ? `${catAnomalies} charge(s) worth reviewing` : 'nothing unusual',
      };
    });

  const flagged_transactions = anomalies.slice(0, 10).map((i) => {
    const reasons: string[] = [];
    if (i.is_possible_duplicate) reasons.push('same vendor and amount seen in another report recently — possible duplicate');
    if (i.is_first_time_vendor) reasons.push("first time seeing this vendor");
    if (i.is_round_number) reasons.push('exact round number — sometimes signals a manual entry or estimate');
    if (reasons.length === 0) {
      const z = Number(i.z_score ?? 0);
      const rolling = stats.find((s) => s.category === i.category);
      const avg = rolling ? fmt(Number(rolling.rolling_avg_5 ?? 0)) : null;
      if (z > 0 && avg) reasons.push(`higher than typical for ${i.category} (category avg around ${avg})`);
      else reasons.push(`unusual amount for ${i.category}`);
    }
    return {
      vendor: i.vendor,
      amount: fmt(Number(i.amount ?? 0)),
      category: i.category,
      why_flagged: reasons.join('; '),
    };
  });

  const possible_duplicates = duplicates.slice(0, 5).map((d) => ({
    vendor: d.vendor,
    amount: fmt(Number(d.amount ?? 0)),
    note: 'Same vendor and amount found in another upload within 7 days',
  }));

  const new_vendors_with_large_charges = firstTimeHighSpend.slice(0, 5).map((v) => ({
    vendor: v.vendor,
    amount: fmt(Number(v.amount ?? 0)),
    category: v.category,
    note: 'First time seeing this vendor — charge is higher than typical for this category',
  }));

  const round_number_charges = roundNumbers.slice(0, 3).map((r) => ({
    vendor: r.vendor,
    amount: fmt(Number(r.amount ?? 0)),
    note: 'Exact round number — worth confirming it was a real receipt',
  }));

  const categories_running_high = stats
    .filter((s) => {
      const period = Number(s.total_spend_period ?? 0);
      const rolling = Number(s.rolling_avg_5 ?? 0);
      return rolling > 0 && period > rolling * 1.25;
    })
    .map((s) => {
      const period = Number(s.total_spend_period ?? 0);
      const rolling = Number(s.rolling_avg_5 ?? 0);
      const pct = Math.round(((period - rolling) / rolling) * 100);
      return {
        category: s.category,
        spent: fmt(period),
        recent_average: fmt(rolling),
        how_much_higher: `${pct}% above recent average`,
      };
    });

  const vendorsByCategory: Record<string, string[]> = {};
  for (const v of vendors) {
    const cat = v.primary_category ?? 'Misc';
    if (!vendorsByCategory[cat]) vendorsByCategory[cat] = [];
    vendorsByCategory[cat].push(v.vendor_name);
  }
  const multiple_vendors_per_category = Object.entries(vendorsByCategory)
    .filter(([, vList]) => vList.length >= 3)
    .map(([category, vList]) => ({
      category,
      vendors_used: vList.slice(0, 5),
      note: `${vList.length} different vendors in this category`,
    }));

  const context = {
    report: {
      filename: upload.filename,
      total_spent: fmt(Number(upload.total_amount ?? 0)),
      transaction_count: Number(upload.line_item_count ?? 0),
      has_previous_history: prevCatStats.length > 0,
    },
    spending_by_category,
    flagged_transactions,
    possible_duplicates,
    new_vendors_with_large_charges,
    round_number_charges,
    categories_running_high,
    multiple_vendors_per_category,
    flags_summary: {
      total_flagged: anomalies.length,
      possible_duplicates: duplicates.length,
      new_vendors_flagged: firstTimeHighSpend.length,
      round_numbers: roundNumbers.length,
    },
  };

  const systemPrompt =
    documentType === 'bank_statement' ? SYSTEM_PROMPT_BANK_STATEMENT : SYSTEM_PROMPT_EXPENSE_REPORT;

  const input = `${systemPrompt}\n\nHere is the data:\n\n${JSON.stringify(context, null, 2)}`;

  console.log('[pass2] Sending to OpenAI — context size:', input.length, 'chars, doc type:', documentType);

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

  result.health_score = Math.max(1, Math.min(10, Math.round(result.health_score)));

  await supabase
    .from('uploads')
    .update({ pass2_status: 'complete', health_score: result.health_score, ai_analysis: result })
    .eq('id', uploadId);

  return result;
}

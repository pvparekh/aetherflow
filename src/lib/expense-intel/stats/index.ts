import type { SupabaseClient } from '@supabase/supabase-js';
import { computeCategoryAggregates } from './aggregates';
import { computeZScore, getAnomalySeverity } from './zscore';
import { computeTrendDirection, isSkewedByOutliers, computeCategoryDrift } from './trends';
import type { TrendDirection } from '../types';

export interface StatsResult {
  categoriesProcessed: string[];
  skewedCategories: string[];
  categoryDrift: {
    category: string;
    currentPct: number;
    historicalAvgPct: number;
    deltaPct: number;
  }[];
}

export async function computeAndWriteStats(
  uploadId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<StatsResult> {
  // 1. Fetch all line items for this upload
  const { data: items, error: itemsError } = await supabase
    .from('line_items')
    .select('id, amount, category')
    .eq('upload_id', uploadId);

  if (itemsError || !items) {
    throw new Error(`Failed to fetch line items: ${itemsError?.message}`);
  }

  // 2. Fetch this user's previous upload IDs (exclude current — it has no stats yet)
  const { data: prevUploads, error: prevError } = await supabase
    .from('uploads')
    .select('id')
    .eq('user_id', userId)
    .neq('id', uploadId);

  if (prevError) throw new Error(`Failed to fetch previous uploads: ${prevError.message}`);

  const prevUploadIds = (prevUploads ?? []).map((u) => u.id as string);

  // 3. Fetch historical category_stats scoped to this user, newest first
  let rawHistory: { category: string; total_spend_period: number; pct_of_total_spend: number }[] = [];
  if (prevUploadIds.length > 0) {
    const { data, error: historyError } = await supabase
      .from('category_stats')
      .select('category, total_spend_period, pct_of_total_spend')
      .in('upload_id', prevUploadIds)
      .order('computed_at', { ascending: false });
    if (historyError) throw new Error(`Failed to fetch category history: ${historyError.message}`);
    rawHistory = data ?? [];
  }

  // Group history by category for O(1) lookups
  const historyByCategory = new Map<string, { total: number; pct: number }[]>();
  for (const row of rawHistory) {
    const cat = row.category as string;
    if (!historyByCategory.has(cat)) historyByCategory.set(cat, []);
    historyByCategory.get(cat)!.push({
      total: Number(row.total_spend_period ?? 0),
      pct: Number(row.pct_of_total_spend ?? 0),
    });
  }

  // 3. Group current upload's items by category
  const byCategory = new Map<string, { id: string; amount: number }[]>();
  for (const item of items) {
    const cat = (item.category as string) ?? 'Misc';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ id: item.id as string, amount: Number(item.amount) });
  }

  const uploadTotal = items.reduce((sum, i) => sum + Number(i.amount), 0);

  const skewedCategories: string[] = [];
  const categoryDrift: StatsResult['categoryDrift'] = [];
  const statsRows: object[] = [];
  const lineItemUpdates: {
    id: string;
    z_score: number;
    is_anomaly: boolean;
    anomaly_severity: string;
  }[] = [];

  // 4. Compute per-category stats
  for (const [category, categoryItems] of byCategory) {
    const amounts = categoryItems.map((i) => i.amount);
    const agg = computeCategoryAggregates(amounts);

    // Z-scores for every item in this category
    for (const item of categoryItems) {
      const z = computeZScore(item.amount, agg.mean, agg.stdDev);
      const severity = getAnomalySeverity(z);
      lineItemUpdates.push({
        id: item.id,
        z_score: Math.round(z * 10000) / 10000,
        is_anomaly: severity !== 'none',
        anomaly_severity: severity,
      });
    }

    const history = historyByCategory.get(category) ?? [];
    const historicalTotals = history.map((h) => h.total);
    const historicalPcts = history.map((h) => h.pct);

    // Rolling averages: current upload + past uploads, newest first
    const allTotals = [agg.total, ...historicalTotals];
    const last5 = allTotals.slice(0, 5);
    const rolling_avg_5 = last5.reduce((s, v) => s + v, 0) / last5.length;
    const rolling_avg_alltime = allTotals.reduce((s, v) => s + v, 0) / allTotals.length;
    const total_spend_alltime = allTotals.reduce((s, v) => s + v, 0);

    // Trend: current + 2 most recent vs the 3 before those (6 total)
    const recentTotals = allTotals.slice(0, 3);
    const priorTotals = allTotals.slice(3, 6);
    const trend_direction: TrendDirection = computeTrendDirection(recentTotals, priorTotals);

    // Percentage of total spend for this upload
    const pct_of_total_spend = uploadTotal > 0 ? (agg.total / uploadTotal) * 100 : 0;

    // Skew detection
    if (isSkewedByOutliers(agg.mean, agg.median)) {
      skewedCategories.push(category);
    }

    // Category drift vs historical average pct
    if (historicalPcts.length > 0) {
      const historicalAvgPct = historicalPcts.reduce((s, v) => s + v, 0) / historicalPcts.length;
      const deltaPct = computeCategoryDrift(pct_of_total_spend, historicalAvgPct);
      if (Math.abs(deltaPct) > 15) {
        categoryDrift.push({
          category,
          currentPct: Math.round(pct_of_total_spend * 100) / 100,
          historicalAvgPct: Math.round(historicalAvgPct * 100) / 100,
          deltaPct: Math.round(deltaPct * 100) / 100,
        });
      }
    }

    statsRows.push({
      category,
      upload_id: uploadId,
      total_spend_period: Math.round(agg.total * 100) / 100,
      total_spend_alltime: Math.round(total_spend_alltime * 100) / 100,
      mean_amount: Math.round(agg.mean * 10000) / 10000,
      median_amount: Math.round(agg.median * 10000) / 10000,
      std_dev: Math.round(agg.stdDev * 10000) / 10000,
      rolling_avg_5: Math.round(rolling_avg_5 * 10000) / 10000,
      rolling_avg_alltime: Math.round(rolling_avg_alltime * 10000) / 10000,
      pct_of_total_spend: Math.round(pct_of_total_spend * 10000) / 10000,
      trend_direction,
    });
  }

  // 5. Write category_stats rows
  if (statsRows.length > 0) {
    const { error: statsError } = await supabase.from('category_stats').insert(statsRows);
    if (statsError) throw new Error(`Failed to write category_stats: ${statsError.message}`);
  }

  // 6. Write z_score + anomaly back to line_items — all in parallel
  await Promise.all(
    lineItemUpdates.map((u) =>
      supabase
        .from('line_items')
        .update({
          z_score: u.z_score,
          is_anomaly: u.is_anomaly,
          anomaly_severity: u.anomaly_severity,
        })
        .eq('id', u.id)
    )
  );

  const categories = [...byCategory.keys()];
  console.log(
    `[stats] upload=${uploadId} categories=[${categories.join(', ')}]` +
      (skewedCategories.length ? ` skewed=[${skewedCategories.join(', ')}]` : '') +
      (categoryDrift.length ? ` drift=[${categoryDrift.map((d) => d.category).join(', ')}]` : '')
  );

  return { categoriesProcessed: categories, skewedCategories, categoryDrift };
}

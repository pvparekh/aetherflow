import type { SupabaseClient } from '@supabase/supabase-js';
import { median, medianAbsoluteDeviation, madZScore } from '../stats/aggregates';
import type { Flag, RecurrenceTier } from '../types';
import type { StatsResult } from '../stats';

interface VendorLineItem {
  id: string;
  vendor: string;
  amount: number;
  transaction_date: string | null;
  category: string;
  subcategory: string | null;
  z_score: number | null;
}

interface ConsolidationOpportunity {
  category: string;
  subcategory: string;
  vendors: string[];
  totalSpend: number;
}

interface ParetoEntry {
  vendor: string;
  amount: number;
  cumulativePct: number;
}

export interface VendorResult {
  firstTimeVendors: string[];
  possibleDuplicates: { vendor: string; amount: number; ids: string[] }[];
  consolidationOpportunities: ConsolidationOpportunity[];
  paretoByCategory: Record<string, ParetoEntry[]>;
  flags: Flag[];
}

function getRecurrenceTier(occurrences: number): RecurrenceTier {
  if (occurrences >= 10) return 'core';
  if (occurrences >= 5) return 'regular';
  if (occurrences >= 2) return 'occasional';
  return 'one_time';
}

function tierRank(tier: RecurrenceTier): number {
  return { one_time: 1, occasional: 2, regular: 3, core: 4 }[tier];
}

function isRoundNumber(amount: number): boolean {
  return amount >= 100 && amount % 50 === 0;
}

function daysApart(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

function effectiveZ(
  item: VendorLineItem,
  skewedCategories: string[],
  madByCategory: Map<string, { med: number; mad: number }>
): number {
  if (skewedCategories.includes(item.category)) {
    const madData = madByCategory.get(item.category);
    if (madData && madData.mad > 0) {
      return madZScore(item.amount, madData.med, madData.mad);
    }
  }
  return item.z_score ?? 0;
}

export async function runVendorIntelligence(
  uploadId: string,
  userId: string,
  supabase: SupabaseClient,
  statsResult: StatsResult
): Promise<VendorResult> {
  const { skewedCategories, categoryDrift } = statsResult;

  const { data: rawItems, error: itemsError } = await supabase
    .from('line_items')
    .select('id, vendor, amount, transaction_date, category, subcategory, z_score')
    .eq('upload_id', uploadId);

  if (itemsError || !rawItems) throw new Error(`Failed to fetch line items: ${itemsError?.message}`);

  const items: VendorLineItem[] = rawItems.map((r) => ({
    id: r.id as string,
    vendor: (r.vendor ?? '') as string,
    amount: Number(r.amount),
    transaction_date: r.transaction_date as string | null,
    category: (r.category ?? 'Misc') as string,
    subcategory: r.subcategory as string | null,
    z_score: r.z_score != null ? Number(r.z_score) : null,
  }));

  const madByCategory = new Map<string, { med: number; mad: number }>();
  for (const cat of skewedCategories) {
    const amounts = items.filter((i) => i.category === cat).map((i) => i.amount);
    if (amounts.length > 0) {
      madByCategory.set(cat, { med: median(amounts), mad: medianAbsoluteDeviation(amounts) });
    }
  }

  const vendorNames = [...new Set(items.map((i) => i.vendor).filter(Boolean))];
  const { data: existingVendors } = await supabase
    .from('vendors')
    .select('vendor_name, total_occurrences, total_spend, avg_amount, recurrence_tier, first_seen_upload_id')
    .eq('user_id', userId)
    .in('vendor_name', vendorNames);

  const existingMap = new Map(
    (existingVendors ?? []).map((v) => [v.vendor_name as string, v])
  );
  const newVendorNames = new Set(vendorNames.filter((n) => !existingMap.has(n)));

  const roundNumberIds = new Set(items.filter((i) => isRoundNumber(i.amount)).map((i) => i.id));

  const duplicateIds = new Set<string>();
  const duplicateGroups: VendorResult['possibleDuplicates'] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.vendor !== b.vendor || a.amount !== b.amount) continue;
      const isDupe =
        a.transaction_date && b.transaction_date
          ? daysApart(a.transaction_date, b.transaction_date) <= 7
          : true;
      if (isDupe) {
        duplicateIds.add(a.id);
        duplicateIds.add(b.id);
        const existing = duplicateGroups.find((g) => g.vendor === a.vendor && g.amount === a.amount);
        if (existing) {
          if (!existing.ids.includes(a.id)) existing.ids.push(a.id);
          if (!existing.ids.includes(b.id)) existing.ids.push(b.id);
        } else {
          duplicateGroups.push({ vendor: a.vendor, amount: a.amount, ids: [a.id, b.id] });
        }
      }
    }
  }

  const { data: prevUploads } = await supabase
    .from('uploads')
    .select('id')
    .eq('user_id', userId)
    .neq('id', uploadId);

  const prevIds = (prevUploads ?? []).map((u) => u.id as string);

  if (prevIds.length > 0) {
    const datedItems = items.filter((i) => i.transaction_date);
    if (datedItems.length > 0) {
      const { data: historical } = await supabase
        .from('line_items')
        .select('id, vendor, amount, transaction_date')
        .in('upload_id', prevIds)
        .in('vendor', vendorNames)
        .not('transaction_date', 'is', null);

      for (const item of datedItems) {
        const matches = (historical ?? []).filter(
          (h) =>
            h.vendor === item.vendor &&
            Number(h.amount) === item.amount &&
            daysApart(item.transaction_date!, h.transaction_date as string) <= 7
        );
        if (matches.length > 0) {
          duplicateIds.add(item.id);
          const existing = duplicateGroups.find(
            (g) => g.vendor === item.vendor && g.amount === item.amount
          );
          if (existing) {
            if (!existing.ids.includes(item.id)) existing.ids.push(item.id);
          } else {
            duplicateGroups.push({
              vendor: item.vendor,
              amount: item.amount,
              ids: [item.id, ...matches.map((m) => m.id as string)],
            });
          }
        }
      }
    }
  }

  await Promise.all(
    items.map((item) =>
      supabase
        .from('line_items')
        .update({
          is_first_time_vendor: newVendorNames.has(item.vendor),
          is_round_number: roundNumberIds.has(item.id),
          is_possible_duplicate: duplicateIds.has(item.id),
        })
        .eq('id', item.id)
    )
  );

  const vendorGroups = new Map<
    string,
    { items: VendorLineItem[]; totalSpend: number; count: number }
  >();
  for (const item of items) {
    if (!vendorGroups.has(item.vendor)) vendorGroups.set(item.vendor, { items: [], totalSpend: 0, count: 0 });
    const g = vendorGroups.get(item.vendor)!;
    g.items.push(item);
    g.totalSpend += item.amount;
    g.count++;
  }

  const tierUpgradeFlags: Flag[] = [];
  const vendorUpserts = [];

  for (const [vendorName, group] of vendorGroups) {
    const existing = existingMap.get(vendorName);
    const prevOccurrences = existing ? Number(existing.total_occurrences) : 0;
    const prevSpend = existing ? Number(existing.total_spend) : 0;
    const newOccurrences = prevOccurrences + group.count;
    const newTotalSpend = prevSpend + group.totalSpend;
    const newAvg = newTotalSpend / newOccurrences;
    const newTier = getRecurrenceTier(newOccurrences);

    if (existing) {
      const oldTier = existing.recurrence_tier as RecurrenceTier;
      const oldAvg = Number(existing.avg_amount ?? 0);
      if (tierRank(newTier) > tierRank(oldTier) && oldAvg > 0 && newAvg > oldAvg * 1.1) {
        const pctIncrease = (((newAvg - oldAvg) / oldAvg) * 100).toFixed(1);
        tierUpgradeFlags.push({
          severity: 'warning',
          flag_type: 'statistical',
          title: 'Recurring Vendor: Price Increase',
          description: `${vendorName} upgraded to "${newTier}" tier. Average spend rose from $${oldAvg.toFixed(2)} to $${newAvg.toFixed(2)} (+${pctIncrease}%) — review for contract renegotiation.`,
          metric: `avg +${pctIncrease}%, ${oldTier} → ${newTier}`,
          vendor: vendorName,
          amount: newAvg,
          z_score: null,
          category: group.items[0].category,
          related_line_item_ids: group.items.map((i) => i.id),
        });
      }
    }

    const catSpend = new Map<string, number>();
    for (const item of group.items) {
      catSpend.set(item.category, (catSpend.get(item.category) ?? 0) + item.amount);
    }
    const primaryCategory = [...catSpend.entries()].sort((a, b) => b[1] - a[1])[0][0];

    vendorUpserts.push({
      vendor_name: vendorName,
      user_id: userId,
      first_seen_upload_id: existing?.first_seen_upload_id ?? uploadId,
      last_seen_upload_id: uploadId,
      total_occurrences: newOccurrences,
      total_spend: Math.round(newTotalSpend * 100) / 100,
      avg_amount: Math.round(newAvg * 100) / 100,
      recurrence_tier: newTier,
      primary_category: primaryCategory,
    });
  }

  if (vendorUpserts.length > 0) {
    const { error: upsertError } = await supabase
      .from('vendors')
      .upsert(vendorUpserts, { onConflict: 'vendor_name,user_id' });
    if (upsertError) throw new Error(`Failed to upsert vendors: ${upsertError.message}`);
  }

  const paretoByCategory: Record<string, ParetoEntry[]> = {};
  const byCat = new Map<string, VendorLineItem[]>();
  for (const item of items) {
    if (!byCat.has(item.category)) byCat.set(item.category, []);
    byCat.get(item.category)!.push(item);
  }
  for (const [cat, catItems] of byCat) {
    const total = catItems.reduce((s, i) => s + i.amount, 0);
    const vendorTotals = new Map<string, number>();
    for (const item of catItems) {
      vendorTotals.set(item.vendor, (vendorTotals.get(item.vendor) ?? 0) + item.amount);
    }
    const sorted = [...vendorTotals.entries()].sort((a, b) => b[1] - a[1]);
    let cumulative = 0;
    const pareto: ParetoEntry[] = [];
    for (const [vendor, amount] of sorted) {
      cumulative += amount;
      pareto.push({ vendor, amount: Math.round(amount * 100) / 100, cumulativePct: Math.round((cumulative / total) * 10000) / 100 });
      if (cumulative / total >= 0.8) break;
    }
    paretoByCategory[cat] = pareto;
  }

  const subcatMap = new Map<string, { vendors: Set<string>; spend: number; category: string }>();
  for (const item of items) {
    if (!item.subcategory) continue;
    const key = `${item.category}::${item.subcategory}`;
    if (!subcatMap.has(key)) subcatMap.set(key, { vendors: new Set(), spend: 0, category: item.category });
    const e = subcatMap.get(key)!;
    e.vendors.add(item.vendor);
    e.spend += item.amount;
  }
  const consolidationOpportunities: ConsolidationOpportunity[] = [];
  for (const [key, e] of subcatMap) {
    if (e.vendors.size >= 3) {
      const [, subcategory] = key.split('::');
      consolidationOpportunities.push({ category: e.category, subcategory, vendors: [...e.vendors], totalSpend: Math.round(e.spend * 100) / 100 });
    }
  }

  const flags: Flag[] = [];

  for (const item of items) {
    const ez = effectiveZ(item, skewedCategories, madByCategory);
    const absEZ = Math.abs(ez);
    const isSKewed = skewedCategories.includes(item.category);
    const madNote = isSKewed ? ' (MAD-adjusted)' : '';

    if (duplicateIds.has(item.id)) {
      flags.push({
        severity: 'critical',
        flag_type: 'duplicate',
        title: 'Possible Duplicate Charge',
        description: `${item.vendor}: $${item.amount.toFixed(2)} appears more than once within a 7-day window.`,
        metric: `$${item.amount.toFixed(2)}`,
        vendor: item.vendor,
        amount: item.amount,
        z_score: item.z_score,
        category: item.category,
        related_line_item_ids: [item.id],
      });
      continue;
    }

    if (roundNumberIds.has(item.id) && item.amount >= 500 && absEZ > 1) {
      flags.push({
        severity: 'critical',
        flag_type: 'round_number',
        title: 'Round Number Outlier',
        description: `${item.vendor}: $${item.amount.toFixed(2)} is a round number ≥$500 and ${absEZ.toFixed(1)}σ above the ${item.category} baseline.`,
        metric: `z=${ez.toFixed(2)}, $${item.amount.toFixed(2)}${madNote}`,
        vendor: item.vendor,
        amount: item.amount,
        z_score: ez,
        category: item.category,
        related_line_item_ids: [item.id],
      });
      continue;
    }

    if (newVendorNames.has(item.vendor) && absEZ > 1.5) {
      flags.push({
        severity: 'warning',
        flag_type: 'first_time',
        title: 'Unknown Vendor: Unusual Amount',
        description: `${item.vendor}: $${item.amount.toFixed(2)} is a first-time vendor and ${absEZ.toFixed(1)}σ above the ${item.category} baseline.`,
        metric: `z=${ez.toFixed(2)}, first-time vendor${madNote}`,
        vendor: item.vendor,
        amount: item.amount,
        z_score: ez,
        category: item.category,
        related_line_item_ids: [item.id],
      });
      continue;
    }

    if (absEZ > 2) {
      flags.push({
        severity: absEZ >= 2.5 ? 'critical' : 'warning',
        flag_type: 'statistical',
        title: 'Statistical Outlier',
        description: `${item.vendor}: $${item.amount.toFixed(2)} is ${absEZ.toFixed(1)}σ ${ez > 0 ? 'above' : 'below'} the ${item.category} mean${madNote}.`,
        metric: `z=${ez.toFixed(2)}`,
        vendor: item.vendor,
        amount: item.amount,
        z_score: ez,
        category: item.category,
        related_line_item_ids: [item.id],
      });
      continue;
    }

    if (newVendorNames.has(item.vendor)) {
      flags.push({
        severity: 'info',
        flag_type: 'first_time',
        title: 'First-Time Vendor',
        description: `${item.vendor}: $${item.amount.toFixed(2)} in ${item.category} — first appearance in your records.`,
        metric: `$${item.amount.toFixed(2)}, first-time`,
        vendor: item.vendor,
        amount: item.amount,
        z_score: item.z_score,
        category: item.category,
        related_line_item_ids: [item.id],
      });
    }
  }

  for (const drift of categoryDrift) {
    const direction = drift.deltaPct > 0 ? 'above' : 'below';
    flags.push({
      severity: Math.abs(drift.deltaPct) > 25 ? 'critical' : 'warning',
      flag_type: 'statistical',
      title: `Category Spend Drift: ${drift.category}`,
      description: `${drift.category}: ${Math.abs(drift.deltaPct).toFixed(1)}pp ${direction} its historical avg share (${drift.currentPct.toFixed(1)}% this upload vs ${drift.historicalAvgPct.toFixed(1)}% avg).`,
      metric: `${drift.deltaPct > 0 ? '+' : ''}${drift.deltaPct.toFixed(1)}pp vs rolling avg`,
      vendor: drift.category,
      amount: 0,
      z_score: null,
      category: drift.category,
      related_line_item_ids: items.filter((i) => i.category === drift.category).map((i) => i.id),
    });
  }

  for (const opp of consolidationOpportunities) {
    const top3 = opp.vendors.slice(0, 3).join(', ');
    const more = opp.vendors.length > 3 ? ` +${opp.vendors.length - 3} more` : '';
    flags.push({
      severity: 'info',
      flag_type: 'statistical',
      title: 'Vendor Consolidation Opportunity',
      description: `${opp.category} / ${opp.subcategory}: ${opp.vendors.length} vendors (${top3}${more}) share $${opp.totalSpend.toFixed(2)}.`,
      metric: `${opp.vendors.length} vendors, $${opp.totalSpend.toFixed(2)}`,
      vendor: opp.category,
      amount: opp.totalSpend,
      z_score: null,
      category: opp.category,
      related_line_item_ids: items
        .filter((i) => i.category === opp.category && i.subcategory === opp.subcategory)
        .map((i) => i.id),
    });
  }

  flags.push(...tierUpgradeFlags);

  console.log(
    `[vendors] upload=${uploadId} new=${newVendorNames.size} dupes=${duplicateIds.size} ` +
      `roundNums=${roundNumberIds.size} consolidation=${consolidationOpportunities.length} flags=${flags.length}`
  );

  return { firstTimeVendors: [...newVendorNames], possibleDuplicates: duplicateGroups, consolidationOpportunities, paretoByCategory, flags };
}

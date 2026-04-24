import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../../utils/supabase/service';
import type { Flag, FlagType, Pass2Result, DuplicateContext } from '@/lib/expense-intel/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .single();

  if (uploadError || !upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  const [
    { data: lineItems },
    { data: catStats },
    { data: vendors },
    { data: latestUploadMeta },
    { data: allUserUploads },
  ] = await Promise.all([
    supabase
      .from('line_items')
      .select('*')
      .eq('upload_id', uploadId)
      .order('amount', { ascending: false }),
    supabase.from('category_stats').select('*').eq('upload_id', uploadId),
    supabase.from('vendors').select('*').eq('user_id', user.id),
    supabase
      .from('uploads')
      .select('id')
      .eq('user_id', user.id)
      .eq('pass1_status', 'complete')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('uploads')
      .select('id, uploaded_at')
      .eq('user_id', user.id)
      .eq('pass1_status', 'complete'),
  ]);

  // Merge latest rolling averages when viewing an older upload
  let mergedCatStats = catStats ?? [];
  if (latestUploadMeta && latestUploadMeta.id !== uploadId) {
    const { data: latestStats } = await supabase
      .from('category_stats')
      .select('category, rolling_avg_5, rolling_avg_alltime, std_dev, trend_direction, total_spend_alltime')
      .eq('upload_id', latestUploadMeta.id);

    if (latestStats && latestStats.length > 0) {
      const latestMap = new Map(latestStats.map((s) => [s.category as string, s]));
      mergedCatStats = mergedCatStats.map((s) => {
        const latest = latestMap.get(s.category as string);
        if (!latest) return s;
        return {
          ...s,
          rolling_avg_5: latest.rolling_avg_5,
          std_dev: latest.std_dev,
          trend_direction: latest.trend_direction,
          rolling_avg_alltime: latest.rolling_avg_alltime,
          total_spend_alltime: latest.total_spend_alltime,
        };
      });
    }
  }

  // Resolve vendor dates from upload date map
  const uploadDateMap = new Map(
    (allUserUploads ?? []).map((u) => [u.id as string, u.uploaded_at as string])
  );
  const vendorsWithDates = (vendors ?? []).map((v) => ({
    ...v,
    last_seen_at: uploadDateMap.get(v.last_seen_upload_id as string) ?? null,
    first_seen_at: uploadDateMap.get(v.first_seen_upload_id as string) ?? null,
  }));

  // Historical category totals for rolling avg chart (last 5 prior uploads)
  const { data: prevUploads } = await supabase
    .from('uploads')
    .select('id, uploaded_at')
    .eq('user_id', user.id)
    .neq('id', uploadId)
    .order('uploaded_at', { ascending: false })
    .limit(5);

  type HistoryPoint = { uploaded_at: string; total: number };
  const categoryHistory: { category: string; points: HistoryPoint[] }[] = [];

  if (prevUploads && prevUploads.length > 0) {
    const prevIds = prevUploads.map((u) => u.id as string);
    const { data: histStats } = await supabase
      .from('category_stats')
      .select('category, total_spend_period, upload_id')
      .in('upload_id', prevIds);

    if (histStats) {
      const categories = new Set((catStats ?? []).map((s) => s.category as string));
      const prevUploadDateMap = new Map(prevUploads.map((u) => [u.id as string, u.uploaded_at as string]));

      for (const cat of categories) {
        const points = histStats
          .filter((s) => s.category === cat)
          .map((s) => ({
            uploaded_at: prevUploadDateMap.get(s.upload_id as string) ?? '',
            total: Number(s.total_spend_period),
          }))
          .sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());

        if (points.length > 0) {
          categoryHistory.push({ category: cat, points });
        }
      }
    }
  }

  // Find duplicate-match context for each possibly-duplicated line item
  const duplicateItems = (lineItems ?? []).filter((i) => i.is_possible_duplicate);
  const duplicateContextMap = new Map<string, DuplicateContext>();

  if (duplicateItems.length > 0) {
    const otherUploadIds = (allUserUploads ?? [])
      .map((u) => u.id as string)
      .filter((id) => id !== uploadId);

    if (otherUploadIds.length > 0) {
      const vendorNames = [
        ...new Set(duplicateItems.map((i) => i.vendor as string).filter(Boolean)),
      ];

      const [{ data: otherUploads }, { data: matchingItems }] = await Promise.all([
        supabase.from('uploads').select('id, filename').in('id', otherUploadIds),
        vendorNames.length > 0
          ? supabase
              .from('line_items')
              .select('id, vendor, amount, transaction_date, upload_id')
              .in('upload_id', otherUploadIds)
              .in('vendor', vendorNames)
          : Promise.resolve({ data: [] }),
      ]);

      const otherFilenameMap = new Map(
        (otherUploads ?? []).map((u) => [u.id as string, u.filename as string])
      );

      for (const dupItem of duplicateItems) {
        const match = (matchingItems ?? []).find(
          (m) =>
            m.vendor === dupItem.vendor &&
            Math.abs(Number(m.amount) - Number(dupItem.amount)) < 0.01
        );
        if (match) {
          duplicateContextMap.set(dupItem.id as string, {
            this_entry: {
              filename: upload.filename as string,
              transaction_date: dupItem.transaction_date as string | null,
              amount: Number(dupItem.amount),
            },
            match: {
              filename: otherFilenameMap.get(match.upload_id as string) ?? 'Unknown file',
              transaction_date: match.transaction_date as string | null,
              amount: Number(match.amount),
            },
          });
        }
      }
    }
  }

  // Build flags from line items
  const flags: Flag[] = [];
  for (const item of lineItems ?? []) {
    const vendor = String(item.vendor ?? 'Unknown');
    const amount = Number(item.amount ?? 0);
    const category = String(item.category ?? 'Misc');
    const z = Number(item.z_score ?? 0);

    if (item.is_possible_duplicate) {
      flags.push({
        severity: 'critical',
        flag_type: 'duplicate' as FlagType,
        title: 'Possible Duplicate Charge',
        description: `${vendor} charged $${amount.toFixed(2)} — appears to be a duplicate transaction within a 7-day window.`,
        metric: `$${amount.toFixed(2)}`,
        vendor,
        amount,
        z_score: item.z_score != null ? Number(item.z_score) : null,
        category,
        related_line_item_ids: [item.id as string],
        duplicate_context: duplicateContextMap.get(item.id as string),
      });
      continue;
    }

    if (item.is_round_number && (item.anomaly_severity === 'high' || item.anomaly_severity === 'medium')) {
      flags.push({
        severity: item.anomaly_severity === 'high' ? 'critical' : 'warning',
        flag_type: 'round_number' as FlagType,
        title: 'Round Number Anomaly',
        description: `${vendor} charged a round $${amount.toFixed(2)} — ${z > 0 ? `${z.toFixed(1)}σ above` : `${Math.abs(z).toFixed(1)}σ below`} the ${category} baseline.`,
        metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)})`,
        vendor,
        amount,
        z_score: z,
        category,
        related_line_item_ids: [item.id as string],
      });
      continue;
    }

    if (item.is_first_time_vendor && (item.anomaly_severity === 'high' || item.anomaly_severity === 'medium')) {
      flags.push({
        severity: 'warning',
        flag_type: 'first_time' as FlagType,
        title: 'First-Time Vendor: Unusual Amount',
        description: `First time seeing ${vendor}. Amount of $${amount.toFixed(2)} is ${z.toFixed(1)}σ above the ${category} baseline.`,
        metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)}, first-time)`,
        vendor,
        amount,
        z_score: z,
        category,
        related_line_item_ids: [item.id as string],
      });
      continue;
    }

    if (!item.is_possible_duplicate && !item.is_round_number && !item.is_first_time_vendor) {
      if (item.anomaly_severity === 'high') {
        flags.push({
          severity: 'critical',
          flag_type: 'statistical' as FlagType,
          title: 'Statistical Anomaly',
          description: `${vendor} at $${amount.toFixed(2)} is far above the ${category} baseline (z=${z.toFixed(1)}).`,
          metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)})`,
          vendor,
          amount,
          z_score: z,
          category,
          related_line_item_ids: [item.id as string],
        });
      } else if (item.anomaly_severity === 'medium') {
        flags.push({
          severity: 'warning',
          flag_type: 'statistical' as FlagType,
          title: 'Statistical Anomaly',
          description: `${vendor} at $${amount.toFixed(2)} is above the ${category} mean (z=${z.toFixed(1)}).`,
          metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)})`,
          vendor,
          amount,
          z_score: z,
          category,
          related_line_item_ids: [item.id as string],
        });
      }
    }
  }

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  flags.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  const pass2 =
    upload.ai_analysis && upload.pass2_status === 'complete'
      ? (upload.ai_analysis as Pass2Result)
      : null;

  return NextResponse.json({
    upload,
    line_items: lineItems ?? [],
    category_stats: mergedCatStats,
    category_history: categoryHistory,
    vendors: vendorsWithDates,
    flags,
    pass2,
  });
}

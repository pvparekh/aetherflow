import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // All completed uploads for this user
  const { data: userUploads } = await supabase
    .from('uploads')
    .select('id, health_score, pass2_status, uploaded_at')
    .eq('user_id', user.id)
    .eq('pass1_status', 'complete')
    .order('uploaded_at', { ascending: true });

  const uploadIds = (userUploads ?? []).map((u) => u.id as string);
  const uploadDateMap = new Map(
    (userUploads ?? []).map((u) => [u.id as string, u.uploaded_at as string])
  );

  // Latest upload for current all-time stats
  const latestUploadId = uploadIds[uploadIds.length - 1] ?? null;

  const [
    categoryTotalsResult,
    topVendorsResult,
    allVendorsResult,
    anomalyCountResult,
    allCatStatsResult,
  ] = await Promise.all([
    latestUploadId
      ? supabase
          .from('category_stats')
          .select('category, total_spend_alltime, rolling_avg_5, std_dev, trend_direction')
          .eq('upload_id', latestUploadId)
          .order('total_spend_alltime', { ascending: false })
      : Promise.resolve({ data: [] }),

    supabase
      .from('vendors')
      .select('id, vendor_name, total_spend, total_occurrences, avg_amount, primary_category, recurrence_tier, first_seen_upload_id, last_seen_upload_id')
      .eq('user_id', user.id)
      .order('total_spend', { ascending: false })
      .limit(20),

    supabase
      .from('vendors')
      .select('vendor_name, total_spend, total_occurrences, avg_amount, primary_category, recurrence_tier, first_seen_upload_id, last_seen_upload_id')
      .eq('user_id', user.id)
      .order('total_spend', { ascending: false })
      .limit(20),

    uploadIds.length > 0
      ? supabase
          .from('line_items')
          .select('id', { count: 'exact', head: true })
          .in('upload_id', uploadIds)
          .neq('anomaly_severity', 'none')
      : Promise.resolve({ count: 0 }),

    uploadIds.length > 0
      ? supabase
          .from('category_stats')
          .select('category, total_spend_period, upload_id')
          .in('upload_id', uploadIds)
      : Promise.resolve({ data: [] }),
  ]);

  void topVendorsResult;

  // Resolve vendor dates
  const vendorsWithDates = (allVendorsResult.data ?? []).map((v) => ({
    ...v,
    last_seen_at: uploadDateMap.get(v.last_seen_upload_id as string) ?? null,
    first_seen_at: uploadDateMap.get(v.first_seen_upload_id as string) ?? null,
  }));

  // Build category history for trend chart
  const catHistoryMap = new Map<string, { uploaded_at: string; total: number }[]>();
  for (const stat of allCatStatsResult.data ?? []) {
    const date = uploadDateMap.get(stat.upload_id as string) ?? '';
    if (!date) continue;
    const cat = stat.category as string;
    if (!catHistoryMap.has(cat)) catHistoryMap.set(cat, []);
    catHistoryMap.get(cat)!.push({ uploaded_at: date, total: Number(stat.total_spend_period) });
  }
  const category_history = Array.from(catHistoryMap.entries()).map(([category, points]) => ({
    category,
    points: points.sort(
      (a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
    ),
  }));

  // Health score average
  const scoredUploads = (userUploads ?? []).filter(
    (u) => u.pass2_status === 'complete' && u.health_score != null
  );
  const avgHealthScore =
    scoredUploads.length > 0
      ? Math.round(
          scoredUploads.reduce((sum, u) => sum + Number(u.health_score ?? 0), 0) /
            scoredUploads.length
        )
      : null;

  return NextResponse.json({
    category_totals: categoryTotalsResult.data ?? [],
    top_vendors: vendorsWithDates,
    category_history,
    total_anomalies: anomalyCountResult.count ?? 0,
    avg_health_score: avgHealthScore,
    total_uploads: uploadIds.length,
  });
}

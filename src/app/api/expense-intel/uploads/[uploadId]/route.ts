import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

function recurrenceTier(count: number): string {
  if (count >= 10) return 'core';
  if (count >= 5) return 'regular';
  if (count >= 2) return 'occasional';
  return 'one_time';
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = user.id;

  const supabase = createServiceClient();

  const { data: upload, error: fetchError } = await supabase
    .from('uploads')
    .select('id')
    .eq('id', uploadId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  // Null out vendor FK references before deleting the upload row
  await Promise.all([
    supabase.from('vendors').update({ first_seen_upload_id: null }).eq('first_seen_upload_id', uploadId),
    supabase.from('vendors').update({ last_seen_upload_id: null }).eq('last_seen_upload_id', uploadId),
  ]);

  // Delete child rows and the upload record
  const [{ error: liError }, { error: csError }] = await Promise.all([
    supabase.from('line_items').delete().eq('upload_id', uploadId),
    supabase.from('category_stats').delete().eq('upload_id', uploadId),
  ]);
  if (liError) return NextResponse.json({ error: `Failed to delete line items: ${liError.message}` }, { status: 500 });
  if (csError) return NextResponse.json({ error: `Failed to delete category stats: ${csError.message}` }, { status: 500 });

  const { error: uploadError } = await supabase.from('uploads').delete().eq('id', uploadId);
  if (uploadError) return NextResponse.json({ error: `Failed to delete upload: ${uploadError.message}` }, { status: 500 });

  // ── Remaining uploads for this user (after deletion) ─────────────────────
  const { data: remainingUploads } = await supabase
    .from('uploads')
    .select('id, uploaded_at')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  const remainingIds = (remainingUploads ?? []).map((u) => u.id as string);

  // ── Rebuild vendor table from scratch for this user ──────────────────────
  // Wipe every vendor row for this user, then re-derive from remaining line_items.
  // This guarantees no stale data regardless of name normalization or previous errors.
  await supabase.from('vendors').delete().eq('user_id', userId);

  if (remainingIds.length > 0) {
    const { data: allItems } = await supabase
      .from('line_items')
      .select('vendor, amount, category, upload_id')
      .in('upload_id', remainingIds);

    if (allItems && allItems.length > 0) {
      const uploadDateMap = new Map(
        (remainingUploads ?? []).map((u) => [u.id as string, u.uploaded_at as string])
      );

      const vendorMap = new Map<string, {
        totalSpend: number;
        count: number;
        catSpend: Map<string, number>;
        uploadIds: Set<string>;
      }>();

      for (const item of allItems) {
        const vendor = (item.vendor as string | null)?.trim();
        if (!vendor) continue;
        if (!vendorMap.has(vendor)) {
          vendorMap.set(vendor, { totalSpend: 0, count: 0, catSpend: new Map(), uploadIds: new Set() });
        }
        const g = vendorMap.get(vendor)!;
        g.totalSpend += Number(item.amount ?? 0);
        g.count++;
        g.uploadIds.add(item.upload_id as string);
        const cat = (item.category as string) ?? 'Misc';
        g.catSpend.set(cat, (g.catSpend.get(cat) ?? 0) + Number(item.amount ?? 0));
      }

      const vendorRows = [...vendorMap.entries()].map(([vendorName, stats]) => {
        const primaryCategory = [...stats.catSpend.entries()].sort((a, b) => b[1] - a[1])[0][0];

        const sortedUploads = [...stats.uploadIds]
          .map((id) => ({ id, date: uploadDateMap.get(id) ?? '' }))
          .filter((u) => u.date)
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          vendor_name: vendorName,
          user_id: userId,
          total_spend: Math.round(stats.totalSpend * 100) / 100,
          total_occurrences: stats.count,
          avg_amount: Math.round((stats.totalSpend / stats.count) * 100) / 100,
          recurrence_tier: recurrenceTier(stats.count),
          primary_category: primaryCategory,
          first_seen_upload_id: sortedUploads[0]?.id ?? null,
          last_seen_upload_id: sortedUploads[sortedUploads.length - 1]?.id ?? null,
        };
      });

      if (vendorRows.length > 0) {
        const { error: vendorInsertError } = await supabase.from('vendors').insert(vendorRows);
        if (vendorInsertError) {
          console.error('[delete] vendor rebuild failed:', vendorInsertError.message);
        }
      }
    }
  }

  // ── Recalculate rolling averages for the latest remaining upload ──────────
  const latestId = remainingIds[0] ?? null;
  if (latestId) {
    const prevIds = remainingIds.slice(1);

    const { data: latestItems } = await supabase
      .from('line_items')
      .select('category, amount')
      .eq('upload_id', latestId);

    const catTotals = new Map<string, number>();
    for (const item of latestItems ?? []) {
      const cat = (item.category as string) ?? 'Misc';
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + Number(item.amount ?? 0));
    }

    let histStats: { category: string; total_spend_period: number }[] = [];
    if (prevIds.length > 0) {
      const { data } = await supabase
        .from('category_stats')
        .select('category, total_spend_period')
        .in('upload_id', prevIds);
      histStats = data ?? [];
    }

    const histByCategory = new Map<string, number[]>();
    for (const s of histStats) {
      const cat = s.category as string;
      if (!histByCategory.has(cat)) histByCategory.set(cat, []);
      histByCategory.get(cat)!.push(Number(s.total_spend_period));
    }

    await Promise.all(
      [...catTotals.entries()].map(([category, currentTotal]) => {
        const history = histByCategory.get(category) ?? [];
        const allTotals = [currentTotal, ...history];
        const last5 = allTotals.slice(0, 5);
        const rolling_avg_5 = last5.reduce((s, v) => s + v, 0) / last5.length;
        const rolling_avg_alltime = allTotals.reduce((s, v) => s + v, 0) / allTotals.length;
        const total_spend_alltime = allTotals.reduce((s, v) => s + v, 0);
        return supabase.from('category_stats').update({
          rolling_avg_5: Math.round(rolling_avg_5 * 10000) / 10000,
          rolling_avg_alltime: Math.round(rolling_avg_alltime * 10000) / 10000,
          total_spend_alltime: Math.round(total_spend_alltime * 100) / 100,
        }).eq('upload_id', latestId).eq('category', category);
      })
    );
  }

  return NextResponse.json({ deleted: uploadId });
}

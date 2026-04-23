import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../../utils/supabase/service';
import type { Flag, Pass2Result } from '@/lib/expense-intel/types';

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

  const [{ data: lineItems }, { data: catStats }, { data: vendors }] = await Promise.all([
    supabase
      .from('line_items')
      .select('*')
      .eq('upload_id', uploadId)
      .order('amount', { ascending: false }),
    supabase.from('category_stats').select('*').eq('upload_id', uploadId),
    supabase.from('vendors').select('*').eq('user_id', user.id),
  ]);

  // Historical totals for trend chart (last 5 prior uploads)
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
      const uploadDateMap = new Map(prevUploads.map((u) => [u.id as string, u.uploaded_at as string]));

      for (const cat of categories) {
        const points = histStats
          .filter((s) => s.category === cat)
          .map((s) => ({
            uploaded_at: uploadDateMap.get(s.upload_id as string) ?? '',
            total: Number(s.total_spend_period),
          }))
          .sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());

        if (points.length > 0) {
          categoryHistory.push({ category: cat, points });
        }
      }
    }
  }

  // Compute flags from line_items boolean flags + anomaly_severity
  const flags: Flag[] = [];
  for (const item of lineItems ?? []) {
    const vendor = String(item.vendor ?? 'Unknown');
    const amount = Number(item.amount ?? 0);
    const category = String(item.category ?? 'Misc');
    const z = Number(item.z_score ?? 0);

    if (item.is_possible_duplicate) {
      flags.push({
        severity: 'critical',
        title: 'Possible Duplicate',
        description: `${vendor} charged $${amount.toFixed(2)} appears to be a duplicate transaction.`,
        metric: `$${amount.toFixed(2)}`,
        category,
        related_line_item_ids: [item.id as string],
      });
    }

    if (item.is_round_number) {
      if (item.anomaly_severity === 'high') {
        flags.push({
          severity: 'critical',
          title: 'Round Number Anomaly',
          description: `${vendor} charged a round $${amount.toFixed(2)} — significantly above the category average (z=${z.toFixed(1)}).`,
          metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)})`,
          category,
          related_line_item_ids: [item.id as string],
        });
      } else if (item.anomaly_severity === 'medium') {
        flags.push({
          severity: 'warning',
          title: 'Round Number Anomaly',
          description: `${vendor} charged a suspiciously round $${amount.toFixed(2)}, above the category average.`,
          metric: `$${amount.toFixed(2)}`,
          category,
          related_line_item_ids: [item.id as string],
        });
      }
    }

    if (item.is_first_time_vendor && (item.anomaly_severity === 'high' || item.anomaly_severity === 'medium')) {
      flags.push({
        severity: 'warning',
        title: 'New High-Spend Vendor',
        description: `First time seeing ${vendor}. Amount of $${amount.toFixed(2)} is unusual for this category.`,
        metric: `$${amount.toFixed(2)} (first-time)`,
        category,
        related_line_item_ids: [item.id as string],
      });
    }

    if (!item.is_possible_duplicate && !item.is_round_number && !item.is_first_time_vendor) {
      if (item.anomaly_severity === 'high') {
        flags.push({
          severity: 'critical',
          title: 'Statistical Anomaly',
          description: `${vendor} at $${amount.toFixed(2)} is far above the category average (z=${z.toFixed(1)}).`,
          metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)})`,
          category,
          related_line_item_ids: [item.id as string],
        });
      } else if (item.anomaly_severity === 'medium') {
        flags.push({
          severity: 'warning',
          title: 'Statistical Anomaly',
          description: `${vendor} at $${amount.toFixed(2)} is above the category mean (z=${z.toFixed(1)}).`,
          metric: `$${amount.toFixed(2)} (z=${z.toFixed(1)})`,
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
    category_stats: catStats ?? [],
    category_history: categoryHistory,
    vendors: vendors ?? [],
    flags,
    pass2,
  });
}

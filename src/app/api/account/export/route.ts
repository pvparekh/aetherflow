import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = createServiceClient();

  const { data: uploads, error: uploadsErr } = await supabase
    .from('uploads')
    .select('id, filename, uploaded_at, total_amount, line_item_count, health_score, ai_analysis')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  if (uploadsErr) return NextResponse.json({ error: uploadsErr.message }, { status: 500 });

  const uploadIds = (uploads ?? []).map((u) => u.id as string);

  const { data: lineItems, error: liErr } = uploadIds.length > 0
    ? await supabase
        .from('line_items')
        .select('id, upload_id, vendor, description, amount, category, transaction_date, z_score, is_anomaly, is_possible_duplicate, is_first_time_vendor, is_round_number, user_resolution')
        .in('upload_id', uploadIds)
        .order('upload_id')
        .order('transaction_date', { ascending: false })
    : { data: [], error: null };

  if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 });

  const zip = new JSZip();

  // analyzed_expenses.csv
  const csvHeaders = ['upload_id', 'vendor', 'description', 'amount', 'category', 'transaction_date', 'z_score', 'is_anomaly', 'is_possible_duplicate', 'is_first_time_vendor', 'is_round_number', 'user_resolution'];
  const csvRows = (lineItems ?? []).map((li) =>
    csvHeaders.map((h) => {
      const val = (li as Record<string, unknown>)[h];
      if (val == null) return '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  zip.file('analyzed_expenses.csv', [csvHeaders.join(','), ...csvRows].join('\n'));

  // summary.json
  const summary = (uploads ?? []).map((u) => ({
    id: u.id,
    filename: u.filename,
    uploaded_at: u.uploaded_at,
    total_amount: u.total_amount,
    line_item_count: u.line_item_count,
    health_score: u.health_score,
    ai_analysis: u.ai_analysis,
  }));
  zip.file('summary.json', JSON.stringify(summary, null, 2));

  const dateStr = new Date().toISOString().slice(0, 10);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  console.log(`[export] user=${user.id} uploads=${uploadIds.length} transactions=${(lineItems ?? []).length}`);

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="aetherflow_export_${dateStr}.zip"`,
    },
  });
}

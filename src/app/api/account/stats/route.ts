import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('uploads')
    .select('line_item_count, uploaded_at, health_score')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const totalUploads = rows.length;
  const totalTransactions = rows.reduce((sum, r) => sum + (Number(r.line_item_count) || 0), 0);

  const dates = rows.map((r) => r.uploaded_at as string).filter(Boolean).sort();
  const firstUploadDate = dates[0] ?? null;

  const scored = rows.filter((r) => r.health_score != null);
  const avgHealthScore = scored.length > 0
    ? Math.round((scored.reduce((s, r) => s + Number(r.health_score), 0) / scored.length) * 10) / 10
    : null;

  return NextResponse.json({ totalUploads, totalTransactions, firstUploadDate, avgHealthScore });
}

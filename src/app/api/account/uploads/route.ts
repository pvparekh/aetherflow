import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== 'DELETE') {
    return NextResponse.json({ error: 'Invalid confirmation' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const userId = user.id;

  const { data: uploads } = await supabase
    .from('uploads')
    .select('id')
    .eq('user_id', userId);

  const uploadIds = (uploads ?? []).map((u) => u.id as string);

  if (uploadIds.length > 0) {
    await supabase.from('vendors').update({ first_seen_upload_id: null }).in('first_seen_upload_id', uploadIds);
    await supabase.from('vendors').update({ last_seen_upload_id: null }).in('last_seen_upload_id', uploadIds);
    await supabase.from('line_items').delete().in('upload_id', uploadIds);
    await supabase.from('category_stats').delete().in('upload_id', uploadIds);
    await supabase.from('uploads').delete().eq('user_id', userId);
  }

  await supabase.from('vendors').delete().eq('user_id', userId);

  console.log(`[account] DELETE all uploads: user=${userId} count=${uploadIds.length}`);

  return NextResponse.json({ deleted: true });
}

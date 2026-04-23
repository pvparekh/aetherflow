import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';
import { runPass2 } from '@/lib/expense-intel/ai/pass2';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let uploadId: string;
  try {
    const body = await req.json();
    uploadId = body.upload_id;
    if (!uploadId) throw new Error('missing upload_id');
  } catch {
    return NextResponse.json({ error: 'Request body must include upload_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: upload } = await supabase
    .from('uploads')
    .select('id, user_id, pass1_status, pass2_status')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .single();

  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }
  if (upload.pass1_status !== 'complete') {
    return NextResponse.json({ error: 'Pass 1 must complete before Pass 2' }, { status: 409 });
  }

  await supabase.from('uploads').update({ pass2_status: 'processing' }).eq('id', uploadId);

  try {
    const result = await runPass2(uploadId, user.id, supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[pass2] Failed for ${uploadId}:`, err);
    await supabase.from('uploads').update({ pass2_status: 'error' }).eq('id', uploadId);
    return NextResponse.json({ error: `Pass 2 failed: ${String(err)}` }, { status: 500 });
  }
}

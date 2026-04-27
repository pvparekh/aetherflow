import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';
import { runPass2 } from '@/lib/expense-intel/ai/pass2';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PASS2_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`pass2_timeout`)), ms)
    ),
  ]);
}

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

  // Already complete — return cached result without re-running
  if (upload.pass2_status === 'complete') {
    const { data: done } = await supabase
      .from('uploads')
      .select('ai_analysis')
      .eq('id', uploadId)
      .single();
    return NextResponse.json(done?.ai_analysis ?? {});
  }

  await supabase.from('uploads').update({ pass2_status: 'processing' }).eq('id', uploadId);
  console.log(`[pass2/route] Starting for upload ${uploadId}`);

  try {
    const result = await withTimeout(runPass2(uploadId, user.id, supabase), PASS2_TIMEOUT_MS);

    console.log(`[pass2/route] Completed for upload ${uploadId}`);
    return NextResponse.json(result);
  } catch (err) {
    const isTimeout = String(err).includes('pass2_timeout');
    console.error(
      `[pass2/route] ${isTimeout ? 'Timed out' : 'Failed'} for ${uploadId}:`,
      err
    );
    await supabase
      .from('uploads')
      .update({
        pass2_status: 'error',
        ai_analysis: {
          error: true,
          narrative_summary: isTimeout
            ? 'Analysis timed out. Hit retry to run it again.'
            : 'Analysis failed. Hit retry to run it again.',
          health_score: null,
          insights: [],
          savings_opportunities: [],
          anomaly_explanations: [],
        },
      })
      .eq('id', uploadId);
    return NextResponse.json(
      { error: isTimeout ? 'Analysis timed out. Hit Retry to try again.' : `Pass 2 failed: ${String(err)}` },
      { status: 500 }
    );
  }
}

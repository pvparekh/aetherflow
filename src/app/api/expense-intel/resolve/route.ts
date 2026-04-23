import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let lineItemId: string;
  let resolution: 'expected' | 'investigate' | null;
  try {
    const body = await req.json();
    lineItemId = body.line_item_id;
    resolution = body.resolution ?? null;
    if (!lineItemId) throw new Error('missing line_item_id');
  } catch {
    return NextResponse.json({ error: 'Request body must include line_item_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: lineItem } = await supabase
    .from('line_items')
    .select('id, upload_id')
    .eq('id', lineItemId)
    .single();

  if (!lineItem) {
    return NextResponse.json({ error: 'Line item not found' }, { status: 404 });
  }

  const { data: upload } = await supabase
    .from('uploads')
    .select('user_id')
    .eq('id', lineItem.upload_id)
    .single();

  if (!upload || upload.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { error } = await supabase
    .from('line_items')
    .update({ user_resolution: resolution })
    .eq('id', lineItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

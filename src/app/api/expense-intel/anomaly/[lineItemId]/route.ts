import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ lineItemId: string }> }
) {
  const { lineItemId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
    .update({
      is_anomaly:            false,
      anomaly_severity:      'none',
      is_possible_duplicate: false,
      is_round_number:       false,
      is_first_time_vendor:  false,
    })
    .eq('id', lineItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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
  const { data: uploads, error } = await supabase
    .from('uploads')
    .select('id, filename, uploaded_at, total_amount, line_item_count, pass1_status, pass2_status, health_score')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ uploads: uploads ?? [] });
}

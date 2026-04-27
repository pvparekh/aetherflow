import { NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { createServiceClient } from '../../../../utils/supabase/service';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== 'DELETE MY ACCOUNT') {
    return NextResponse.json({ error: 'Invalid confirmation' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const userId = user.id;

  console.log(`[account] DELETE account: user=${userId}`);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`[account] Failed to delete user ${userId}:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

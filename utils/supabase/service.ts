import { createClient } from '@supabase/supabase-js';

// Bypasses RLS — only for server-side API routes, never import in client components.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

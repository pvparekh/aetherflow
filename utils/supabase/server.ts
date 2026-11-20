import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(values) {
          try {
            for (const { name, value, options } of values)
              cookieStore.set(name, value, options);
          } catch {
            /* Server components cannot set cookies. Middleware refreshes the session. */
          }
        },
      },
    },
  );
}

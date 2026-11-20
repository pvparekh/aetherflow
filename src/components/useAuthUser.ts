"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../../utils/supabase/client";

/**
 * The signed-in user, kept current as people sign in or out in any tab.
 * `undefined` while the session is being read, so the header can avoid
 * flashing the wrong buttons.
 */
export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    let client: ReturnType<typeof createClient>;
    try {
      client = createClient();
    } catch {
      setUser(null);
      return;
    }
    let active = true;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return user;
}

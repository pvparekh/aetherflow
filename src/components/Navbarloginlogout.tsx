"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { signout } from "@/lib/auth-actions";
import type { User } from "@supabase/supabase-js";

const LoginLogoutButton2 = () => {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, [supabase]);

  if (user) {
    return (
      <button
        onClick={() => {
          signout();
          setUser(null);
        }}
        className="hover:text-blue-400 hover:scale-110 hover:cursor-pointer transition transform duration-200 inline-block text-sm"
      >
        Log Out
      </button>
    );
  }

  return (
    <button
      onClick={() => router.push("/login")}
      className="hover:text-blue-400 hover:scale-110 hover:cursor-pointer transition transform duration-200 inline-block text-sm"
    >
      Login
    </button>
  );
};

export default LoginLogoutButton2;

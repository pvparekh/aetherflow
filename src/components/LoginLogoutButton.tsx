"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { signout } from "@/lib/auth-actions";

const LoginLogoutButton = () => {
  const [user, setUser] = useState<any>(null);
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
  }, []);

  if (user) {
    return (
      <button
        onClick={() => {
          signout();
          setUser(null);
        }}
        className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:scale-108 cursor-pointer hover:bg-black transition"
      >
        Log out
      </button>
    );
  }

  return (
    <button
      onClick={() => router.push("/login")}
      className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:scale-108 cursor-pointer hover:bg-black transition"
    >
      Login
    </button>
  );
};

export default LoginLogoutButton;

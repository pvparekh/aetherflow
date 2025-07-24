"use client";
import { createClient } from "../../utils/supabase/client";
import React, { useEffect, useState } from "react";

const GreetUser = () => {
  const [user, setUser] = useState<any>(null);
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

  return (
    <p className="text-lg font-medium text-white mb-4">
      Hello, <span className="font-semibold text-blue-200">{user?.full_name ?? "Guest"}</span> 👋
    </p>
  );
};

export default GreetUser;

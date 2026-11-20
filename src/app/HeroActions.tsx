"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useAuthUser } from "@/components/useAuthUser";
import { firstName } from "@/lib/auth/names";
import s from "./home.module.css";

/**
 * The landing page's calls to action. Signed-out visitors get the demo and
 * sign-up; a signed-in person gets a greeting and a way back to their work.
 */
export default function HeroActions() {
  const user = useAuthUser();

  if (user) {
    const name = firstName(user);
    return (
      <div className={s.greeting}>
        <p className={s.greetingText}>
          Ready to check your expenses{name ? `, ${name}` : ""}?
        </p>
        <div className="button-row">
          <Link className="btn primary" href="/expense-intel">
            Open your workspace <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    // Held invisible until the session is read, so a signed-in visitor never
    // sees the sign-up buttons flash.
    <div className="button-row" style={user === undefined ? { visibility: "hidden" } : undefined}>
      <Link className="btn primary" href="/demo">
        Try the demo, no sign-up needed <ArrowRight size={17} />
      </Link>
      <Link className="btn subtle" href="/signup">
        Sign up to use your own statements <ArrowUpRight size={17} />
      </Link>
    </div>
  );
}

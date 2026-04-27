"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import LoginLogoutButton from "@/components/LoginLogoutButton";
import GreetUser from "../components/GreetUser";
import { createClient } from "../../utils/supabase/client";

export default function Home() {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuth(!!session?.user);
    };
    checkSession();
  }, []);

  if (isAuth === null) return null;

  return (
    <Layout>
      <main className="flex flex-col items-center justify-start bg-gray-50 text-white">

        {/* Hero */}
        <section
          className="w-full flex flex-col items-center justify-center px-8 py-20 text-center relative"
          style={{
            backgroundImage: "url('/images/gradient.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <motion.h1
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
            style={{ transformStyle: "preserve-3d" }}
            className="text-4xl font-bold mb-4"
          >
            Welcome to{" "}
            <span>Aether<span className="text-blue-400">Flow</span></span>
          </motion.h1>

          <GreetUser />
          <p className="text-lg max-w-xl mx-auto mb-6 text-white/90">
            AetherFlow tracks your business expenses, categorizes every transaction with AI, catches anomalies, and gets smarter with every upload. Built for freelancers, solopreneurs, and small teams.
          </p>

          {!isAuth && (
            <div className="w-full flex justify-center mt-6">
              <div className="flex gap-4">
                <LoginLogoutButton />
                <button
                  onClick={() => router.push("/signup")}
                  className="px-6 py-3 rounded-lg bg-gray-500 text-white font-medium hover:scale-108 cursor-pointer hover:bg-black transition"
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}
        </section>

        {/* How It Works */}
        <section className="max-w-4xl mx-auto my-20 px-6 w-full">
          <h2 className="text-3xl font-semibold text-center mb-10 text-black">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Upload your expenses",
                desc: "CSV, TXT, or PDF from any source. Credit card export, accounting tool, or a spreadsheet you made.",
              },
              {
                step: "2",
                title: "AI analyzes everything",
                desc: "Every transaction gets categorized and compared to your history. Duplicates and unusual charges get flagged automatically.",
              },
              {
                step: "3",
                title: "Get clear insights",
                desc: "Plain English explanations of your spending: what's normal, what's not, and what to pay attention to.",
              },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white text-lg font-bold flex items-center justify-center mx-auto mb-4">
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{s.title}</h3>
                <p className="text-gray-600 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature Cards */}
        <section className="max-w-6xl mx-auto mb-20 px-6 w-full">
          <h2 className="text-3xl font-semibold text-center mb-8 text-black">Key Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {[
              {
                title: "Two-Pass AI Analysis",
                desc: "Fast categorization in seconds, then a deeper analysis that spots patterns and writes insights like a financial advisor who actually looked at your data.",
              },
              {
                title: "Catches Duplicates & Anomalies",
                desc: "Double charges, unusual amounts, first-time vendors, spending that's way off your baseline. All flagged automatically with plain-English explanations.",
              },
              {
                title: "Learns Your Baseline",
                desc: "After a few uploads, it knows what normal looks like for your business and tells you clearly when something isn't.",
              },
              {
                title: "Vendor Intelligence",
                desc: "Tracks every vendor across all uploads. Spots consolidation opportunities, price creeps, and which vendors are core to your spending.",
              },
              {
                title: "Works With Any Format",
                desc: "Expensify export, a spreadsheet you made yourself, or a scanned PDF. Drop it in and we parse it. No templates required.",
              },
              {
                title: "Gets Smarter Over Time",
                desc: "Rolling averages and trend detection improve with every upload. The more you use it, the better the insights.",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="border rounded-xl p-6 shadow hover:shadow-md transition bg-white"
              >
                <h3 className="text-xl font-semibold text-gray-800 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who It's For */}
        <section className="max-w-5xl mx-auto mb-20 px-6 w-full">
          <h2 className="text-3xl font-semibold text-center mb-8 text-black">Who It&apos;s For</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Freelancers & Solopreneurs",
                desc: "Track business expenses between clients. Understand where revenue actually goes. Stop doing it manually in a spreadsheet.",
              },
              {
                title: "Small Teams (2–10 people)",
                desc: "No dedicated finance person, no expensive software. Track team spending, catch duplicate charges, and spot trends.",
              },
              {
                title: "Anyone Managing Business Spend",
                desc: "You're tracking expenses but not really analyzing them. Drop in a file and get a real picture: by category, by vendor, with anything unusual called out.",
              },
            ].map((persona, index) => (
              <div
                key={index}
                className="border rounded-xl p-6 shadow hover:shadow-md transition bg-white"
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{persona.title}</h3>
                <p className="text-gray-600 text-sm">{persona.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonial */}
        <section className="max-w-3xl mx-auto text-center px-6 mb-20 relative">
          <div className="relative border-l-4 border-blue-600 bg-white p-8 rounded-xl shadow">
            <div className="absolute top-0 left-0 text-blue-600 text-6xl -mt-6 -ml-4 select-none">&ldquo;</div>
            <p className="text-lg italic text-gray-800">
              AetherFlow gave us clarity on where our operations were bleeding money. This tool doesn&apos;t just organize, it thinks for us.
            </p>
            <div className="absolute bottom-0 right-0 text-blue-600 text-6xl -mb-6 -mr-4 select-none">&rdquo;</div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center mb-20">
          <h2 className="text-2xl font-bold text-black mb-4">Ready to actually understand your expenses?</h2>
          <button
            onClick={() => router.push(isAuth ? "/expense-intel" : "/signup")}
            className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium cursor-pointer hover:scale-110 hover:bg-blue-800 transition"
          >
            {isAuth ? "Open Expense Intelligence" : "Get Started Free"}
          </button>
        </section>

      </main>
    </Layout>
  );
}

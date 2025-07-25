"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import LoginLogoutButton from "@/components/LoginLogoutButton";
import GreetUser from "../components/GreetUser";
import { createClient } from "../../utils/supabase/client";

export default function Home() {
  const [isAuth, setIsAuth] = useState<boolean | null>(null); // null = loading
  const router = useRouter();
  const supabase = createClient();

 useEffect(() => {
  const checkSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const loggedIn = !!session?.user;
    setIsAuth(loggedIn);

  };
  checkSession();
}, [supabase]);
  if (isAuth === null) return null; // Prevent flicker

  return (
    <Layout>
      <main className="flex flex-col items-center justify-start bg-gray-50 text-white">
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
            <span>
              Aether<span className="text-blue-400">Flow</span>
            </span>
          </motion.h1>

          <GreetUser />
          <p className="text-lg max-w-xl mx-auto mb-6">
            Your AI-powered intelligent workflow manager—analyzing, scoring, and flagging inefficiencies in business reports to help companies optimize.
          </p>

          <div className="w-full flex justify-center mt-6">
            <div className={`flex ${isAuth ? "justify-center" : "gap-4"}`}>
              <LoginLogoutButton />
              {!isAuth && (
                <button
                  onClick={() => router.push("/signup")}
                  className="px-6 py-3 rounded-lg bg-gray-500 text-white font-medium hover:scale-108 cursor-pointer hover:bg-black transition"
                >
                  Signup
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="max-w-6xl mx-auto my-20 px-6">
          <h2 className="text-3xl font-semibold text-center mb-8 text-black">Key Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {[
              {
                title: "Smart Document Upload",
                desc: "Upload structured .txt or .csv files, AetherFlow instantly parses and processes your data.",
              },
              {
                title: "Anomaly Detection",
                desc: "Flag overspending, inefficiencies, and irregularities with smart pattern recognition.",
              },
              {
                title: "AI-Scored Reports",
                desc: "Receive actionable insights, performance summaries, and basic risk indicators tailored to your input.",
              },
              {
                title: "Saved Analysis History",
                desc: "Sign up to save your analysis results and revisit past reports anytime from your dashboard.",
              },
              {
                title: "Limited Guest Usage",
                desc: "Try AetherFlow with up to 3 free analyses. Sign up to unlock full functionality and history tracking.",
              },
              {
                title: "Role-Based Access (Coming Soon)",
                desc: "Future roles like Finance Analyst or Ops Reviewer will allow tailored dashboards and permissions.",
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

        {/* Testimonial Block */}
        <section className="max-w-3xl mx-auto text-center px-6 mb-20 relative">
          <div className="relative border-l-4 border-blue-600 bg-white p-8 rounded-xl shadow">
            <div className="absolute top-0 left-0 text-blue-600 text-6xl -mt-6 -ml-4 select-none">
              “
            </div>
            <p className="text-lg italic text-gray-800">
              AetherFlow gave us clarity on where our operations were bleeding
              money. This tool doesn’t just organize, it thinks for us.
            </p>
            <div className="absolute bottom-0 right-0 text-blue-600 text-6xl -mb-6 -mr-4 select-none">
              ”
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center mb-20">
          <h2 className="text-2xl font-bold text-black mb-4">
            Ready to streamline your workflows?
          </h2>
          <button
            onClick={() => router.push("/signup")}
            className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium cursor-pointer hover:scale-110 hover:bg-blue-800 transition"
          >
            Get Started Now
          </button>
        </section>
      </main>
    </Layout>
  );
}

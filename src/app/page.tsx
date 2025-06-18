"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";

export default function Home() {
  const router = useRouter();
  const isAuth = false;

  useEffect(() => {
    if (isAuth) {
      router.push("/dashboard");
    }
  }, [isAuth, router]);

  return (
    <Layout>
      <main className="flex flex-col items-center justify-start bg-gray-50 text-white">
        {/* Hero Section with Gradient + Background Image */}
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="text-4xl font-bold mb-4"
          >
            Welcome to{" "}
            <span>
              Aether<span className="text-blue-400">Flow</span>
            </span>
          </motion.h1>

          <p className="text-lg max-w-xl mx-auto mb-6">
            Your AI-powered intelligent workflow manager—analyzing, scoring, and flagging inefficiencies in business reports to help companies optimize.
          </p>

          <div className="flex space-x-4">
            <button
              onClick={() => router.push("/login")}
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:scale-108 hover:bg-black transition"
            >
              Login
            </button>
            <button
              onClick={() => router.push("/signup")}
              className="px-6 py-3 rounded-lg bg-gray-500 text-white font-medium hover:scale-108 hover:bg-black transition"
            >
              Signup
            </button>
          </div>
        </section>

        {/* Features Grid */}
        <section className="max-w-6xl mx-auto my-20 px-6">
          <h2 className="text-3xl font-semibold text-center mb-8">Key Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {[
              { title: "Smart Document Upload", desc: "Drag and drop PDFs or spreadsheets — AetherFlow handles parsing and analysis instantly." },
              { title: "Anomaly Detection", desc: "Flag overspending, inefficiencies, and budget risks before they escalate." },
              { title: "Approval Threshold Logic", desc: "Auto-approve or route based on rules. Managers only see what matters." },
              { title: "AI-Scored Reports", desc: "Every report gets an AI scorecard: compliance, value, risk." },
              { title: "Audit Trail Logging", desc: "Full tracking of report activity, edits, and approvals for accountability." },
              { title: "Role-Based Access", desc: "Separate workflows for finance, operations, and executives." },
            ].map((feature, index) => (
              <div key={index} className="border rounded-xl p-6 shadow hover:shadow-md transition">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonial Block */}
        <section className="max-w-3xl mx-auto text-center px-6 mb-20 relative">
          <div className="relative border-l-4 border-blue-600 bg-white p-8 rounded-xl shadow">
            <div className="absolute top-0 left-0 text-blue-600 text-6xl -mt-6 -ml-4 select-none">“</div>
            <p className="text-lg italic text-gray-800">
              AetherFlow gave us clarity on where our operations were bleeding money—this tool doesn’t just organize, it thinks for us.
            </p>
            <div className="absolute bottom-0 right-0 text-blue-600 text-6xl -mb-6 -mr-4 select-none">”</div>
            <p className="mt-6 text-sm font-medium text-gray-600">— Raj Patel, Startup Operations Lead</p>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center mb-20">
          <h2 className="text-2xl font-bold text-black mb-4">Ready to streamline your workflows?</h2>
          <button
            onClick={() => router.push("/signup")}
            className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium hover:scale-110 hover:bg-blue-800 transition"
          >
            Get Started Now
          </button>
        </section>
      </main>
    </Layout>
  );
}


"use client";
import React from "react";
import { SignUpForm } from "./components/SignUpForm"; 
import Layout from '@/components/Layout';

export default function LoginPage() {
  return (
    <Layout>
    <div
      className="min-h-screen flex items-start pt-30 justify-center text-white"
      style={{
        backgroundImage: "linear-gradient(to right, #2563eb, #7c3aed)",
      }}
    >
      <div className="max-w-4xl w-full bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-10">
        {/* Left side content */}
        <div className="md:w-1/2 space-y-6 text-center md:text-left">
          <h2 className="text-4xl font-bold">
           Create your{" "}
            <span className="text-blue-300">Aether</span>
            <span className="text-indigo-300">Flow</span> account
          </h2>
          <p className="text-sm text-gray-200">
            Join the AI-powered workflow revolution. Sign up to analyze reports, flag inefficiencies, and unlock powerful insights.
          </p>
        </div>

        {/* Login form card */}
        <div className="md:w-1/2 w-full">
          <div className="bg-white p-8 rounded-xl shadow-lg text-black">
            <SignUpForm />
          </div>
        </div>
      </div>
    </div>
    </Layout>
  );
}

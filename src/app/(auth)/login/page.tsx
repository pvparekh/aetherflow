"use client";
import React from "react";
import { LoginForm } from "./components/LoginForm"; 
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
            Welcome back to{" "}
            <span className="text-blue-300">Aether</span>
            <span className="text-indigo-300">Flow</span>
          </h2>
          <p className="text-sm text-gray-200">
            Your personal AI-powered workflow assistant. Log in to unlock full access to reports, insights, and more.
          </p>
        </div>

        {/* Login form card */}
        <div className="md:w-1/2 w-full">
          <div className="bg-white p-8 rounded-xl shadow-lg text-black">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
    </Layout>
  );
}
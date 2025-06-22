'use client';

import { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { motion } from 'framer-motion';
import Layout from '@/components/Layout';

export default function AnalyzePage() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [ready, setReady] = useState(true);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResponse('');
    setReady(false);

    const reader = new FileReader();
    reader.onload = () => {
      setInput(reader.result as string);
      setReady(true);
    };
    reader.readAsText(file);

    e.target.value = '';
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      });

      const data = await res.json();
      setResponse(data.text || 'No response');
    } catch {
      setResponse('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <main className="min-h-screen bg-gray-50 py-20 px-6 flex flex-col items-center justify-start text-black">
        <div className="w-full max-w-5xl bg-white border border-gray-200 rounded-3xl shadow-xl p-10 space-y-10">
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-4xl font-bold mb-2 tracking-tight">
              Analyze Your <span className="text-blue-600">Reports</span>
            </h1>
            </motion.header>
            <p className="text-md text-gray-700 max-w-2xl mx-auto">
            Upload your reports, and AetherFlow’s AI will provide detailed analysis to help optimize efficiency and deliver actionable results!

            </p>
          <section className="space-y-4">
            <label className="block text-lg font-semibold text-gray-800">Upload a .txt or .csv File</label>
            <div className="text-sm text-gray-700 mb-2">
  Don’t have a report ready?
  <a
    href="/sample/Q2_Expense_Report.csv"
    download
    className="ml-1 text-blue-600 underline hover:text-blue-800"
  >Download a sample report
  </a> to test the analyzer.
</div>
            <label
            
              htmlFor="file-upload"
              className="cursor-pointer border-2 border-dashed border-blue-500 bg-blue-50 rounded-xl p-6 flex items-center justify-center hover:scale-103 hover:shadow-lg hover:bg-blue-100 text-blue-700 font-medium space-x-3 transition-all"
            >
              <UploadCloud className="w-6 h-6" />
              <span>{fileName || 'Click to upload a file'}</span>
              <input
                id="file-upload"
                type="file"
                accept=".txt,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {!ready && (
              <p className="text-sm text-gray-500 italic">Parsing file… Please wait.</p>
            )}
          </section>

          <section>
            <label className="block text-lg font-semibold text-gray-800 mb-2">Or Paste Report Text:</label>
            <textarea
              className="w-full h-48 border border-gray-300 rounded-xl p-4 text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Paste or upload your report here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </section>

          <div className="text-right">
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim() || !ready}
              className={`px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 cursor-pointer hover:scale-105 hover:from-blue-800 hover:to-indigo-700 transition duration-300 shadow-lg ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>

          {response && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-gray-100 p-6 rounded-xl border border-gray-300 shadow-inner"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-3">AI Feedback</h2>
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{response}</p>
            </motion.div>
          )}
        </div>
      </main>
    </Layout>
  );
}

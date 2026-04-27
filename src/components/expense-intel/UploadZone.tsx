'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  onUploadComplete: (uploadId: string) => void;
  label?: string;
}

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

export default function UploadZone({ onUploadComplete, label = 'Drop your expense file here' }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'txt', 'pdf'].includes(ext ?? '')) {
        setError('Only .csv, .txt, and .pdf files are supported');
        setPhase('error');
        return;
      }

      setError(null);
      setPhase('uploading');

      const formData = new FormData();
      formData.append('file', file);

      let uploadId: string;
      try {
        const res = await fetch('/api/expense-intel/upload', { method: 'POST', body: formData });
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          setPhase('error');
          setError(`Server error (${res.status}). Check console for details.`);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setPhase('error');
          setError(data.error ?? 'Upload failed');
          return;
        }
        uploadId = data.upload_id;
      } catch (err) {
        setPhase('error');
        setError(`Network error. ${err instanceof Error ? err.message : 'Please try again.'}`);
        return;
      }

      setPhase('analyzing');
      try {
        await fetch('/api/expense-intel/pass2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_id: uploadId }),
        });
      } catch {
        // Pass 2 failure is non-fatal
      }

      setPhase('done');
      onUploadComplete(uploadId);
    },
    [onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const canUpload = phase === 'idle' || phase === 'done' || phase === 'error';

  return (
    <motion.div
      animate={{
        borderColor: dragging
          ? '#3B82F6'
          : phase === 'error'
            ? '#EF4444'
            : '#D1D5DB',
        backgroundColor: dragging ? '#EFF6FF' : '#F9FAFB',
        boxShadow: dragging
          ? '0 0 0 3px rgba(59, 130, 246, 0.15)'
          : '0 0 0 0px rgba(59, 130, 246, 0)',
      }}
      transition={{ duration: 0.15 }}
      className="relative border-2 border-dashed rounded-2xl p-8 text-center select-none min-h-[160px] flex flex-col items-center justify-center"
      style={{ cursor: canUpload ? 'pointer' : 'default' }}
      onClick={() => canUpload && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept=".csv,.txt,.pdf" className="hidden" onChange={handleChange} />

      <AnimatePresence mode="wait">
        {phase === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-semibold text-gray-900">Pass 1: Categorizing expenses…</p>
            <p className="text-sm mt-1 text-gray-500">GPT-4o-mini batch categorization + statistical analysis</p>
          </motion.div>
        )}

        {phase === 'analyzing' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-semibold text-gray-900">Pass 2: Running AI analysis…</p>
            <p className="text-sm mt-1 text-gray-500">GPT-4o generating insights, health score, and anomaly explanations</p>
          </motion.div>
        )}

        {(phase === 'idle' || phase === 'done' || phase === 'error') && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center"
          >
            {phase === 'done' ? (
              <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-600" />
            ) : (
              <UploadCloud className="w-10 h-10 mx-auto mb-3 text-blue-600" />
            )}
            <p className="font-semibold text-gray-800">
              {phase === 'done'
                ? 'Analysis complete. Drop another file to analyze again.'
                : label}
            </p>
            <p className="text-sm mt-1 text-gray-500">
              {phase === 'done' ? 'Dashboard updated with latest insights' : 'or click to browse'}
            </p>
            {phase !== 'done' && (
              <p className="text-xs mt-2 text-gray-400">Analysis may take up to 2 minutes or more, especially PDFs</p>
            )}
            {error && (
              <div className="mt-3 flex items-center gap-2 justify-center text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

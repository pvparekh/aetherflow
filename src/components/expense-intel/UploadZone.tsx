'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  onUploadComplete: (uploadId: string) => void;
}

type Phase = 'idle' | 'uploading' | 'done' | 'error';

export default function UploadZone({ onUploadComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'txt'].includes(ext ?? '')) {
        setError('Only .csv and .txt files are supported');
        setPhase('error');
        return;
      }

      setError(null);
      setPhase('uploading');

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/expense-intel/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
          setPhase('error');
          setError(data.error ?? 'Upload failed');
          return;
        }

        // Fire Pass 2 non-blocking in the background
        fetch('/api/expense-intel/pass2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_id: data.upload_id }),
        }).catch(() => {});

        setPhase('done');
        onUploadComplete(data.upload_id);
      } catch {
        setPhase('error');
        setError('Network error — please try again');
      }
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
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all select-none
        ${canUpload ? 'cursor-pointer' : 'cursor-default pointer-events-none opacity-70'}
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}
      onClick={() => canUpload && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleChange} />

      {phase === 'uploading' ? (
        <>
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="font-semibold text-gray-700">Uploading &amp; categorizing…</p>
          <p className="text-sm text-gray-500 mt-1">
            Pass 1: GPT-4o-mini batch categorization + statistical analysis
          </p>
        </>
      ) : (
        <>
          {phase === 'done' ? (
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500" />
          ) : (
            <UploadCloud className="w-10 h-10 mx-auto mb-3 text-blue-500" />
          )}
          <p className="font-semibold text-gray-700">
            {phase === 'done'
              ? 'Upload complete — drop another to analyze again'
              : 'Drop a .csv or .txt expense file here'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {phase === 'done' ? 'AI insights are generating in the background' : 'or click to browse'}
          </p>
          {error && (
            <div className="mt-3 flex items-center gap-2 justify-center text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

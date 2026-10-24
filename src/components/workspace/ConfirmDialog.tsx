"use client";
import { useRef, useEffect, useState } from "react";
export default function ConfirmDialog({
  title,
  description,
  phrase,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  phrase: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p>{description}</p>
      <label htmlFor="confirm-phrase">
        Type {phrase} to confirm
        <input
          id="confirm-phrase"
          autoComplete="off"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="button-row">
        <button className="btn subtle" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn danger"
          disabled={busy || value !== phrase}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : title}
        </button>
      </div>
    </dialog>
  );
}

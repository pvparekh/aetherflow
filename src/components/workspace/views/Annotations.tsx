"use client";
import { useState } from "react";
import { api } from "@/lib/imports/http";
import { parseAnnotationPatch } from "@/lib/expense-intel/budgets/validate";

interface Props {
  id: string;
  tags: string[];
  note: string | null;
  demo: boolean;
  onSaved: (tags: string[], note: string | null) => void;
}

/** Tags and a note on one transaction. The demo keeps them in memory. */
export default function Annotations({ id, tags, note, demo, onSaved }: Props) {
  const [tagText, setTagText] = useState(tags.join(", "));
  const [noteText, setNoteText] = useState(note ?? "");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const nextTags = tagText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const patch = parseAnnotationPatch({ tags: nextTags, note: noteText });
    if (!patch.ok) {
      setStatus(patch.error);
      return;
    }
    const value = { tags: patch.value.tags ?? [], note: patch.value.note ?? null };
    setSaving(true);
    setStatus("");
    try {
      if (!demo)
        await api(`/api/expense-intel/transactions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        });
      onSaved(value.tags, value.note);
      setStatus(demo ? "Saved for this visit." : "Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="annotations">
      <label>
        <span>Tags</span>
        <input
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="client-a, reimbursable"
          aria-describedby={`tags-help-${id}`}
        />
      </label>
      <small id={`tags-help-${id}`}>Separate tags with commas.</small>
      <label>
        <span>Note</span>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={2}
          placeholder="What was this for?"
        />
      </label>
      <div className="button-row">
        <button className="btn subtle" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save tags and note"}
        </button>
        <span className="micro" role="status" aria-live="polite">
          {status}
        </span>
      </div>
    </div>
  );
}

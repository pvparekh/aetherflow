"use client";
import { useState, useEffect, useRef } from "react";
import { FileUp, ArrowRight, Check, ExternalLink } from "lucide-react";
import type {
  ImportDraft,
  Candidate,
  ImportOptions,
} from "@/lib/imports/contract";
import {
  DEFAULT_OPTIONS,
  reviewTotal,
  MAX_BYTES,
} from "@/lib/imports/contract";
import { api } from "@/lib/imports/http";
interface Props {
  onComplete: (id: string) => void;
  onCancel: () => void;
}
export default function ImportReview({ onComplete, onCancel }: Props) {
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [progress, setProgress] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const sourceRef = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try {
      const remembered = JSON.parse(
        localStorage.getItem("aetherflow-import-settings") ?? "null",
      );
      if (
        remembered &&
        ["expenses", "negative-outflow", "positive-outflow"].includes(
          remembered.amountMode,
        ) &&
        ["mdy", "dmy"].includes(remembered.dateOrder) &&
        remembered.currency === "USD"
      )
        setOptions(remembered);
    } catch {
      /* Optional preferences must never block import. */
    }
    api<{ drafts: ImportDraft[] }>("/api/imports")
      .then((v) => {
        if (!Array.isArray(v.drafts))
          throw new Error("Saved reviews could not be read. Retry shortly.");
        if (alive.current) setDrafts(v.drafts);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    return () => {
      alive.current = false;
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current);
    };
  }, []);
  const load = (d: ImportDraft) => {
    setDraft(d);
    setAck(false);
    setError("");
  };
  async function fileSelected(file: File) {
    try {
      localStorage.setItem(
        "aetherflow-import-settings",
        JSON.stringify(options),
      );
    } catch {
      /* Storage may be disabled. */
    }
    if (file.size > MAX_BYTES) {
      setError("Choose a file up to 4 MB");
      return;
    }
    setBusy(true);
    setError("");
    setProgress("Extracting candidates. No expenses are published yet.");
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current);
    sourceRef.current = file.name.toLowerCase().endsWith(".pdf")
      ? URL.createObjectURL(file)
      : null;
    setSource(sourceRef.current);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("options", JSON.stringify(options));
      const { draft } = await api<{ draft: ImportDraft }>(
        "/api/imports/preview",
        { method: "POST", body: form },
      );
      if (alive.current) load(draft);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  function patch(id: string, change: Partial<Candidate>) {
    setAck(false);
    setDraft((d) =>
      d
        ? {
            ...d,
            review: {
              ...d.review,
              rows: d.review.rows.map((r) =>
                r.id === id ? { ...r, ...change } : r,
              ),
            },
          }
        : d,
    );
  }
  async function save() {
    if (!draft) return;
    const v = await api<{ draft: ImportDraft }>(`/api/imports/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review: draft.review,
        updated_at: draft.updated_at,
      }),
    });
    setDraft(v.draft);
    return v.draft;
  }
  async function commit() {
    if (!draft || !ack) return;
    setBusy(true);
    setError("");
    try {
      if (
        !draft.upload_id &&
        draft.status !== "processing" &&
        !("cursor" in draft && Number(draft.cursor) > 0)
      )
        await save();
      for (let i = 0; i < 22; i++) {
        const result = await api<{
          complete: boolean;
          upload_id: string;
          processed: number;
          total: number;
        }>(`/api/imports/${draft.id}/commit`, { method: "POST" });
        if (!alive.current) return;
        setProgress(
          `Categorized ${result.processed} of ${result.total} reviewed expenses`,
        );
        if (result.complete) {
          onComplete(result.upload_id);
          return;
        }
      }
      throw new Error(
        "Import paused at a safe checkpoint. Resume to continue.",
      );
    } catch (e) {
      setError((e as Error).message);
      try {
        const { drafts } = await api<{ drafts: ImportDraft[] }>("/api/imports");
        const fresh = drafts.find((d) => d.id === draft.id);
        if (fresh) setDraft(fresh);
      } catch {
        /* Keep the last known review when offline. */
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const locked =
    !!draft &&
    (draft.status === "processing" ||
      !!draft.upload_id ||
      ("cursor" in draft && Number(draft.cursor) > 0));
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">IMPORT / REVIEW / UNDERSTAND</p>
          <h2 style={{ marginTop: 10 }}>
            {draft
              ? "Review transaction candidates"
              : "Bring your expenses into focus"}
          </h2>
          <p>Nothing is counted until you confirm your expenses.</p>
        </div>
        <button
          className="btn subtle"
          onClick={async () => {
            if (draft && !locked) {
              setBusy(true);
              try {
                await save();
                onCancel();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            } else onCancel();
          }}
          disabled={busy}
        >
          Save & close
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {progress && (
        <div className="notice info" role="status">
          {progress}
        </div>
      )}
      {!draft ? (
        <>
          <div className="settings-grid">
            <label>
              Amount interpretation
              <select
                value={options.amountMode}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    amountMode: e.target.value as ImportOptions["amountMode"],
                  })
                }
              >
                <option value="expenses">
                  Expense export (positive costs)
                </option>
                <option value="negative-outflow">
                  Statement: negative = expense
                </option>
                <option value="positive-outflow">
                  Card statement: positive = expense
                </option>
              </select>
            </label>
            <label>
              Date order
              <select
                value={options.dateOrder}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    dateOrder: e.target.value as "mdy" | "dmy",
                  })
                }
              >
                <option value="mdy">Month / day / year</option>
                <option value="dmy">Day / month / year</option>
              </select>
            </label>
            <label>
              Currency
              <select value="USD" disabled>
                <option>USD · no currency conversion</option>
              </select>
            </label>
          </div>
          <details>
            <summary className="text-link">Custom CSV columns</summary>
            <div className="settings-grid">
              {(["vendor", "amount", "date"] as const).map((k) => (
                <label key={k}>
                  {k} column
                  <input
                    placeholder="Exact CSV header (optional)"
                    value={options.columns?.[k] ?? ""}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        columns: {
                          vendor: "",
                          amount: "",
                          date: "",
                          ...options.columns,
                          [k]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy && e.dataTransfer.files[0])
                void fileSelected(e.dataTransfer.files[0]);
            }}
          >
            <FileUp
              size={26}
              style={{ margin: "auto", color: "var(--forest)" }}
            />
            <h3>A clearer view starts here.</h3>
            <p>
              Drop an expense file, or choose one below.
              <br />
              CSV · TXT · PDF / up to 4 MB · 500 rows · 20 PDF pages
            </p>
            <input
              aria-label="Choose expense file"
              type="file"
              disabled={busy}
              accept=".csv,.txt,.pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) void fileSelected(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <p>
              PDF extraction uses AI. Every PDF row requires confirmation
              against its source.
            </p>
          </div>
          <p className="micro">
            <a
              className="text-link"
              href="/sample/Q2_Expense_Report.csv"
              download
            >
              Download a sample CSV ↗
            </a>
          </p>
          {drafts.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p className="eyebrow">SAVED REVIEWS</p>
              {drafts
                .filter((d) => d.status !== "complete")
                .map((d) => (
                  <div className="review-actions" key={d.id}>
                    <span style={{ fontSize: 12 }}>{d.review.filename}</span>
                    <span className="pill">{d.status}</span>
                    <button className="text-link" onClick={() => load(d)}>
                      Resume →
                    </button>
                  </div>
                ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="micro">
            Your original evidence is preserved. Save or close to persist
            corrections before leaving this page.
          </p>
          <div className="notice">
            <strong>{draft.review.filename}</strong> ·{" "}
            {draft.review.rows.length} candidates · {draft.review.pages ?? "—"}{" "}
            pages · {draft.review.method}
            {draft.review.warnings.slice(0, 6).map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
          {source && (
            <a
              className="btn subtle"
              href={source}
              target="_blank"
              rel="noreferrer"
            >
              Open original PDF <ExternalLink size={13} />
            </a>
          )}
          {!locked && (
            <div className="review-actions">
              <button
                className="btn subtle"
                onClick={() => {
                  setAck(false);
                  setDraft({
                    ...draft,
                    review: {
                      ...draft.review,
                      rows: draft.review.rows.map((r) => ({
                        ...r,
                        included:
                          r.kind === "expense" && r.amount > 0 && !!r.vendor,
                      })),
                    },
                  });
                }}
              >
                Select expense candidates
              </button>
              <button
                className="btn subtle"
                onClick={() => {
                  setAck(false);
                  setDraft({
                    ...draft,
                    review: {
                      ...draft.review,
                      rows: draft.review.rows.map((r) => ({
                        ...r,
                        included: false,
                      })),
                    },
                  });
                }}
              >
                Clear selection
              </button>
            </div>
          )}
          <div className="table-wrap" style={{ marginTop: 20 }}>
            <table className="data-table review-table">
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Description</th>
                  <th>Amount · USD</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Source & warnings</th>
                </tr>
              </thead>
              <tbody>
                {draft.review.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Include row ${i + 1}`}
                        checked={r.included}
                        disabled={locked || busy}
                        onChange={(e) =>
                          patch(r.id, { included: e.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Description row ${i + 1}`}
                        value={r.vendor}
                        disabled={locked || busy}
                        onChange={(e) =>
                          patch(r.id, { vendor: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step=".01"
                        min="0"
                        aria-label={`Amount row ${i + 1}`}
                        value={r.amount}
                        disabled={locked || busy}
                        onChange={(e) =>
                          patch(r.id, { amount: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        aria-label={`Date row ${i + 1}`}
                        value={r.date ?? ""}
                        disabled={locked || busy}
                        onChange={(e) =>
                          patch(r.id, { date: e.target.value || null })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Type row ${i + 1}`}
                        value={r.kind}
                        disabled={locked || busy}
                        onChange={(e) =>
                          patch(r.id, {
                            kind: e.target.value as Candidate["kind"],
                            included: false,
                          })
                        }
                      >
                        <option value="expense">Expense</option>
                        <option value="credit">Credit / transfer</option>
                        <option value="unknown">Needs review</option>
                      </select>
                    </td>
                    <td className="source">
                      {r.page && <strong>Page {r.page} · </strong>}
                      {r.source}
                      <br />
                      <span style={{ color: "#8b622a" }}>
                        {r.warnings.join(" · ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="review-actions">
            <strong style={{ fontSize: 13 }}>
              {draft.review.rows.filter((r) => r.included).length} selected · $
              {reviewTotal(draft.review.rows).toFixed(2)}
            </strong>
            <span className="micro" style={{ margin: 0 }}>
              USD expenses only. Excluded rows do not affect analytics.
            </span>
          </div>
          <label className="review-actions">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            I checked the source, amount direction, currency and selected rows.
          </label>
          <div className="review-actions">
            {!locked && (
              <button
                className="btn subtle"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await save();
                    setProgress("Review saved. You can return later.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save review
              </button>
            )}
            <button
              className="btn primary"
              disabled={
                !ack || busy || !draft.review.rows.some((r) => r.included)
              }
              onClick={() => void commit()}
            >
              {busy
                ? "Processing reviewed rows…"
                : draft.upload_id
                  ? "Finish / open import"
                  : "Confirm & categorize"}{" "}
              {busy ? <Check size={15} /> : <ArrowRight size={15} />}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

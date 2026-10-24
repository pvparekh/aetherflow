"use client";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Plus,
  Download,
  Search,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import Layout from "@/components/Layout";
import ImportReview from "./ImportReview";
import AllTimeView from "@/components/expense-intel/AllTimeView";
import { api } from "@/lib/imports/http";
import { csvExport } from "@/lib/expense-intel/csv";
import {
  sampleData,
  correctSample,
  money,
  type DashboardData,
  type UploadList,
} from "./model";
import {
  CATEGORIES,
  type Pass2Result,
  type UserResolution,
} from "@/lib/expense-intel/types";

type Tab =
  "Overview" | "Transactions" | "Review" | "Vendors" | "History" | "All time";
const tabs: Tab[] = [
  "Overview",
  "Transactions",
  "Review",
  "Vendors",
  "History",
  "All time",
];
export default function Workspace({ demo = false }: { demo?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(() =>
    demo ? sampleData() : null,
  );
  const [uploads, setUploads] = useState<UploadList[]>(() =>
    demo ? [sampleData().upload] : [],
  );
  const [active, setActive] = useState(demo ? "sample" : "");
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [busy, setBusy] = useState("");
  const [pendingDelete, setPendingDelete] = useState("");
  const searchKey = useSearchParams()?.toString() ?? "";
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(
    async (id?: string) => {
      if (demo) return;
      const current = ++sequence.current;
      controller.current?.abort();
      controller.current = new AbortController();
      setLoading(true);
      setError("");
      try {
        const v = await api<{ uploads: UploadList[] }>(
          "/api/expense-intel/uploads",
          { signal: controller.current.signal },
        );
        if (current !== sequence.current) return;
        setUploads(v.uploads);
        const next =
          id ??
          v.uploads.find((u) => u.pass1_status === "complete")?.id ??
          v.uploads[0]?.id;
        if (next) {
          const d = await api<DashboardData>(
            `/api/expense-intel/dashboard/${next}`,
            { signal: controller.current.signal },
          );
          if (current === sequence.current) {
            setData(d);
            setActive(next);
          }
        } else {
          setData(null);
          setActive("");
        }
      } catch (e) {
        if (current === sequence.current && !controller.current?.signal.aborted)
          setError((e as Error).message);
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    },
    [demo],
  );
  useEffect(() => {
    void load();
    return () => {
      controller.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [query, category, from, to, active, sort]);
  useEffect(() => {
    const view = new URLSearchParams(searchKey).get("view");
    const selected = tabs.find(
      (t) => t.toLowerCase().replace(/ /g, "") === view,
    );
    if (selected) setTab(selected);
  }, [searchKey]);
  function openImport() {
    setError("");
    setImporting(true);
  }
  function chooseTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next.toLowerCase().replace(/ /g, ""));
    window.history.replaceState(null, "", url);
  }

  const items = (data?.line_items ?? [])
    .filter(
      (r) =>
        (!category || r.category === category) &&
        (!query ||
          `${r.vendor} ${r.raw_text ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!from || (!!r.transaction_date && r.transaction_date >= from)) &&
        (!to || (!!r.transaction_date && r.transaction_date <= to)),
    )
    .sort((a, b) =>
      sort === "amount-desc"
        ? Number(b.amount) - Number(a.amount)
        : sort === "amount-asc"
          ? Number(a.amount) - Number(b.amount)
          : sort === "vendor"
            ? (a.vendor ?? "").localeCompare(b.vendor ?? "")
            : (b.transaction_date ?? "").localeCompare(
                a.transaction_date ?? "",
              ),
    );
  const total =
    items.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0) / 100;
  const scoped = !!(query || category || from || to);
  const flags = (data?.flags ?? []).filter(
    (f) => !category || f.category === category,
  );
  const unresolved = flags.filter((f) =>
    f.related_line_item_ids.some(
      (id) => !data?.line_items.find((r) => r.id === id)?.user_resolution,
    ),
  );
  const categories = [
    ...new Set(data?.line_items.map((r) => r.category ?? "Misc") ?? []),
  ].sort();
  const aggregates = categories
    .map((name) => ({
      name,
      total: items
        .filter((r) => r.category === name)
        .reduce((s, r) => s + Number(r.amount), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  async function resolve(id: string, resolution: UserResolution) {
    setBusy(id);
    setError("");
    try {
      if (!demo)
        await api("/api/expense-intel/resolve", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_item_id: id, resolution }),
        });
      setData((d) =>
        d
          ? {
              ...d,
              line_items: d.line_items.map((r) =>
                r.id === id ? { ...r, user_resolution: resolution } : r,
              ),
            }
          : d,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function narrative() {
    if (!data || demo) return;
    const id = data.upload.id;
    setBusy("analysis");
    setError("");
    try {
      const result = await api<Pass2Result>("/api/expense-intel/pass2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: id }),
      });
      setData((d) =>
        d?.upload.id === id
          ? {
              ...d,
              pass2: result,
              upload: { ...d.upload, pass2_status: "complete" },
            }
          : d,
      );
    } catch (e) {
      setError(
        `Interpretation unavailable: ${(e as Error).message}. Your computed results are unchanged.`,
      );
    } finally {
      setBusy("");
    }
  }
  async function correct(id: string, value: string) {
    if (demo) {
      setData((d) => (d ? correctSample(d, id, value) : d));
      return;
    }
    setBusy(id);
    try {
      await api("/api/expense-intel/correct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_id: id, category: value }),
      });
      await load(active);
    } catch (e) {
      setError(
        `Category correction paused: ${(e as Error).message}. Retrying the same correction safely resumes recalculation.`,
      );
    } finally {
      setBusy("");
    }
  }
  function download() {
    const text = csvExport(
      items.map((r) => ({
        Vendor: r.vendor,
        Amount: r.amount,
        Date: r.transaction_date,
        Category: r.category,
        Subcategory: r.subcategory,
        Resolution: r.user_resolution,
      })),
      ["Vendor", "Amount", "Date", "Category", "Subcategory", "Resolution"],
    );
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "aetherflow-expenses.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function remove(id: string) {
    setBusy("delete");
    try {
      await api(`/api/expense-intel/uploads/${id}`, { method: "DELETE" });
      setPendingDelete("");
      await load(id === active ? undefined : active);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Layout>
      {demo && (
        <div className="demo-banner">
          INTERACTIVE DEMO · Synthetic sample data. Review actions stay in this
          page. <Link href="/signup">Create your workspace ↗</Link>
        </div>
      )}
      <main className="workspace-content">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">
              <span className="status-dot" /> YOUR WORKSPACE / EXPENSE
              INTELLIGENCE
            </p>
            <h1>
              Make sense of <em>every expense.</em>
            </h1>
            <p>
              Review the details. Understand the patterns. Decide what deserves
              a closer look.
            </p>
          </div>
          {demo ? (
            <Link className="btn primary" href="/signup">
              Get started <ArrowUpRight size={14} />
            </Link>
          ) : (
            <button className="btn primary" onClick={openImport}>
              <Plus size={14} />
              Import expenses
            </button>
          )}
        </div>
        {importing && (
          <ImportReview
            onCancel={() => setImporting(false)}
            onComplete={(id) => {
              setImporting(false);
              chooseTab("Overview");
              void load(id);
            }}
          />
        )}
        {!importing && error && (
          <div className="notice error" role="alert">
            {error}{" "}
            <button
              className="text-link"
              onClick={() => void load(active || undefined)}
            >
              Retry
            </button>{" "}
            · <Link href="/login">Sign in</Link>
          </div>
        )}
        {importing ? null : loading ? (
          <div role="status" aria-label="Loading workspace">
            <div className="skeleton" />
            <p className="micro">Loading your workspace…</p>
          </div>
        ) : !data ? (
          <section className="panel empty-state">
            <FolderOpen
              size={34}
              style={{ margin: "auto", color: "var(--forest)" }}
            />
            <h2>Your first clear picture.</h2>
            <p>
              Import an expense file and review the extracted rows before
              anything enters your analytics. Start with a CSV, or bring a PDF
              statement.
            </p>
            <div className="button-row" style={{ justifyContent: "center" }}>
              <button
                className="btn primary"
                onClick={openImport}
              >
                Import expenses <ArrowRight size={14} />
              </button>
              <Link className="btn subtle" href="/demo">
                Explore a sample
              </Link>
            </div>
            <Link className="text-link" href="/data-guide">
              Supported formats & data handling ↗
            </Link>
          </section>
        ) : data.upload.pass1_status !== "complete" ? (
          <section className="panel">
            <h2 style={{ fontSize: 26 }}>
              Your report needs to finish processing.
            </h2>
            <p className="micro">
              All reviewed rows have been saved. Statistics are unavailable
              until this step succeeds.
            </p>
            <div className="button-row">
              <button
                className="btn primary"
                disabled={busy === "rebuild"}
                onClick={async () => {
                  setBusy("rebuild");
                  try {
                    await api("/api/expense-intel/rebuild", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ upload_id: active }),
                    });
                    await load(active);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === "rebuild" ? "Finishing…" : "Retry computed analysis"}
              </button>
              <button className="btn subtle" onClick={openImport}>
                Open saved reviews
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="toolbar">
              <label style={{ minWidth: 210 }}>
                REPORT
                <select
                  aria-label="Report"
                  value={active}
                  onChange={(e) => void load(e.target.value)}
                >
                  {uploads.map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.filename}{u.pass1_status !== "complete" ? " · needs processing" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grow">
                SEARCH TRANSACTIONS
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Search size={14} />
                  <input
                    style={{ width: "100%" }}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Vendor or description"
                  />
                </span>
              </label>
              <label>
                CATEGORY
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                FROM
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                TO
                <input
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label>
                SORT
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="date-desc">Newest date</option>
                  <option value="amount-desc">Largest amount</option>
                  <option value="amount-asc">Smallest amount</option>
                  <option value="vendor">Vendor A–Z</option>
                </select>
              </label>
              <button className="btn subtle" onClick={download}>
                <Download size={14} />
                Export {scoped ? "filtered" : ""}
              </button>
              {scoped && (
                <button
                  className="text-link"
                  onClick={() => {
                    setQuery("");
                    setCategory("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="stat-grid">
              <div>
                <span className="stat-label">
                  {scoped ? "Filtered" : "Report"} expense total
                </span>
                <strong className="stat-value">{money(total)}</strong>
                <span className="stat-detail">
                  USD · {items.length} selected transactions
                </span>
              </div>
              <div>
                <span className="stat-label">Transactions</span>
                <strong className="stat-value">
                  {items.length.toLocaleString()}
                </strong>
                <span className="stat-detail">
                  {categories.length} categories in this report
                </span>
              </div>
              <div>
                <span className="stat-label">Awaiting a decision</span>
                <strong className="stat-value">{unresolved.length}</strong>
                <span className="stat-detail">
                  {category ? "Selected category" : "Report"} review signals
                </span>
              </div>
              <div>
                <span className="stat-label">Average transaction</span>
                <strong className="stat-value">
                  {items.length ? money(total / items.length) : "—"}
                </strong>
                <span className="stat-detail">
                  {scoped ? "Filtered rows" : "This report"} · not a historical
                  baseline
                </span>
              </div>
            </div>
            <div className="tabs" role="tablist" aria-label="Workspace views">
              {tabs
                .filter((t) => !demo || t !== "All time")
                .map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => chooseTab(t)}
                  >
                    {t}
                    {t === "Review" && unresolved.length > 0
                      ? ` (${unresolved.length})`
                      : ""}
                  </button>
                ))}
            </div>
            <div role="tabpanel" aria-label={tab}>
              {tab === "Overview" && (
                <>
                  <div className="workspace-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Where your money went</h2>
                          <p>
                            {scoped
                              ? "Filtered transaction totals"
                              : "This report’s category totals"}{" "}
                            · USD
                          </p>
                        </div>
                        <span className="pill">COMPUTED</span>
                      </div>
                      {aggregates.length ? (
                        aggregates.map((c) => (
                          <button
                            className="category-row"
                            key={c.name}
                            onClick={() =>
                              setCategory(category === c.name ? "" : c.name)
                            }
                          >
                            <span>{c.name}</span>
                            <span className="track">
                              <span
                                style={{
                                  width: `${total ? (c.total / total) * 100 : 0}%`,
                                }}
                              />
                            </span>
                            <span className="numeric">{money(c.total)}</span>
                          </button>
                        ))
                      ) : (
                        <p className="micro">
                          No transactions match these filters.
                        </p>
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>A useful place to start</h2>
                          <p>
                            Signals help you review. They don’t prove an error.
                          </p>
                        </div>
                        <AlertCircle size={17} color="var(--forest)" />
                      </div>
                      <div className="insight-list">
                        {flags.slice(0, 3).map((f, i) => (
                          <article key={i}>
                            <h3>{f.title}</h3>
                            <p>{f.description}</p>
                          </article>
                        ))}
                        {!flags.length && (
                          <article>
                            <h3>No review signals in this scope</h3>
                            <p>
                              This doesn’t certify every transaction. Compare
                              the report with the original source.
                            </p>
                          </article>
                        )}
                      </div>
                      <button
                        className="text-link"
                        onClick={() => chooseTab("Review")}
                      >
                        Open review queue →
                      </button>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Rolling category context</h2>
                        <p>
                          Report totals compared with recent report totals
                          across your saved history. Filters above do not
                          recompute these baselines.
                        </p>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th className="numeric">This report</th>
                            <th className="numeric">
                              Recent average · up to 5 reports
                            </th>
                            <th className="numeric">All-history average</th>
                            <th>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.category_stats
                            .filter((s) => !category || s.category === category)
                            .map((s) => (
                              <tr key={s.category}>
                                <td>{s.category}</td>
                                <td className="numeric">
                                  {money(s.total_spend_period)}
                                </td>
                                <td className="numeric">
                                  {money(s.rolling_avg_5)}
                                </td>
                                <td className="numeric">
                                  {money(s.rolling_avg_alltime)}
                                </td>
                                <td>{s.trend_direction}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="micro">
                      Report sizes and date coverage may differ. Small samples
                      and a first report provide limited historical evidence.
                    </p>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Model interpretation</h2>
                        <p>
                          Optional AI commentary on precomputed aggregates. It
                          may make mistakes; your transaction totals remain
                          authoritative.
                        </p>
                      </div>
                      {!demo && !data.pass2 && (
                        <button
                          className="btn subtle"
                          disabled={busy === "analysis"}
                          onClick={() => void narrative()}
                        >
                          {busy === "analysis"
                            ? "Preparing…"
                            : "Generate interpretation"}
                          <ArrowUpRight size={13} />
                        </button>
                      )}
                    </div>
                    {data.pass2 ? (
                      <div className="insight-list">
                        <article>
                          <h3>Report summary</h3>
                          <p>{data.pass2.narrative_summary}</p>
                        </article>
                        {data.pass2.insights.map((i, n) => (
                          <article key={n}>
                            <h3>{i.title}</h3>
                            <p>{i.description}</p>
                          </article>
                        ))}
                        {data.pass2.savings_opportunities.map((i, n) => (
                          <article key={`s${n}`}>
                            <h3>
                              {i.title} · {i.estimated_impact}
                            </h3>
                            <p>{i.description}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="micro">
                        {demo
                          ? "AI generation is disabled in this isolated demo."
                          : "Your computed analysis is ready to use without AI commentary."}
                      </p>
                    )}
                  </section>
                </>
              )}
              {tab === "Transactions" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>The details, in one place.</h2>
                      <p>
                        {items.length} matching transactions · Select a
                        description to inspect original evidence.
                      </p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Vendor / description</th>
                          <th>Date</th>
                          <th>Category</th>
                          <th className="numeric">Amount · USD</th>
                          <th>Review status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.slice((page - 1) * 25, page * 25).map((r) => (
                          <Fragment key={r.id}>
                            <tr>
                              <td className="merchant">
                                <button
                                  className="row-button"
                                  onClick={() =>
                                    setExpanded(expanded === r.id ? "" : r.id)
                                  }
                                  aria-expanded={expanded === r.id}
                                >
                                  {r.vendor ?? "Unknown vendor"} ↗
                                </button>
                                <small>
                                  {r.subcategory ?? "No subcategory"}
                                </small>
                              </td>
                              <td>
                                {r.transaction_date ?? "Date unavailable"}
                              </td>
                              <td>
                                <select
                                  aria-label={`Category for ${r.vendor}`}
                                  value={r.category ?? "Misc"}
                                  disabled={busy === r.id}
                                  onChange={(e) =>
                                    void correct(r.id, e.target.value)
                                  }
                                >
                                  {CATEGORIES.map((c) => (
                                    <option key={c}>{c}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="numeric">{money(r.amount)}</td>
                              <td>
                                {r.user_resolution ??
                                  (r.is_anomaly || r.is_possible_duplicate
                                    ? "Needs review"
                                    : "No signal")}
                              </td>
                            </tr>
                            {expanded === r.id && (
                              <tr>
                                <td colSpan={5}>
                                  <div className="details-panel">
                                    <strong>Original extracted evidence</strong>
                                    <p>
                                      <code>
                                        {r.raw_text ??
                                          "No source evidence recorded for this legacy import."}
                                      </code>
                                    </p>
                                    <p>
                                      Category source:{" "}
                                      {r.category_origin === "user"
                                        ? "User confirmed"
                                        : "Model suggested"}{" "}
                                      · Confidence:{" "}
                                      {r.confidence == null
                                        ? "unavailable"
                                        : `${Math.round(Number(r.confidence) * 100)}%`}{" "}
                                      · Review signals:{" "}
                                      {[
                                        r.is_possible_duplicate &&
                                          "possible duplicate",
                                        r.is_first_time_vendor &&
                                          "first-time vendor",
                                        r.is_round_number && "round amount",
                                        r.is_anomaly &&
                                          `unusual amount (${r.anomaly_severity})`,
                                      ]
                                        .filter(Boolean)
                                        .join(", ") || "none"}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!items.length && (
                    <div className="empty-state">
                      <h2>No matches.</h2>
                      <p>
                        Try a broader date range, category or search. Rows with
                        an unknown date are excluded by date filters.
                      </p>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>
                      Page {page} of {Math.max(1, Math.ceil(items.length / 25))}
                    </span>
                    <div>
                      <button
                        className="btn subtle"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </button>{" "}
                      <button
                        className="btn subtle"
                        disabled={page * 25 >= items.length}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {tab === "Review" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>A closer look.</h2>
                      <p>
                        Category filter applies. Search and date filters apply
                        to transaction totals, not these report signals.
                      </p>
                    </div>
                    <span className="pill">{unresolved.length} UNRESOLVED</span>
                  </div>
                  {flags.length ? (
                    flags.map((f, i) => (
                      <article className="review-card" key={i}>
                        <div>
                          <span className="eyebrow">
                            {f.flag_type.replace("_", " ")} / {f.metric}
                          </span>
                          <h3>{f.title}</h3>
                          <p>{f.description}</p>
                          {f.duplicate_context && (
                            <p>
                              Matching source:{" "}
                              {f.duplicate_context.match.filename} ·{" "}
                              {f.duplicate_context.match.transaction_date ??
                                "unknown date"}
                            </p>
                          )}
                        </div>
                        {f.related_line_item_ids.map((id) => {
                          const resolution = data.line_items.find(
                            (r) => r.id === id,
                          )?.user_resolution;
                          return (
                            <div className="review-actions" key={id}>
                              <span className="pill">
                                {resolution ?? "Needs a decision"}
                              </span>
                              <button
                                className="btn subtle"
                                disabled={busy === id}
                                onClick={() => void resolve(id, "expected")}
                              >
                                <CheckCircle2 size={13} />
                                Expected
                              </button>
                              <button
                                className="btn subtle"
                                disabled={busy === id}
                                onClick={() => void resolve(id, "investigate")}
                              >
                                Investigate
                              </button>
                              {resolution && (
                                <button
                                  className="text-link"
                                  disabled={busy === id}
                                  onClick={() => void resolve(id, null)}
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <CheckCircle2 size={30} style={{ margin: "auto" }} />
                      <h2>Nothing flagged here.</h2>
                      <p>
                        Review the transactions against your source whenever
                        accuracy matters.
                      </p>
                    </div>
                  )}
                </section>
              )}
              {tab === "Vendors" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Your vendor landscape</h2>
                      <p>
                        Across all saved imports · Category filter applies.
                        Transaction search and dates do not filter these
                        historical aggregates.
                      </p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Primary category</th>
                          <th className="numeric">Total spend</th>
                          <th className="numeric">Occurrences</th>
                          <th>Recurrence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.vendors
                          .filter(
                            (v) => !category || v.primary_category === category,
                          )
                          .sort(
                            (a, b) =>
                              Number(b.total_spend) - Number(a.total_spend),
                          )
                          .map((v) => (
                            <tr key={v.id}>
                              <td className="merchant">{v.vendor_name}</td>
                              <td>{v.primary_category}</td>
                              <td className="numeric">
                                {money(v.total_spend)}
                              </td>
                              <td className="numeric">{v.total_occurrences}</td>
                              <td>{v.recurrence_tier.replace("_", " ")}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {tab === "History" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Saved expense reports</h2>
                      <p>
                        Saved reports. Unfinished candidate reviews are
                        available in the import panel.
                      </p>
                    </div>
                  </div>
                  {uploads.map((u) => (
                    <div className="history-row" key={u.id}>
                      <button
                        className="row-button"
                        onClick={() => {
                          chooseTab("Overview");
                          void load(u.id);
                        }}
                      >
                        <strong>{u.filename}</strong>
                        <small>
                          {new Date(u.uploaded_at).toLocaleDateString("en-US", {
                            timeZone: "UTC",
                          })}{" "}
                          · {u.line_item_count} transactions · {u.pass1_status}
                        </small>
                      </button>
                      <span className="numeric">{money(u.total_amount)}</span>
                      {!demo && (
                        <button
                          className="danger-link"
                          onClick={() => setPendingDelete(u.id)}
                        >
                          Delete
                        </button>
                      )}
                      {pendingDelete === u.id && (
                        <div className="notice error" role="alert">
                          Permanently delete this report and its analysis?{" "}
                          <button
                            className="btn subtle"
                            disabled={busy === "delete"}
                            onClick={() => void remove(u.id)}
                          >
                            Delete report
                          </button>{" "}
                          <button
                            className="btn subtle"
                            onClick={() => setPendingDelete("")}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {tab === "All time" && !demo && <AllTimeView />}
            </div>
            <div className="workspace-footnote">
              <span>
                <span className="status-dot" /> {data.upload.filename} ·{" "}
                {new Date(data.upload.uploaded_at).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </span>
              <Link href="/data-guide">Understand the data ↗</Link>
              <button
                className="row-button"
                onClick={() => void load(active)}
                aria-label="Refresh report"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </>
        )}
      </main>
    </Layout>
  );
}

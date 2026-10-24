"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/imports/http";
import { money } from "@/components/workspace/model";
interface AggregateData {
  category_totals: {
    category: string;
    total_spend_alltime: number;
    rolling_avg_5: number;
    trend_direction: string;
  }[];
  top_vendors: {
    vendor_name: string;
    total_spend: number;
    total_occurrences: number;
    primary_category: string;
    recurrence_tier: string;
  }[];
  category_history: {
    category: string;
    points: { uploaded_at: string; total: number }[];
  }[];
  total_anomalies: number;
  total_uploads: number;
}
export default function AllTimeView() {
  const [data, setData] = useState<AggregateData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<AggregateData>("/api/expense-intel/aggregate", {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  if (error)
    return (
      <div className="notice error" role="alert">
        {error}{" "}
        <button
          className="btn subtle"
          onClick={() => {
            setError("");
            setAttempt((v) => v + 1);
          }}
        >
          Retry all-time data
        </button>
      </div>
    );
  if (!data)
    return (
      <div
        className="skeleton"
        role="status"
        aria-label="Loading all-time data"
      />
    );
  if (!data.total_uploads)
    return (
      <div className="panel empty-state">
        <h2>No completed reports yet.</h2>
        <p>
          Finish reviewing and processing your first import to see your
          historical view.
        </p>
      </div>
    );
  const total = data.category_totals.reduce(
    (s, r) => s + Number(r.total_spend_alltime),
    0,
  );
  return (
    <>
      <div className="notice info">
        ALL SAVED HISTORY · Completed reports only. This view uses all reports;
        the report filters above do not apply. Reports may cover different or
        overlapping periods.
      </div>
      <div className="stat-grid">
        <div>
          <span className="stat-label">All-history expense total</span>
          <strong className="stat-value">{money(total)}</strong>
          <span className="stat-detail">USD · all saved expense rows</span>
        </div>
        <div>
          <span className="stat-label">Completed reports</span>
          <strong className="stat-value">{data.total_uploads}</strong>
        </div>
        <div>
          <span className="stat-label">Statistical signals</span>
          <strong className="stat-value">{data.total_anomalies}</strong>
          <span className="stat-detail">Not evidence of error or fraud</span>
        </div>
      </div>
      <div className="workspace-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Spend across categories</h2>
              <p>All-history totals · USD</p>
            </div>
          </div>
          {data.category_totals.map((c) => (
            <div
              className="category-row"
              style={{ cursor: "default" }}
              key={c.category}
            >
              <span>{c.category}</span>
              <span className="track">
                <span
                  style={{
                    width: `${total ? (Number(c.total_spend_alltime) / total) * 100 : 0}%`,
                  }}
                />
              </span>
              <span className="numeric">{money(c.total_spend_alltime)}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Report-by-report history</h2>
              <p>
                Category totals by upload date; table provides the exact values.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Uploaded</th>
                  <th className="numeric">Expense total · USD</th>
                </tr>
              </thead>
              <tbody>
                {data.category_history.flatMap((c) =>
                  c.points.map((p, i) => (
                    <tr key={`${c.category}-${i}`}>
                      <td>{c.category}</td>
                      <td>
                        {new Date(p.uploaded_at).toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })}
                      </td>
                      <td className="numeric">{money(p.total)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Vendors across your history</h2>
            <p>Ordered by total spend · up to 20 vendors</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Primary category</th>
                <th className="numeric">Total · USD</th>
                <th className="numeric">Occurrences</th>
                <th>Recurrence</th>
              </tr>
            </thead>
            <tbody>
              {data.top_vendors.map((v) => (
                <tr key={v.vendor_name}>
                  <td>{v.vendor_name}</td>
                  <td>{v.primary_category}</td>
                  <td className="numeric">{money(v.total_spend)}</td>
                  <td className="numeric">{v.total_occurrences}</td>
                  <td>{v.recurrence_tier.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

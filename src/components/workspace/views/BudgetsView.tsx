"use client";
// Monthly budgets per category. Demo: budgets live in component state and
// progress is computed in the browser with `budgetProgress`. Signed in: the
// budgets route stores targets and computes progress on the server. Either
// way every figure comes from the same pure function, never from a model.
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  CircleCheck,
  Pencil,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { CATEGORIES, type Category } from "@/lib/expense-intel/types";
import {
  budgetProgress,
  daysElapsed,
  daysInMonth,
  defaultBudgetMonth,
  monthOf,
  parseBudgetInput,
  type BudgetInput,
  type BudgetProgress,
  type BudgetTarget,
} from "@/lib/expense-intel/budgets";
import { money } from "@/lib/expense-intel/ask";
import { monthLabel } from "@/lib/expense-intel/ask/dates";
import type { ViewProps } from "./types";
import styles from "./budgets-ask.module.css";

/** Starting budgets for the demo: a realistic mix of on-track and over. */
export const DEMO_BUDGETS: readonly BudgetTarget[] = [
  { category: "Food/Dining", monthly_target: 800 },
  { category: "Travel/Transport", monthly_target: 250 },
  { category: "Software/SaaS", monthly_target: 300 },
  { category: "Entertainment", monthly_target: 150 },
  { category: "Utilities", monthly_target: 180 },
];

const BUDGETS_URL = "/api/expense-intel/budgets";
/** Months offered in the picker when signed in (the route has no month list). */
const SIGNED_IN_MONTHS = 12;

interface RemoteBudgets {
  month: string;
  asOf: string;
  budgets: BudgetProgress[];
}

type SaveResult = string | null;

const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");

const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100)).toFixed(2)}%`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : null;
    throw new Error(
      message ??
        (res.status === 401
          ? "Sign in again to manage budgets."
          : "Budgets are unavailable right now. Try again shortly."),
    );
  }
  return body as T;
}

/** "1,250", "$1,250.00" and " 80 " all parse; anything else stays NaN for the validator. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  return /^\d*\.?\d*$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

function validate(category: string, text: string): { ok: true; value: BudgetInput } | { ok: false; error: string } {
  const amount = parseAmount(text);
  if (amount === null) return { ok: false, error: "Enter a monthly amount" };
  return parseBudgetInput({ category, monthly_target: amount });
}

/** The `count` months ending at `last`, newest first. */
function monthsEndingAt(last: string, count: number): string[] {
  const [year, month] = last.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

function categoryLabel(category: string) {
  return category.replace("/", " / ");
}

// ---------------------------------------------------------------------------

export default function BudgetsView({ demo, txns, today }: ViewProps) {
  const ids = useId();
  const local = demo && txns !== null;

  // Demo state.
  const [demoBudgets, setDemoBudgets] = useState<BudgetTarget[]>(() => [...DEMO_BUDGETS]);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);

  // Signed-in state.
  const [remote, setRemote] = useState<RemoteBudgets | null>(null);
  const [loading, setLoading] = useState(!local);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (month: string | null) => {
    try {
      const data = await requestJson<RemoteBudgets>(
        month ? `${BUDGETS_URL}?month=${encodeURIComponent(month)}` : BUDGETS_URL,
      );
      setRemote(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load budgets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (local) return;
    void load(pickedMonth);
  }, [local, load, pickedMonth]);

  // --- Derived figures ---------------------------------------------------

  const demoMonths = useMemo(() => {
    if (!local) return [];
    return [...new Set(txns.map((t) => monthOf(t.date)))].sort().reverse();
  }, [local, txns]);

  const month = local
    ? (pickedMonth ?? defaultBudgetMonth(txns, today))
    : (remote?.month ?? pickedMonth);
  const asOf = local ? today : (remote?.asOf ?? today);

  const progress: BudgetProgress[] = useMemo(() => {
    if (local) return month ? budgetProgress(txns, demoBudgets, month, today) : [];
    return remote?.budgets ?? [];
  }, [local, txns, demoBudgets, month, today, remote]);

  const monthOptions = useMemo(() => {
    if (local) return demoMonths;
    const anchor = [remote?.month, monthOf(asOf)].filter(Boolean).sort().reverse()[0];
    return anchor ? monthsEndingAt(anchor, SIGNED_IN_MONTHS) : [];
  }, [local, demoMonths, remote?.month, asOf]);

  const monthInProgress =
    month !== null && daysElapsed(month, asOf) > 0 && daysElapsed(month, asOf) < daysInMonth(month);

  const unbudgeted = CATEGORIES.filter((c) => !progress.some((p) => p.category === c));

  // --- Mutations ---------------------------------------------------------

  async function save(input: BudgetInput): Promise<SaveResult> {
    if (local) {
      setDemoBudgets((current) => [
        ...current.filter((b) => b.category !== input.category),
        input,
      ]);
      return null;
    }
    try {
      await requestJson(BUDGETS_URL, { method: "PUT", body: JSON.stringify(input) });
      await load(month);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not save that budget.";
    }
  }

  async function remove(category: string): Promise<SaveResult> {
    if (local) {
      setDemoBudgets((current) => current.filter((b) => b.category !== category));
      return null;
    }
    try {
      await requestJson(`${BUDGETS_URL}?category=${encodeURIComponent(category)}`, {
        method: "DELETE",
      });
      await load(month);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not remove that budget.";
    }
  }

  function changeMonth(next: string) {
    if (!local) setLoading(true);
    setPickedMonth(next);
  }

  // --- Render ------------------------------------------------------------

  const totalTarget = progress.reduce((sum, p) => sum + p.target, 0);
  const totalSpent = progress.reduce((sum, p) => sum + p.spent, 0);
  const overCount = progress.filter((p) => p.status === "over").length;
  const nearCount = progress.filter((p) => p.status === "near").length;

  return (
    <section className={styles.view} aria-labelledby={`${ids}-title`}>
      <div className={styles.header}>
        <div>
          <h2 id={`${ids}-title`} className={styles.title}>
            <Target size={20} className={styles.titleIcon} aria-hidden />
            Monthly budgets
          </h2>
          <p className={styles.lead}>
            Set a monthly limit for any category and see how much is left.
            {monthInProgress
              ? " Mid-month, the striped bar shows where you will land if you keep spending at the same pace."
              : null}
          </p>
        </div>
        {monthOptions.length > 0 && month ? (
          <div className={styles.field}>
            <label htmlFor={`${ids}-month`}>Month</label>
            <select
              id={`${ids}-month`}
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
              disabled={loading}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className={cx(styles.notice, styles.noticeError)} role="alert">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <p>{loadError}</p>
            <button
              type="button"
              className={styles.iconButton}
              style={{ marginTop: 8 }}
              onClick={() => {
                setLoading(true);
                void load(pickedMonth);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {loading && !remote ? (
        <div className={styles.card} aria-busy="true">
          <div className={styles.skeleton} />
          <p className={cx(styles.muted, styles.small)} style={{ marginTop: 12 }}>
            Loading your budgets…
          </p>
        </div>
      ) : (
        <>
          {progress.length > 0 ? (
            <div className={styles.summary}>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Spent in budgeted categories</span>
                <strong className={styles.tileValue}>{money(totalSpent)}</strong>
                <span className={styles.tileDetail}>
                  {month ? monthLabel(month) : ""}
                </span>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Total of your limits</span>
                <strong className={styles.tileValue}>{money(totalTarget)}</strong>
                <span className={styles.tileDetail}>
                  {totalSpent <= totalTarget
                    ? `${money(totalTarget - totalSpent)} left overall`
                    : `${money(totalSpent - totalTarget)} over overall`}
                </span>
              </div>
              <div className={cx(styles.tile, overCount > 0 && styles.tileDanger)}>
                <span className={styles.tileLabel}>Over the limit</span>
                <strong className={styles.tileValue}>
                  {overCount} of {progress.length}
                </strong>
                <span className={styles.tileDetail}>
                  {nearCount > 0
                    ? `${nearCount} more close to the limit`
                    : overCount === 0
                      ? "Everything is within budget"
                      : "The rest are within budget"}
                </span>
              </div>
            </div>
          ) : null}

          <div className={styles.card} aria-busy={loading}>
            {progress.length === 0 ? (
              <p className={styles.empty}>
                No budgets yet. Add one below to see how a category is tracking
                against a monthly limit.
              </p>
            ) : (
              <>
                <ul className={styles.budgetList} aria-label="Budgets">
                  {progress.map((p) => (
                    <BudgetRow
                      key={p.category}
                      progress={p}
                      showPace={monthInProgress}
                      onSave={save}
                      onRemove={remove}
                    />
                  ))}
                </ul>
                <div className={styles.legend} aria-hidden>
                  <span>
                    <i className={cx(styles.swatch, styles.swatchSpent)} /> Spent
                  </span>
                  {monthInProgress ? (
                    <span>
                      <i className={cx(styles.swatch, styles.swatchPace)} /> At this pace
                    </span>
                  ) : null}
                  <span>
                    <i className={cx(styles.swatch, styles.swatchLimit)} /> Your limit
                    (when passed)
                  </span>
                </div>
              </>
            )}
          </div>

          {unbudgeted.length > 0 ? (
            <AddBudget categories={unbudgeted} onSave={save} />
          ) : (
            <p className={cx(styles.muted, styles.small)}>Every category has a budget.</p>
          )}

          <p className={cx(styles.muted, styles.small)}>
            {local
              ? "Sample budgets on synthetic data. Changes here stay in this browser tab."
              : "Limits apply to every month. Figures are recalculated from your expenses each time you open this page."}
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function statusText(p: BudgetProgress) {
  if (p.status === "over") return `Over by ${money(-p.remaining)}`;
  if (p.status === "near") return `${money(p.remaining)} left, close to the limit`;
  return `${money(p.remaining)} left`;
}

function BudgetRow({
  progress: p,
  showPace,
  onSave,
  onRemove,
}: {
  progress: BudgetProgress;
  showPace: boolean;
  onSave: (input: BudgetInput) => Promise<SaveResult>;
  onRemove: (category: string) => Promise<SaveResult>;
}) {
  const ids = useId();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pace = showPace && p.projected !== null ? p.projected : null;
  const scale = Math.max(p.target, p.spent, pace ?? 0) || 1;
  const paceOver = pace !== null && pace > p.target;
  const name = categoryLabel(p.category);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = validate(p.category, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    const failure = await onSave(parsed.value);
    setBusy(false);
    if (failure) setError(failure);
    else setMode("view");
  }

  async function confirmRemove() {
    setBusy(true);
    const failure = await onRemove(p.category);
    setBusy(false);
    if (failure) {
      setError(failure);
      setMode("view");
    }
  }

  return (
    <li className={styles.budget}>
      <div className={styles.budgetTop}>
        <span className={styles.budgetName}>{name}</span>
        <span className={styles.budgetFigures}>
          <strong className={styles.num}>{money(p.spent)}</strong> of{" "}
          <span className={styles.num}>{money(p.target)}</span>
          <span className={styles.srOnly}> ({p.percentUsed}% used)</span>
        </span>
      </div>

      <div className={styles.track} aria-hidden>
        {pace !== null ? (
          <span
            className={cx(styles.ghost, paceOver && styles.overGhost)}
            style={{ width: pct(pace / scale) }}
          />
        ) : null}
        <span
          className={cx(styles.fill, styles[p.status])}
          style={{ width: pct(p.spent / scale) }}
        />
        {scale > p.target ? (
          <span className={styles.limitMark} style={{ left: pct(p.target / scale) }} />
        ) : null}
      </div>

      <div className={styles.budgetBottom}>
        <div>
          <span className={cx(styles.status, styles[p.status])}>
            {p.status === "over" ? (
              <AlertTriangle size={14} aria-hidden />
            ) : (
              <CircleCheck size={14} aria-hidden />
            )}
            {statusText(p)}
          </span>
          {pace !== null ? (
            <p className={styles.projection}>
              At this pace, about <span className={styles.num}>{money(pace)}</span> by
              month end
              {paceOver ? `, ${money(pace - p.target)} over` : ""}.
            </p>
          ) : null}
        </div>

        {mode === "view" ? (
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                setDraft(String(p.target));
                setError(null);
                setMode("edit");
              }}
              aria-label={`Edit ${name} budget`}
            >
              <Pencil size={14} aria-hidden /> Edit
            </button>
            <button
              type="button"
              className={cx(styles.iconButton, styles.dangerButton)}
              onClick={() => {
                setError(null);
                setMode("confirm");
              }}
              aria-label={`Remove ${name} budget`}
            >
              <Trash2 size={14} aria-hidden /> Remove
            </button>
          </div>
        ) : null}

        {mode === "confirm" ? (
          <div className={styles.rowActions} role="group" aria-label={`Remove ${name} budget?`}>
            <span className={cx(styles.small, styles.muted)} style={{ alignSelf: "center" }}>
              Remove this budget?
            </span>
            <button
              type="button"
              className={cx(styles.iconButton, styles.dangerButton)}
              onClick={() => void confirmRemove()}
              disabled={busy}
            >
              <Trash2 size={14} aria-hidden /> Remove
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setMode("view")}
              disabled={busy}
            >
              Keep
            </button>
          </div>
        ) : null}
      </div>

      {mode === "edit" ? (
        <form className={styles.inlineForm} onSubmit={(e) => void submit(e)} noValidate>
          <div className={styles.field}>
            <label htmlFor={`${ids}-amount`}>Monthly limit for {name}</label>
            <div className={styles.amountInput}>
              <span aria-hidden>$</span>
              <input
                id={`${ids}-amount`}
                inputMode="decimal"
                autoComplete="off"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${ids}-error` : undefined}
                autoFocus
              />
            </div>
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            <Check size={14} aria-hidden /> Save
          </button>
          <button
            type="button"
            className="btn subtle"
            onClick={() => {
              setMode("view");
              setError(null);
            }}
            disabled={busy}
          >
            <X size={14} aria-hidden /> Cancel
          </button>
        </form>
      ) : null}

      {error ? (
        <p id={`${ids}-error`} className={styles.error} role="alert">
          <AlertTriangle size={14} aria-hidden /> {error}
        </p>
      ) : null}
    </li>
  );
}

function AddBudget({
  categories,
  onSave,
}: {
  categories: readonly Category[];
  onSave: (input: BudgetInput) => Promise<SaveResult>;
}) {
  const ids = useId();
  const [category, setCategory] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = categories.includes(category as Category) ? category : categories[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = validate(selected, amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    const failure = await onSave(parsed.value);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setAmount("");
    setCategory("");
  }

  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} noValidate aria-labelledby={`${ids}-heading`}>
      <h3 id={`${ids}-heading`} className={styles.sectionTitle}>
        Add a budget
      </h3>
      <div className={styles.addForm}>
        <div className={styles.field}>
          <label htmlFor={`${ids}-category`}>Category</label>
          <select
            id={`${ids}-category`}
            value={selected}
            onChange={(e) => {
              setCategory(e.target.value);
              setError(null);
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${ids}-amount`}>Monthly limit</label>
          <div className={styles.amountInput}>
            <span aria-hidden>$</span>
            <input
              id={`${ids}-amount`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="250"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-error` : undefined}
            />
          </div>
        </div>
        <button type="submit" className="btn primary" disabled={busy}>
          <Plus size={14} aria-hidden /> Add budget
        </button>
      </div>
      {error ? (
        <p id={`${ids}-error`} className={styles.error} role="alert" style={{ marginTop: 10 }}>
          <AlertTriangle size={14} aria-hidden /> {error}
        </p>
      ) : null}
    </form>
  );
}

export { BudgetsView };

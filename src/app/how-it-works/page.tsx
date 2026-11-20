import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Layout from "@/components/Layout";
import s from "./how-it-works.module.css";
import { buildScoreboard, pct, runDate, seconds, topBy } from "./scoreboard";

export const metadata: Metadata = {
  title: "How it works | AetherFlow",
  description:
    "The engineering behind AetherFlow's leak finder: a categorisation pipeline that puts the model last, a leak engine where code computes every number, a faithfulness check on model wording, and a measured eval scoreboard.",
};

type Actor = "code" | "model" | "checked";

const ACTOR_LABEL: Record<Actor, string> = {
  code: "Code",
  model: "Model",
  checked: "Model, checked by code",
};

function Tag({ actor }: { actor: Actor }) {
  return <span className={`${s.tag} ${s[actor]}`}>{ACTOR_LABEL[actor]}</span>;
}

const DECISIONS = [
  {
    title: "A provider-neutral model layer",
    text: "Every model call goes through one function: OpenAI-compatible chat completions with a strict JSON schema, temperature 0, validated in code. Switching between a local Ollama model and a hosted open model is an environment variable. Chat completions won over the Responses API because Ollama's version ignores JSON mode and has no seed.",
  },
  {
    title: "Code computes every number",
    text: "The model categorises, extracts PDF rows, writes wording and translates questions. Totals, averages, cadences, price changes and anomaly scores are TypeScript. A model outage removes wording, never results.",
  },
  {
    title: "A faithfulness check on wording",
    text: "After the model writes a summary or draft, code scans it for every amount, percentage, count, date and name. Each must trace to a value code supplied. If one does not, the text is replaced by a template built from the same numbers.",
  },
  {
    title: "Robust scores on log amounts",
    text: "A plain z-score cannot exceed (n-1)/√n, so with 10 or fewer charges it can never reach 3. Unusual charges are scored as 0.6745 × (ln x − median) / MAD against the vendor's own history (at least 5 charges) or the category, and flagged at 3.5.",
  },
  {
    title: "Confidence from the path, not self-report",
    text: "Small models report confidence poorly. A row's confidence is set by what resolved it: a merchant rule (1.0), your own history (0.9), the model (0.7), or the fallback (0, marked for review).",
  },
  {
    title: "The demo runs in your browser",
    text: "The analysis modules have no server-only imports, so the public demo runs the real leak engine and query executor on 12 months of synthetic data with no backend and no model. Model-only outputs there are precomputed and labelled as samples.",
  },
];

export default function HowItWorks() {
  const board = buildScoreboard();
  const { run } = board;
  const c = run.categorisation;
  const mostMissed = topBy(board.categories, "missed", 3);
  const mostExtra = topBy(board.categories, "extra", 2);
  const list = (rows: typeof mostMissed, key: "missed" | "extra") =>
    rows.map((r) => `${r.category} (${key === "extra" ? "+" : ""}${r[key]})`).join(", ");

  return (
    <Layout>
      <main className={s.page}>
        <header className={`af-width ${s.hero}`}>
          <p className="eyebrow">
            <span className="status-dot" /> HOW IT WORKS
          </p>
          <h1>
            Code does the maths,
            <br />
            <em>and the model only writes the words.</em>
          </h1>
          <p className={s.lead}>
            AetherFlow reads your card or bank statements and finds money leaking
            out: forgotten subscriptions, price increases, duplicate charges and
            unusual charges. This page shows how a statement becomes a report,
            where a language model is allowed to help, how its output is
            checked, and how well it currently performs.
          </p>
        </header>

        <section className={`af-width ${s.section}`} aria-labelledby="pipeline-heading">
          <p className="eyebrow">01 / THE PIPELINE</p>
          <h2 id="pipeline-heading">From a statement to a leak report</h2>
          <p className={s.sectionLead}>
            Each step is labelled by who does the work. The model is used last,
            on the fewest rows, and its output is always validated before
            anything downstream sees it.
          </p>

          <ol className={s.pipeline}>
            <li className={s.stage}>
              <div className={s.stageHead}>
                <h3>Upload</h3>
                <Tag actor="code" />
              </div>
              <p>You upload CSV, TXT or PDF statements without connecting a bank account.</p>
            </li>
            <li className={s.stage}>
              <div className={s.stageHead}>
                <h3>Parse</h3>
                <Tag actor="code" />
              </div>
              <p>
                CSV and TXT are parsed by code. PDFs are read with PDF.js, then
                the model extracts rows into a fixed schema. Every amount is
                stored as a positive expense, and you review the rows before
                import.
              </p>
            </li>
            <li className={s.stage}>
              <div className={s.stageHead}>
                <h3>Normalise merchants</h3>
                <Tag actor="code" />
              </div>
              <p>
                Raw descriptors such as <code>SQ *BLUE BOTTLE COFFEE 0611</code>{" "}
                become one stable vendor key, so the same merchant is recognised
                across statements.
              </p>
            </li>
            <li className={`${s.stage} ${s.group}`}>
              <div className={s.stageHead}>
                <h3>Categorise, model last</h3>
              </div>
              <ol className={s.substeps}>
                <li>
                  <div className={s.stageHead}>
                    <h4>Merchant rules</h4>
                    <Tag actor="code" />
                  </div>
                  <p>Known merchants and your corrections resolve instantly.</p>
                </li>
                <li>
                  <div className={s.stageHead}>
                    <h4>History vote</h4>
                    <Tag actor="code" />
                  </div>
                  <p>Your own past labels for the vendor decide by majority.</p>
                </li>
                <li>
                  <div className={s.stageHead}>
                    <h4>Model in batches of 25</h4>
                    <Tag actor="model" />
                  </div>
                  <p>
                    The model only sees the rows left over. Rows are keyed by ID
                    and categories are an enum in a strict JSON schema.
                  </p>
                  <p className={s.ladderLabel}>If the output is invalid:</p>
                  <ol className={s.ladder} aria-label="Failure ladder">
                    <li>Retry once</li>
                    <li>Halve the batch</li>
                    <li>One row at a time</li>
                    <li>&ldquo;Misc, needs review&rdquo;</li>
                  </ol>
                </li>
              </ol>
            </li>
            <li className={s.stage}>
              <div className={s.stageHead}>
                <h3>Leak engine</h3>
                <Tag actor="code" />
              </div>
              <ul className={s.chips}>
                <li>Recurring charges: cadence, next date, annual cost</li>
                <li>Price increases</li>
                <li>Duplicate charges</li>
                <li>Unusual charges</li>
              </ul>
              <p>
                Also builds the upcoming-charges calendar (downloadable as an{" "}
                <code>.ics</code> file) and the leak totals.
              </p>
            </li>
            <li className={s.stage}>
              <div className={s.stageHead}>
                <h3>Narrative and drafts</h3>
                <Tag actor="checked" />
              </div>
              <p>
                The model writes a plain-English summary and cancellation or
                negotiation drafts from figures code supplies. A faithfulness
                check verifies every number and name in the text; anything
                unsupported falls back to a template.
              </p>
            </li>
            <li className={s.stage}>
              <div className={s.stageHead}>
                <h3>Ask your spending</h3>
                <Tag actor="checked" />
              </div>
              <ol className={s.flow} aria-label="Ask flow">
                <li>Your question</li>
                <li>Model writes a structured query</li>
                <li>Validated against the schema</li>
                <li>Code runs it on your data</li>
                <li>Answer worded from the computed rows</li>
              </ol>
            </li>
          </ol>
        </section>

        <section className={`af-width ${s.section}`} aria-labelledby="decisions-heading">
          <p className="eyebrow">02 / DESIGN DECISIONS</p>
          <h2 id="decisions-heading">Choices, and why</h2>
          <p className={s.sectionLead}>
            Drawn from the project&rsquo;s decision log, where each entry also
            records what evidence would reverse it.
          </p>
          <div className={s.decisions}>
            {DECISIONS.map((d, i) => (
              <article key={d.title} className={s.decision}>
                <span className={s.decisionNumber}>{String(i + 1).padStart(2, "0")}</span>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`af-width ${s.section}`} aria-labelledby="eval-heading">
          <p className="eyebrow">03 / EVAL SCOREBOARD</p>
          <h2 id="eval-heading">How accurate is categorisation?</h2>
          <p className={s.sectionLead}>
            {board.datasetRows} real-world style bank descriptors, labelled by
            hand across all nine categories, including deliberately ambiguous
            merchants. Model: <strong>{run.model}</strong> ({run.provider}),
            run on {runDate(run.runAt)}.
          </p>

          <dl className={s.stats}>
            <div>
              <dt>Accuracy</dt>
              <dd>{pct(c.accuracy)}</dd>
              <p>
                {board.correct} of {board.datasetRows} rows correct
              </p>
            </div>
            <div>
              <dt>Macro F1</dt>
              <dd>{pct(c.macroF1)}</dd>
              <p>Averaged evenly across categories</p>
            </div>
            <div>
              <dt>Schema-valid output</dt>
              <dd>{pct(c.schemaValidRate)}</dd>
              <p>Responses that passed validation</p>
            </div>
            <div>
              <dt>Latency per batch of 25</dt>
              <dd>{seconds(run.latencyMs.p50)}</dd>
              <p>
                p50; p95 {seconds(run.latencyMs.p95)},{" "}
                {run.provider === "ollama" ? "on a local GPU" : `hosted (${run.provider})`}
              </p>
            </div>
          </dl>

          <div className={s.tableWrap}>
            <table className={s.table}>
              <caption>Per-category results</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Precision</th>
                  <th scope="col">Recall</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Missed</th>
                  <th scope="col">Wrongly added</th>
                </tr>
              </thead>
              <tbody>
                {board.categories.map((r) => (
                  <tr key={r.category}>
                    <th scope="row">{r.category}</th>
                    <td>{pct(r.precision)}</td>
                    <td>
                      <span className={s.recall}>
                        <span className={s.track} aria-hidden="true">
                          <span
                            className={s.fill}
                            style={{ width: `${Math.round(r.recall * 100)}%` }}
                          />
                        </span>
                        {pct(r.recall)}
                      </span>
                    </td>
                    <td>{r.support}</td>
                    <td>{r.missed}</td>
                    <td>{r.extra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className={s.note} aria-label="Reading these results">
            <h3>Reading these results honestly</h3>
            <p>
              This is a <strong>cold start</strong>: no merchant rules and no
              history, so every row went to the model (
              {pct(c.resolvedWithoutModel)} resolved without it). In real use,
              rules and your own corrections resolve the merchants you see
              most, and the model only handles the remainder.
            </p>
            {mostMissed.length > 0 && (
              <p>
                Most misses are in {list(mostMissed, "missed")}. The model
                over-assigns {list(mostExtra, "extra")}: ambiguous merchants
                tend to land there. The &ldquo;missed&rdquo; and &ldquo;wrongly
                added&rdquo; counts are derived from precision, recall and row
                counts; the exact pair-by-pair confusions are printed by the
                harness but not stored in the results file.
              </p>
            )}
            <p>
              One model, one run, {board.datasetRows} rows: a baseline to
              measure against, not a benchmark.
              {run.narrative
                ? ` Narrative faithfulness: ${pct(run.narrative.faithfulRate)} of ${run.narrative.samples} summaries.`
                : " Narrative faithfulness is not yet scored in this run."}
            </p>
          </aside>
        </section>

        <section className={`af-width ${s.closing}`}>
          <div>
            <h2>
              See it on
              <br />
              <em>12 months of sample data.</em>
            </h2>
          </div>
          <div className="button-row">
            <Link className="btn primary" href="/demo">
              Try the demo, no sign-up <ArrowRight size={17} />
            </Link>
            <a
              className="btn subtle"
              href="https://github.com/pvparekh/aetherflow"
              target="_blank"
              rel="noreferrer"
            >
              Read the source <ArrowUpRight size={17} />
            </a>
          </div>
        </section>
      </main>
    </Layout>
  );
}

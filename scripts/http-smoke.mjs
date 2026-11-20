import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
const port = 3197;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-test-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
child.stdout.on("data", (b) => (log += b));
child.stderr.on("data", (b) => (log += b));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error("Production server did not become ready: " + log);
  const checks = [
    ["/", "GET", 200],
    ["/login", "GET", 200],
    ["/signup", "GET", 200],
    ["/demo", "GET", 200],
    ["/data-guide", "GET", 200],
    ["/expense-intel", "GET", 200],
    ["/api/imports", "GET", 401],
    ["/api/imports/preview", "POST", 401],
    ["/api/imports/00000000-0000-4000-8000-000000000001/commit", "POST", 401],
    ["/api/expense-intel/uploads", "GET", 401],
    ["/api/expense-intel/correct", "PATCH", 401],
    ["/api/expense-intel/rebuild", "POST", 401],
    ["/api/expense-intel/pass2", "POST", 401],
    ["/api/account/export", "GET", 401],
  ];
  const results = [];
  for (const [path, method, expected] of checks) {
    const start = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== expected)
      throw new Error(
        `${method} ${path}: expected ${expected}, got ${response.status}`,
      );
    if (expected === 401) {
      const body = await response.json();
      if (body.error !== "Authentication required")
        throw new Error("Missing unauthorized contract");
    }
    results.push({
      path,
      method,
      status: response.status,
      localResponseMs: Math.round(performance.now() - start),
    });
  }
  console.log(
    JSON.stringify(
      {
        buildId: await (
          await import("node:fs/promises")
        ).readFile(".next/BUILD_ID", "utf8"),
        environment: "synthetic auth configuration; no real credentials",
        checks: results,
      },
      null,
      2,
    ),
  );
} finally {
  child.kill("SIGTERM");
}

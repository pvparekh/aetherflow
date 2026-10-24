// Integration-test adapter executes real Postgres SQL; no network or Supabase credentials.
import type { PGlite } from "@electric-sql/pglite";
type Row = Record<string, unknown>;
function identifier(s: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("Unsafe test identifier");
  return '"' + s + '"';
}
class Query {
  private action = "select";
  private columns = "*";
  private records: Row[] = [];
  private filters: { column: string; op: string; value: unknown }[] = [];
  private ordering: { column: string; ascending: boolean }[] = [];
  private take: number | undefined;
  private one = false;
  private optional = false;
  private ignore = false;
  private conflict = "";
  constructor(
    private db: PGlite,
    private table: string,
  ) {}
  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.action = "insert";
    this.records = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(
    rows: Row | Row[],
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) {
    this.insert(rows);
    this.ignore = options.ignoreDuplicates;
    this.conflict = options.onConflict;
    return this;
  }
  update(row: Row) {
    this.action = "update";
    this.records = [row];
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "=", value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "<>", value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: "in", value });
    return this;
  }
  is(column: string, value: null) {
    this.filters.push({ column, op: "is", value });
    return this;
  }
  not(column: string, _op: string, value: null) {
    this.filters.push({ column, op: "is not", value });
    return this;
  }
  order(column: string, { ascending = true } = {}) {
    this.ordering.push({ column, ascending });
    return this;
  }
  limit(n: number) {
    this.take = n;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    this.optional = true;
    return this;
  }
  async execute() {
    try {
      const args: unknown[] = [];
      const param = (value: unknown) => {
        args.push(
          value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : value,
        );
        return "$" + args.length;
      };
      const where = this.filters.length
        ? " where " +
          this.filters
            .map((f) => {
              const c = identifier(f.column);
              if (f.op === "is" || f.op === "is not")
                return `${c} ${f.op} null`;
              if (f.op === "in")
                return `${c} in (${(f.value as unknown[]).map(param).join(",")})`;
              return `${c}${f.op}${param(f.value)}`;
            })
            .join(" and ")
        : "";
      let sql = "";
      const table = identifier(this.table);
      if (this.action === "select")
        sql = `select ${
          this.columns === "*"
            ? "*"
            : this.columns
                .split(",")
                .map((c) => identifier(c.trim()))
                .join(",")
        } from ${table}${where}${this.ordering.length ? " order by " + this.ordering.map((o) => identifier(o.column) + (o.ascending ? " asc" : " desc")).join(",") : ""}${this.take ? " limit " + this.take : ""}`;
      if (this.action === "delete")
        sql = `delete from ${table}${where} returning *`;
      if (this.action === "update")
        sql = `update ${table} set ${Object.entries(this.records[0])
          .map(([k, v]) => identifier(k) + "=" + param(v))
          .join(",")}${where} returning *`;
      if (this.action === "insert") {
        const keys = Object.keys(this.records[0]);
        sql = `insert into ${table} (${keys.map(identifier).join(",")}) values ${this.records.map((r) => "(" + keys.map((k) => param(r[k])).join(",") + ")").join(",")}${this.conflict && this.ignore ? " on conflict (" + this.conflict.split(",").map(identifier).join(",") + ") do nothing" : ""} returning *`;
      }
      const result = await this.db.query<Row>(sql, args);
      if (this.one && !result.rows.length && !this.optional)
        return { data: null, error: { message: "Not found" } };
      return {
        data: this.one ? (result.rows[0] ?? null) : result.rows,
        error: null,
      };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }
  then<TResult1 = Awaited<ReturnType<Query["execute"]>>, TResult2 = never>(
    fulfilled?:
      | ((
          v: Awaited<ReturnType<Query["execute"]>>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    rejected?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(fulfilled, rejected);
  }
}
export function testClient(db: PGlite) {
  return {
    from: (table: string) => new Query(db, table),
    rpc: async (name: string, args: Row) => {
      try {
        const values = Object.values(args).map((v) =>
          v !== null && typeof v === "object" ? JSON.stringify(v) : v,
        );
        const sql = `select ${identifier(name)}(${Object.keys(args)
          .map((k, i) => `${identifier(k)}=>$${i + 1}`)
          .join(",")}) result`;
        const response = await db.query<{ result: unknown }>(sql, values);
        return { data: response.rows[0].result, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text))
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csvExport(
  records: Record<string, unknown>[],
  columns: string[],
): string {
  return (
    "\uFEFF" +
    [
      columns.map(csvCell).join(","),
      ...records.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
    ].join("\r\n")
  );
}

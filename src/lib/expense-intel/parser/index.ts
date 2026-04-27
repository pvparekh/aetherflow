import Papa from 'papaparse';
import { getOpenAI } from '@/lib/openai';
import type { ParsedRow, ParseError, ParseResult, ParseFormat } from '../types';

function detectFormat(headers: string[]): ParseFormat {
  const h = headers.map((s) => s.toLowerCase().trim());
  if (h.some((col) => col === 'debit' || col === 'credit' || col === 'withdrawal')) return 'bank';
  if (h.includes('date') && h.some((col) => col === 'amount' || col === 'total')) return 'standard';
  if (h.some((col) => col === 'amount' || col === 'total' || col === 'price')) return 'simple';
  return 'txt';
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const h = headers.map((s) => s.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = h.findIndex((col) => col === candidate.toLowerCase());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.abs(n);
}

function parseDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function parseCsv(
  data: Record<string, string>[],
  headers: string[],
  format: Exclude<ParseFormat, 'txt'>
): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  const vendorCol = findColumn(headers, ['vendor', 'description', 'merchant', 'payee', 'memo', 'name']);
  const dateCol = findColumn(headers, ['date', 'transaction date', 'posted date', 'trans date']);

  // For bank exports (split debit/credit columns) we only read the debit column.
  // For standard/simple formats we read the single amount column (always stored positive).
  const debitCol = format === 'bank'
    ? findColumn(headers, ['debit', 'withdrawal', 'amount debit', 'debit amount'])
    : null;
  const amountCol = format !== 'bank'
    ? findColumn(headers, ['amount', 'total', 'price', 'cost', 'value'])
    : null;

  data.forEach((row, i) => {
    const lineNum = i + 2;
    const rawText = Object.values(row).join(' | ');

    try {
      const vendor = vendorCol ? (row[vendorCol] ?? '').trim() : '';
      if (!vendor) {
        errors.push({ line: lineNum, raw: rawText, reason: 'Missing vendor/description' });
        return;
      }

      let amount: number | null = null;

      if (format === 'bank') {
        // Bank export: only process rows with a debit value; ignore credit-only rows
        amount = debitCol ? parseAmount(row[debitCol]) : null;
        if (!amount) return; // skip credit-only rows silently
      } else if (amountCol) {
        amount = parseAmount(row[amountCol]);
      }

      if (amount === null) {
        errors.push({ line: lineNum, raw: rawText, reason: 'Could not parse amount' });
        return;
      }

      const transaction_date = dateCol ? parseDate(row[dateCol]) : null;
      rows.push({ raw_text: rawText, vendor, amount, transaction_date });
    } catch (err) {
      errors.push({ line: lineNum, raw: rawText, reason: String(err) });
    }
  });

  return { rows, errors, format };
}

function parseTxt(content: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  const EXPENSE_RE = /^(.+?)\s+\$?([\d,]+(?:\.\d{1,2})?)\s*$/;

  content.split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const match = trimmed.match(EXPENSE_RE);
    if (!match) {
      errors.push({ line: i + 1, raw: trimmed, reason: 'Could not match "description amount" pattern' });
      return;
    }

    const vendor = match[1].trim();
    const amount = parseAmount(match[2]);
    if (amount === null) {
      errors.push({ line: i + 1, raw: trimmed, reason: 'Invalid amount value' });
      return;
    }

    rows.push({ raw_text: trimmed, vendor, amount, transaction_date: null });
  });

  return { rows, errors, format: 'txt' };
}

interface RawTransaction {
  description: string;
  amount: number;
  date: string | null;
}

const PDF_INSTRUCTIONS = `You are an expense file parser. Extract every expense transaction from this document.

Return ONLY valid JSON — no markdown, no code fences:
{
  "transactions": [
    { "description": "vendor or merchant name", "amount": 0.00, "date": "YYYY-MM-DD or null" }
  ]
}

Rules:
- amount: always a positive number representing the expense cost
- description: merchant or payee name only — clean and normalized, no dollar amounts embedded in it
- date: YYYY-MM-DD format or null if not found
- Skip: headers, footers, subtotals, grand totals, and any row without a clear vendor and amount
- Include every individual expense line; one object per transaction`;

export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfModule = require('pdf-parse') as ((buf: Buffer) => Promise<{ text: string }>) | { default: (buf: Buffer) => Promise<{ text: string }> };
  const pdfParse = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
  const { text } = await pdfParse(buffer);

  if (!text?.trim()) {
    return { rows: [], errors: [{ line: 0, raw: '', reason: 'PDF contained no extractable text' }], format: 'pdf' };
  }

  const truncated = text.slice(0, 12000);

  const response = await getOpenAI().responses.create({
    model: 'gpt-4o-mini',
    instructions: PDF_INSTRUCTIONS,
    input: truncated,
  });

  let transactions: RawTransaction[] = [];
  try {
    const raw = response.output_text ?? '';
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { transactions: RawTransaction[] };
    transactions = json.transactions ?? [];
  } catch {
    return { rows: [], errors: [{ line: 0, raw: '', reason: 'AI could not parse transactions from PDF' }], format: 'pdf' };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  transactions.forEach((t, i) => {
    if (!t.description?.trim()) {
      errors.push({ line: i + 1, raw: JSON.stringify(t), reason: 'Missing description' });
      return;
    }
    if (typeof t.amount !== 'number' || isNaN(t.amount) || t.amount <= 0) {
      errors.push({ line: i + 1, raw: JSON.stringify(t), reason: 'Invalid amount' });
      return;
    }
    rows.push({
      raw_text: `${t.description} | ${t.amount}${t.date ? ` | ${t.date}` : ''}`,
      vendor: t.description.trim(),
      amount: t.amount,
      transaction_date: t.date ?? null,
    });
  });

  return { rows, errors, format: 'pdf' };
}

export function parseExpenseFile(content: string, filename: string): ParseResult {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'txt') return parseTxt(content);

  const parsed = Papa.parse<Record<string, string>>(content.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.data.length || !parsed.meta.fields?.length) {
    return parseTxt(content);
  }

  const headers = parsed.meta.fields;
  const format = detectFormat(headers);

  if (format === 'txt') return parseTxt(content);

  return parseCsv(parsed.data, headers, format);
}

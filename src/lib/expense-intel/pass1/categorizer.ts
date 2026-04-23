import openai from '@/lib/openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORIES, type Category, type ParsedRow, type Pass1Item } from '../types';

const BATCH_SIZE = 25;
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are a business expense categorizer. Given a list of expense line items, classify each one into exactly one canonical category.

Canonical categories (use the exact string, including slash and capitalization):
Food/Dining, Travel/Transport, Accommodation, Software/SaaS, Office/Supplies, Marketing/Ads, Entertainment, Utilities, Misc

Respond with ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "items": [
    {
      "vendor": "normalized vendor name",
      "amount": 0.00,
      "date": "YYYY-MM-DD or null",
      "category": "exact canonical category string",
      "subcategory": "specific 1-3 word label e.g. Ride-sharing, Cloud Storage, Client Lunch",
      "confidence": 0.95
    }
  ]
}

Rules:
- Return exactly as many items as you received, in the same order
- category must be one of the 9 canonical values exactly as written
- confidence is a float 0.0–1.0
- vendor: normalize (trim whitespace, expand obvious abbreviations, use proper nouns)
- date: normalize to YYYY-MM-DD, or null if absent
- amount: return the numeric value unchanged`;

function sanitizeCategory(raw: string): Category {
  const match = CATEGORIES.find((c) => c.toLowerCase() === raw?.toLowerCase().trim());
  return match ?? 'Misc';
}

async function categorizeBatch(batch: ParsedRow[], attempt = 1): Promise<Pass1Item[]> {
  const userPrompt = `Categorize these ${batch.length} expense items:\n\n${JSON.stringify(
    batch.map((item, i) => ({
      index: i + 1,
      vendor: item.vendor,
      amount: item.amount,
      date: item.transaction_date,
    }))
  )}`;

  const input = `System:\n${SYSTEM_PROMPT}\n\nUser:\n${userPrompt}`;

  let outputText: string;

  try {
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input,
      text: { format: { type: 'json_object' } },
    });
    outputText = response.output_text;
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    return categorizeBatch(batch, attempt + 1);
  }

  let parsed: { items: Pass1Item[] };
  try {
    parsed = JSON.parse(outputText);
    if (!Array.isArray(parsed.items) || parsed.items.length !== batch.length) {
      throw new Error(`Expected ${batch.length} items, got ${parsed.items?.length ?? 0}`);
    }
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      console.error(`[pass1] Batch parse failed after ${MAX_RETRIES} attempts:`, err);
      return batch.map((row) => ({
        vendor: row.vendor,
        amount: row.amount,
        date: row.transaction_date,
        category: 'Misc' as Category,
        subcategory: 'Uncategorized',
        confidence: 0,
      }));
    }
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    return categorizeBatch(batch, attempt + 1);
  }

  return parsed.items.map((item) => ({
    ...item,
    category: sanitizeCategory(item.category),
    confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
  }));
}

export async function runPass1(
  uploadId: string,
  rows: ParsedRow[],
  supabase: SupabaseClient
): Promise<{ batchesProcessed: number; itemsWritten: number }> {

  const batches: ParsedRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  let itemsWritten = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`[pass1] Batch ${b + 1}/${batches.length} — ${batch.length} items`);

    const categorized = await categorizeBatch(batch);

    const lineItemRows = batch.map((raw, i) => ({
      upload_id: uploadId,
      raw_text: raw.raw_text,
      vendor: categorized[i].vendor,
      amount: categorized[i].amount,
      transaction_date: categorized[i].date ?? raw.transaction_date,
      category: categorized[i].category,
      subcategory: categorized[i].subcategory,
      confidence: categorized[i].confidence,
      is_anomaly: false,
      anomaly_severity: 'none',
      is_first_time_vendor: false,
      is_round_number: false,
      is_possible_duplicate: false,
    }));

    const { error } = await supabase.from('line_items').insert(lineItemRows);
    if (error) throw new Error(`[pass1] Supabase insert failed: ${error.message}`);

    itemsWritten += batch.length;
    console.log(`[pass1] Batch ${b + 1} written. Total so far: ${itemsWritten}`);
  }

  return { batchesProcessed: batches.length, itemsWritten };
}

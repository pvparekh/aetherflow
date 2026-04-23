import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../utils/supabase/service';
import { parseExpenseFile } from '@/lib/expense-intel/parser';
import { runPass1 } from '@/lib/expense-intel/pass1/categorizer';
import { computeAndWriteStats } from '@/lib/expense-intel/stats';
import type { UploadResponse } from '@/lib/expense-intel/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createServiceClient();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file field in request' }, { status: 400 });
  }

  const filename = file.name;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!['csv', 'txt'].includes(ext ?? '')) {
    return NextResponse.json({ error: 'Only .csv and .txt files are supported' }, { status: 400 });
  }

  const content = await file.text();

  const { rows, errors: parseErrors, format } = parseExpenseFile(content, filename);
  console.log(`[upload] Parsed "${filename}" as format="${format}": ${rows.length} rows, ${parseErrors.length} errors`);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No valid expense rows found in file', parse_errors: parseErrors },
      { status: 422 }
    );
  }

  // Create the upload record (pass1 begins)
  const { data: uploadRow, error: insertError } = await supabase
    .from('uploads')
    .insert({
      filename,
      line_item_count: rows.length,
      pass1_status: 'processing',
      pass2_status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !uploadRow) {
    return NextResponse.json(
      { error: `Failed to create upload record: ${insertError?.message}` },
      { status: 500 }
    );
  }

  const uploadId: string = uploadRow.id;
  console.log(`[upload] Created upload ${uploadId}`);

  // Run Pass 1 — batched categorization
  let batchesProcessed = 0;
  try {
    const result = await runPass1(uploadId, rows, supabase);
    batchesProcessed = result.batchesProcessed;
  } catch (err) {
    console.error(`[upload] Pass 1 failed for ${uploadId}:`, err);
    await supabase.from('uploads').update({ pass1_status: 'error' }).eq('id', uploadId);
    return NextResponse.json(
      { error: `Pass 1 categorization failed: ${String(err)}` },
      { status: 500 }
    );
  }

  // Finalize upload record
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const roundedTotal = Math.round(totalAmount * 100) / 100;

  await supabase
    .from('uploads')
    .update({ pass1_status: 'complete', total_amount: roundedTotal })
    .eq('id', uploadId);

  // Run statistical layer — compute aggregates, z-scores, rolling avgs, trends
  try {
    await computeAndWriteStats(uploadId, supabase);
  } catch (err) {
    // Stats failure is non-fatal: upload + line items are already written
    console.error(`[upload] Stats computation failed for ${uploadId}:`, err);
  }

  console.log(`[upload] Complete — upload_id=${uploadId}, rows=${rows.length}, batches=${batchesProcessed}, total=$${roundedTotal}`);

  const body: UploadResponse = {
    upload_id: uploadId,
    filename,
    line_item_count: rows.length,
    total_amount: roundedTotal,
    batches_processed: batchesProcessed,
    parse_errors: parseErrors,
    pass1_status: 'complete',
  };

  return NextResponse.json(body);
}

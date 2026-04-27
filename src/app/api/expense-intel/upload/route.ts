import { NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { createServiceClient } from '../../../../../utils/supabase/service';
import { parseExpenseFile, parsePDF } from '@/lib/expense-intel/parser';
import { runPass1 } from '@/lib/expense-intel/pass1/categorizer';
import { computeAndWriteStats } from '@/lib/expense-intel/stats';
import { runVendorIntelligence } from '@/lib/expense-intel/vendors';
import { runPass2 } from '@/lib/expense-intel/ai/pass2';
import type { UploadResponse } from '@/lib/expense-intel/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = user.id;

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
  if (!['csv', 'txt', 'pdf'].includes(ext ?? '')) {
    return NextResponse.json({ error: 'Only .csv, .txt, and .pdf files are supported' }, { status: 400 });
  }

  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 10 MB limit' }, { status: 413 });
  }

  let parseResult: Awaited<ReturnType<typeof parseExpenseFile>>;
  try {
    if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      parseResult = await parsePDF(Buffer.from(arrayBuffer));
    } else {
      const content = await file.text();
      parseResult = parseExpenseFile(content, filename);
    }
  } catch (parseErr) {
    console.error('[upload] Parse failed:', parseErr);
    return NextResponse.json(
      { error: `Failed to parse file: ${String(parseErr)}` },
      { status: 422 }
    );
  }

  const { rows, errors: parseErrors, format } = parseResult;
  console.log(`[upload] user=${userId} file="${filename}" format="${format}" rows=${rows.length} parseErrors=${parseErrors.length}`);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No valid expense rows found in file', parse_errors: parseErrors },
      { status: 422 }
    );
  }

  const { data: uploadRow, error: insertError } = await supabase
    .from('uploads')
    .insert({
      user_id: userId,
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

  const totalAmount = Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;

  await supabase
    .from('uploads')
    .update({ pass1_status: 'complete', total_amount: totalAmount })
    .eq('id', uploadId);

  let statsResult;
  try {
    statsResult = await computeAndWriteStats(uploadId, userId, supabase);
  } catch (err) {
    console.error(`[upload] Stats failed for ${uploadId}:`, err);
  }

  try {
    await runVendorIntelligence(uploadId, userId, supabase, statsResult ?? {
      categoriesProcessed: [],
      skewedCategories: [],
      categoryDrift: [],
    });
  } catch (err) {
    console.error(`[upload] Vendor intelligence failed for ${uploadId}:`, err);
  }

  console.log(`[upload] Complete — upload_id=${uploadId} rows=${rows.length} batches=${batchesProcessed} total=$${totalAmount}`);

  void runPass2(uploadId, userId, supabase).catch((err) => {
    console.error(`[upload] Background Pass 2 failed for ${uploadId}:`, err);
    void supabase
      .from('uploads')
      .update({ pass2_status: 'error' })
      .eq('id', uploadId);
  });

  const body: UploadResponse = {
    upload_id: uploadId,
    filename,
    line_item_count: rows.length,
    total_amount: totalAmount,
    batches_processed: batchesProcessed,
    parse_errors: parseErrors,
    pass1_status: 'complete',
  };

  return NextResponse.json(body);
}

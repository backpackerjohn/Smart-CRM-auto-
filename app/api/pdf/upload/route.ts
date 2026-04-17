import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readPdfFieldNames } from "@/lib/pdf/fill";
import { proposePdfMapping } from "@/lib/gemini/pdf-map";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const name = (form.get("name") as string | null) ?? file?.name ?? "Untitled form";
  const formSet = (form.get("formSet") as string | null) ?? null;

  if (!file) return new NextResponse("file required", { status: 400 });
  const buf = new Uint8Array(await file.arrayBuffer());

  // Read fields from the PDF.
  let fields: Array<{ name: string; type: string }>;
  try {
    fields = await readPdfFieldNames(buf);
  } catch (err) {
    return new NextResponse(
      `Could not read PDF fields. Make sure the PDF has fillable form fields. ${err instanceof Error ? err.message : ""}`,
      { status: 400 },
    );
  }

  // Upload to Storage.
  const formId = crypto.randomUUID();
  const storagePath = `${user.id}/${formId}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("pdf-templates")
    .upload(storagePath, buf, { contentType: "application/pdf", upsert: false });
  if (upErr) return new NextResponse(upErr.message, { status: 500 });

  // Insert form row.
  const { error: fErr } = await supabase.from("pdf_forms").insert({
    id: formId,
    name,
    storage_path: storagePath,
    form_set: formSet,
    bytes: buf.byteLength,
    field_count: fields.length,
  });
  if (fErr) return new NextResponse(fErr.message, { status: 500 });

  // Ask Gemini for proposed mappings.
  let proposals: Awaited<ReturnType<typeof proposePdfMapping>> = [];
  try {
    proposals = await proposePdfMapping({ formName: name, fieldNames: fields });
  } catch (err) {
    // Mapping proposal is best-effort; user can still map manually.
    console.error("pdf mapping proposal failed", err);
  }

  const byName = new Map(proposals.map((p) => [p.pdfFieldName, p]));

  // Insert one mapping row per field (AI-proposed where we got a suggestion).
  const rows = fields.map((f) => {
    const p = byName.get(f.name);
    return {
      pdf_form_id: formId,
      pdf_field_name: f.name,
      pdf_field_type: f.type,
      target_path: p?.targetPath ?? null,
      transform: p?.transform && p.transform !== "none" ? p.transform : null,
      status: "ai_proposed" as const,
      ai_confidence: p?.confidence ?? null,
      ai_rationale: p?.rationale ?? null,
    };
  });
  if (rows.length) {
    const { error: mErr } = await supabase.from("pdf_field_mappings").insert(rows);
    if (mErr) return new NextResponse(mErr.message, { status: 500 });
  }

  return NextResponse.json({ id: formId, fieldCount: fields.length });
}

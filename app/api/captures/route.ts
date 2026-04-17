import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CaptureKind, CaptureOwner } from "@/types/db";
import { extractCapture } from "@/lib/gemini/extract";
import { applyExtraction } from "@/lib/extraction/apply";
import { recomputeChecklist } from "@/lib/checklist/persist";

// Upload path: POST multipart with `file`, `kind`, optional `dealId`, optional `createNewDeal`, optional `assignedTo`.
// Flow: upload to Storage → insert capture → extract (Gemini) → apply to Customer/Deal/Vehicle → recompute checklist.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const kind = ((form.get("kind") as string | null) ?? "other") as CaptureKind;
  const assignedTo = ((form.get("assignedTo") as string | null) ?? "unassigned") as CaptureOwner;
  const device = (form.get("device") as string | null) ?? "unknown";
  let dealId = form.get("dealId") as string | null;
  const createNew = form.get("createNewDeal") === "1";

  if (!file) return new NextResponse("file required", { status: 400 });

  if (createNew) {
    const { data: d, error: dErr } = await supabase
      .from("deals")
      .insert({ title: null, stage: "active" })
      .select("id")
      .single();
    if (dErr || !d) return new NextResponse(dErr?.message ?? "could not create deal", { status: 500 });
    dealId = d.id;
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const captureId = crypto.randomUUID();
  const storagePath = `${user.id}/${dealId ?? "unassigned"}/${captureId}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("captures")
    .upload(storagePath, buf, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) return new NextResponse(upErr.message, { status: 500 });

  const { error: capErr } = await supabase.from("captures").insert({
    id: captureId,
    deal_id: dealId,
    storage_path: storagePath,
    mime_type: file.type || "image/jpeg",
    filename: file.name,
    kind,
    assigned_to: assignedTo,
    device,
    bytes: buf.byteLength,
  });
  if (capErr) return new NextResponse(capErr.message, { status: 500 });

  if (dealId) {
    await supabase.from("chat_messages").insert({
      deal_id: dealId,
      role: "system",
      content: `📎 ${kind.replace(/_/g, " ")} uploaded — extracting…`,
      capture_id: captureId,
      metadata: { phase: "extraction_start" },
    });
  }

  // Background: extract → apply → recompute checklist → post summary chat message.
  // Fire-and-forget; client subscribes to realtime on chat_messages + checklist_items.
  queueMicrotask(async () => {
    try {
      const base64 = Buffer.from(buf).toString("base64");
      const { structured, latencyMs, model } = await extractCapture({
        imageBase64: base64,
        mimeType: file.type || "image/jpeg",
        kind,
        context: kind === "dl_front" || kind === "dl_back" ? "Ohio DL expected 99% of the time." : undefined,
      });

      const { data: extractionRow } = await supabase
        .from("extractions")
        .insert({
          capture_id: captureId,
          doc_type: kind,
          structured_data: structured as Record<string, unknown>,
          confidence: {},
          model,
          latency_ms: latencyMs,
        })
        .select("id")
        .single();

      let applySummary = "Extraction stored.";
      let warnings: string[] = [];
      if (dealId) {
        const result = await applyExtraction({
          supabase,
          dealId,
          captureId,
          captureKind: kind,
          assignedTo,
          structured,
        });
        applySummary = result.summary;
        warnings = result.warnings;

        await recomputeChecklist(supabase, dealId);

        await supabase.from("chat_messages").insert({
          deal_id: dealId,
          role: "assistant",
          content: warnings.length > 0
            ? `${applySummary}\n\n⚠️ ${warnings.join(" ")}`
            : applySummary,
          capture_id: captureId,
          metadata: {
            phase: "extraction_applied",
            extraction_id: extractionRow?.id,
            fields_applied: result.fieldsApplied,
            warnings,
            latency_ms: latencyMs,
          },
        });
      }
    } catch (err) {
      if (dealId) {
        await supabase.from("chat_messages").insert({
          deal_id: dealId,
          role: "system",
          content: `Extraction failed: ${err instanceof Error ? err.message : "unknown error"}`,
          capture_id: captureId,
          metadata: { phase: "extraction_failed" },
        });
      }
    }
  });

  return NextResponse.json({ captureId, dealId });
}

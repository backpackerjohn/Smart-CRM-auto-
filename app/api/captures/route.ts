import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CaptureKind } from "@/types/db";
import { extractCapture } from "@/lib/gemini/extract";

// Upload path: POST multipart with `file`, `kind`, optional `dealId`, optional `createNewDeal`.
// Side effects: uploads to Storage → creates capture row → runs Gemini extraction → inserts chat message.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const kind = (form.get("kind") as string | null) ?? "other";
  const device = (form.get("device") as string | null) ?? "unknown";
  let dealId = form.get("dealId") as string | null;
  const createNew = form.get("createNewDeal") === "1";

  if (!file) return new NextResponse("file required", { status: 400 });

  // Route to deal
  if (createNew) {
    const { data: d, error: dErr } = await supabase
      .from("deals")
      .insert({ title: null, stage: "active" })
      .select("id")
      .single();
    if (dErr || !d) return new NextResponse(dErr?.message ?? "could not create deal", { status: 500 });
    dealId = d.id;
  }

  // Upload bytes to Storage
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
    kind: kind as CaptureKind,
    device,
    bytes: buf.byteLength,
  });
  if (capErr) return new NextResponse(capErr.message, { status: 500 });

  // Ghost message in chat so user sees "extracting…"
  if (dealId) {
    await supabase.from("chat_messages").insert({
      deal_id: dealId,
      role: "system",
      content: `📎 ${kind.replace(/_/g, " ")} uploaded — extracting…`,
      capture_id: captureId,
      metadata: { phase: "extraction_start" },
    });
  }

  // Run extraction in background (best-effort; fire-and-forget is fine here — client subscribes to realtime).
  queueMicrotask(async () => {
    try {
      const base64 = Buffer.from(buf).toString("base64");
      const { structured, latencyMs, model } = await extractCapture({
        imageBase64: base64,
        mimeType: file.type || "image/jpeg",
        kind: kind as CaptureKind,
        context: kind === "dl_front" || kind === "dl_back" ? "Ohio DL expected 99% of the time." : undefined,
      });
      await supabase.from("extractions").insert({
        capture_id: captureId,
        doc_type: kind as CaptureKind,
        structured_data: structured as Record<string, unknown>,
        confidence: {},
        model,
        latency_ms: latencyMs,
      });
      if (dealId) {
        await supabase.from("chat_messages").insert({
          deal_id: dealId,
          role: "assistant",
          content: `Extracted ${kind.replace(/_/g, " ")}. Review in the profile panel.`,
          capture_id: captureId,
          metadata: { phase: "extraction_complete", fields: structured },
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

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeChecklist } from "@/lib/checklist/persist";
import type { DealStage } from "@/types/db";

const VALID: DealStage[] = ["active", "pending_finance", "delivered", "archived"];

const STAGE_LABEL: Record<DealStage, string> = {
  active: "Active",
  pending_finance: "Pending Finance",
  delivered: "Delivered",
  archived: "Archived",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const body = await request.json();
  const stage: DealStage = body?.stage;
  if (!VALID.includes(stage)) return new NextResponse("invalid stage", { status: 400 });

  const { data: before } = await supabase.from("deals").select("stage").eq("id", id).maybeSingle();
  if (!before) return new NextResponse("deal not found", { status: 404 });

  const previous = before.stage as DealStage;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    stage,
    stage_changed_at: now,
  };
  if (stage === "delivered") patch.delivered_at = now;
  if (stage === "archived") patch.archived_at = now;
  if (stage === "active" && previous === "archived") {
    // Restore from archive — clear archived_at so auto-archive doesn't immediately flip it back.
    patch.archived_at = null;
  }

  const { error } = await supabase.from("deals").update(patch).eq("id", id);
  if (error) return new NextResponse(error.message, { status: 500 });

  // Audit + user-visible chat trail.
  await supabase.from("chat_messages").insert({
    deal_id: id,
    role: "system",
    content: `Stage changed: ${STAGE_LABEL[previous]} → ${STAGE_LABEL[stage]}.`,
    metadata: { phase: "stage_changed", previous, next: stage },
  });

  // Stage affects what checklist rows are relevant (e.g. insurance-expiring warn hides once delivered).
  await recomputeChecklist(supabase, id);

  return NextResponse.json({ ok: true });
}

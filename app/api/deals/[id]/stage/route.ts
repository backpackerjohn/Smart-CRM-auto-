import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { DealStage } from "@/types/db";

const VALID: DealStage[] = ["active", "pending_finance", "delivered", "archived"];

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

  const patch: Record<string, unknown> = {
    stage,
    stage_changed_at: new Date().toISOString(),
  };
  if (stage === "delivered") patch.delivered_at = new Date().toISOString();
  if (stage === "archived") patch.archived_at = new Date().toISOString();

  const { error } = await supabase.from("deals").update(patch).eq("id", id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}

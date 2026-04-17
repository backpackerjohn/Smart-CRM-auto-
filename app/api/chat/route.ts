import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerInDealChat } from "@/lib/gemini/chat";
import type { ChatMessage } from "@/types/db";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { dealId, content } = await request.json();
  if (!dealId || !content) return new NextResponse("dealId + content required", { status: 400 });

  // Persist the user message synchronously so realtime picks it up immediately.
  const { error: insErr } = await supabase.from("chat_messages").insert({
    deal_id: dealId,
    role: "user",
    content,
    metadata: {},
  });
  if (insErr) return new NextResponse(insErr.message, { status: 500 });

  // Fetch deal context in parallel.
  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) return new NextResponse("deal not found", { status: 404 });

  const [primaryRes, coBuyerRes, recentRes, checklistRes] = await Promise.all([
    deal.primary_customer_id
      ? supabase.from("customers").select("*").eq("id", deal.primary_customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    deal.co_buyer_customer_id
      ? supabase.from("customers").select("*").eq("id", deal.co_buyer_customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("chat_messages")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("checklist_items").select("*").eq("deal_id", dealId).order("sort_order"),
  ]);

  const recent = (recentRes.data ?? []).reverse() as ChatMessage[];

  // Fire the LLM call and persist the response.
  try {
    const answer = await answerInDealChat({
      deal,
      primary: primaryRes.data ?? null,
      coBuyer: coBuyerRes.data ?? null,
      checklist: (checklistRes.data ?? []).map((r) => ({
        kind: r.kind as never,
        label: r.label,
        state: r.state,
        sortOrder: r.sort_order,
        message: r.message ?? undefined,
        sourceCaptureId: r.source_capture_id ?? undefined,
      })),
      recentMessages: recent,
      userMessage: content,
    });

    await supabase.from("chat_messages").insert({
      deal_id: dealId,
      role: "assistant",
      content: answer,
      metadata: {},
    });
  } catch (err) {
    await supabase.from("chat_messages").insert({
      deal_id: dealId,
      role: "system",
      content: `Chat error: ${err instanceof Error ? err.message : "unknown"}`,
      metadata: { phase: "chat_failed" },
    });
    return new NextResponse("chat failed", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

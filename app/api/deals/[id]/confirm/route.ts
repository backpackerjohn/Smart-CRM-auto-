import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Toggle confirmation for a high-stakes field.
// Body: { fieldPath: string, confirmed: boolean }
// fieldPath examples: "primary.dl_number", "primary.dob", "trade.vin",
// "vehicle.vin", "deal.trade_payoff_amount_cents", "primary.ssn_full"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { fieldPath, confirmed } = await request.json();
  if (typeof fieldPath !== "string" || !fieldPath) {
    return new NextResponse("fieldPath required", { status: 400 });
  }

  const { data: deal } = await supabase
    .from("deals")
    .select("confirmed_fields")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return new NextResponse("deal not found", { status: 404 });

  const existing = (deal.confirmed_fields ?? {}) as Record<string, boolean>;
  const next = { ...existing };
  if (confirmed === false) {
    delete next[fieldPath];
  } else {
    next[fieldPath] = true;
  }

  const { error } = await supabase
    .from("deals")
    .update({ confirmed_fields: next })
    .eq("id", id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ ok: true, confirmed_fields: next });
}

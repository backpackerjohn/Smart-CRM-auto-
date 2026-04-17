import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeChecklist } from "@/lib/checklist/persist";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { dealId } = await request.json();
  if (!dealId) return new NextResponse("dealId required", { status: 400 });

  const result = await recomputeChecklist(supabase, dealId);
  if ("error" in result) return new NextResponse(result.error, { status: 500 });

  return NextResponse.json(result);
}

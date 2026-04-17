import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeChecklist } from "@/lib/checklist/persist";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title: string | null = body?.title ?? null;

  const { data, error } = await supabase
    .from("deals")
    .insert({ title, stage: "active" })
    .select("id")
    .single();

  if (error) return new NextResponse(error.message, { status: 500 });

  // Seed checklist so the panel shows "missing" rows from the start.
  await recomputeChecklist(supabase, data.id);

  return NextResponse.json({ id: data.id });
}

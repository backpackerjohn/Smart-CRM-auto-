import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PdfFieldMapping } from "@/types/db";

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { formId, mappings } = await request.json() as { formId: string; mappings: PdfFieldMapping[] };
  if (!formId || !Array.isArray(mappings)) return new NextResponse("formId + mappings required", { status: 400 });

  // Update rows one-by-one via upsert keyed on id (RLS enforces ownership).
  for (const m of mappings) {
    const { error } = await supabase
      .from("pdf_field_mappings")
      .update({
        target_path: m.target_path,
        transform: m.transform,
        default_value: m.default_value,
        status: m.status,
      })
      .eq("id", m.id);
    if (error) return new NextResponse(error.message, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

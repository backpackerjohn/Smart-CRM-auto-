import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fillPdf } from "@/lib/pdf/fill";
import { flattenDeal } from "@/lib/deal/flatten";

// POST body: { dealId: string, formIds: string[] }
// Fills each PDF with the deal's data and stores the result in pdf-filled/ and filled_pdfs table.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { dealId, formIds } = await request.json() as { dealId: string; formIds: string[] };
  if (!dealId || !Array.isArray(formIds) || formIds.length === 0) {
    return new NextResponse("dealId + formIds required", { status: 400 });
  }

  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) return new NextResponse("deal not found", { status: 404 });

  const [{ data: primary }, { data: coBuyer }, { data: vehicle }, { data: trade }] = await Promise.all([
    deal.primary_customer_id
      ? supabase.from("customers").select("*").eq("id", deal.primary_customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    deal.co_buyer_customer_id
      ? supabase.from("customers").select("*").eq("id", deal.co_buyer_customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    deal.vehicle_of_interest_id
      ? supabase.from("vehicles").select("*").eq("id", deal.vehicle_of_interest_id).maybeSingle()
      : Promise.resolve({ data: null }),
    deal.trade_vehicle_id
      ? supabase.from("vehicles").select("*").eq("id", deal.trade_vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const flat = flattenDeal({
    deal,
    primary: primary ?? null,
    coBuyer: coBuyer ?? null,
    vehicle: vehicle ?? null,
    trade: trade ?? null,
  });

  const results: Array<{ formId: string; filledPdfId: string }> = [];

  for (const formId of formIds) {
    const [{ data: form }, { data: mappings }] = await Promise.all([
      supabase.from("pdf_forms").select("*").eq("id", formId).maybeSingle(),
      supabase.from("pdf_field_mappings").select("*").eq("pdf_form_id", formId),
    ]);
    if (!form) continue;

    const { data: templateBlob, error: dlErr } = await supabase.storage
      .from("pdf-templates")
      .download(form.storage_path);
    if (dlErr || !templateBlob) return new NextResponse(dlErr?.message ?? "template missing", { status: 500 });

    const templateBytes = new Uint8Array(await templateBlob.arrayBuffer());
    const fill = await fillPdf({
      templateBytes,
      mappings: mappings ?? [],
      data: flat as unknown as Record<string, unknown>,
    });

    const filledId = crypto.randomUUID();
    const storagePath = `${user.id}/${dealId}/${filledId}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("pdf-filled")
      .upload(storagePath, fill.bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) return new NextResponse(upErr.message, { status: 500 });

    await supabase.from("filled_pdfs").insert({
      id: filledId,
      deal_id: dealId,
      pdf_form_id: formId,
      storage_path: storagePath,
      bytes: fill.bytes.byteLength,
      fields_filled: fill.fieldsFilled,
      fields_blank: fill.fieldsBlank,
    });

    results.push({ formId, filledPdfId: filledId });
  }

  return NextResponse.json({ results });
}

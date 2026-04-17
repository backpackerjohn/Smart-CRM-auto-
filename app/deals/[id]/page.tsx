import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DealList } from "@/components/deal-list";
import { ChatThread } from "@/components/chat-thread";
import { ChecklistPanel } from "@/components/checklist-panel";
import { ProfilePanel } from "@/components/profile-panel";
import { StageControls } from "@/components/stage-controls";
import { FillFormsButton } from "@/components/fill-forms-button";
import { FilledPdfsPanel, type FilledPdfRow } from "@/components/filled-pdfs-panel";
import { CapturesGallery, type GalleryRow } from "@/components/captures-gallery";
import type { Capture, FilledPdf, PdfForm } from "@/types/db";

interface Props {
  params: Promise<{ id: string }>;
}

const SIGNED_URL_SECONDS = 60 * 60;

export default async function DealPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: deal } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!deal) notFound();

  const [
    { data: deals },
    { data: primary },
    { data: coBuyer },
    { data: vehicle },
    { data: trade },
    { data: messages },
    { data: checklist },
    { data: forms },
    { data: filled },
    { data: captures },
  ] = await Promise.all([
    supabase.from("deals").select("*").order("updated_at", { ascending: false }).limit(200),
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
    supabase.from("chat_messages").select("*").eq("deal_id", id).order("created_at", { ascending: true }).limit(200),
    supabase.from("checklist_items").select("*").eq("deal_id", id).order("sort_order", { ascending: true }),
    supabase.from("pdf_forms").select("*").order("name", { ascending: true }),
    supabase.from("filled_pdfs").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("captures").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
  ]);

  const filledRows = await withFormAndUrls(supabase, (filled ?? []) as FilledPdf[], forms ?? []);
  const galleryRows = await withGalleryUrls(supabase, (captures ?? []) as Capture[]);

  return (
    <div className="flex h-screen">
      <aside className="hidden w-72 shrink-0 border-r border-surface-2 bg-surface-1 md:flex md:flex-col">
        <DealList deals={deals ?? []} selectedId={id} />
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-surface-2 bg-surface-1 px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold">{deal.title ?? "(untitled deal)"}</h1>
            <p className="text-xs text-zinc-400">Updated {new Date(deal.updated_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <FillFormsButton dealId={id} forms={forms ?? []} />
            <StageControls deal={deal} />
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-4 overflow-y-auto">
            <ChecklistPanel items={checklist ?? []} />
            <ProfilePanel
              deal={deal}
              primary={primary ?? null}
              coBuyer={coBuyer ?? null}
              vehicle={vehicle ?? null}
              trade={trade ?? null}
            />
            <FilledPdfsPanel rows={filledRows} />
            <CapturesGallery rows={galleryRows} />
          </div>
          <div className="h-full min-h-0">
            <ChatThread dealId={id} initialMessages={messages ?? []} />
          </div>
        </div>
      </main>
    </div>
  );
}

async function withFormAndUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filled: FilledPdf[],
  forms: PdfForm[],
): Promise<FilledPdfRow[]> {
  const formsById = new Map(forms.map((f) => [f.id, f]));
  return Promise.all(
    filled.map(async (f) => {
      const { data: signed } = await supabase.storage
        .from("pdf-filled")
        .createSignedUrl(f.storage_path, SIGNED_URL_SECONDS);
      const form = formsById.get(f.pdf_form_id);
      return {
        ...f,
        signedUrl: signed?.signedUrl ?? null,
        form: form ? { id: form.id, name: form.name } : null,
      } satisfies FilledPdfRow;
    }),
  );
}

async function withGalleryUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  captures: Capture[],
): Promise<GalleryRow[]> {
  return Promise.all(
    captures.map(async (c) => {
      const { data: signed } = await supabase.storage
        .from("captures")
        .createSignedUrl(c.storage_path, SIGNED_URL_SECONDS);
      return { ...c, signedUrl: signed?.signedUrl ?? null } satisfies GalleryRow;
    }),
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DealList } from "@/components/deal-list";
import { ChatThread } from "@/components/chat-thread";
import { ChecklistPanel } from "@/components/checklist-panel";
import { ProfilePanel } from "@/components/profile-panel";
import { StageControls } from "@/components/stage-controls";

interface Props {
  params: Promise<{ id: string }>;
}

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
  ]);

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
          <StageControls deal={deal} />
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
          </div>
          <div className="h-full min-h-0">
            <ChatThread dealId={id} initialMessages={messages ?? []} />
          </div>
        </div>
      </main>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { DealList } from "@/components/deal-list";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: deals } = await supabase
    .from("deals")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex h-screen">
      <aside className="hidden w-72 shrink-0 border-r border-surface-2 bg-surface-1 md:flex md:flex-col">
        <DealList deals={deals ?? []} />
      </aside>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Smart CRM Auto</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Pick a deal on the left, or start a new one.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Link
              href="/deals/new"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              New deal
            </Link>
            <Link href="/capture" className="text-xs text-zinc-400 hover:text-zinc-200">
              Open capture (mobile) →
            </Link>
          </div>
        </div>
      </main>

      {/* Mobile-only deal list */}
      <aside className="flex w-full flex-col bg-surface-1 md:hidden">
        <DealList deals={deals ?? []} />
      </aside>
    </div>
  );
}

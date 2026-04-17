import Link from "next/link";
import type { Deal } from "@/types/db";
import { cn } from "@/lib/utils";

interface Props {
  deals: Deal[];
  selectedId?: string;
}

const STAGE_ORDER: Array<{ stage: Deal["stage"]; label: string }> = [
  { stage: "active", label: "Active" },
  { stage: "pending_finance", label: "Pending Finance" },
  { stage: "delivered", label: "Delivered" },
  { stage: "archived", label: "Archived" },
];

export function DealList({ deals, selectedId }: Props) {
  const byStage = new Map<Deal["stage"], Deal[]>();
  for (const s of STAGE_ORDER) byStage.set(s.stage, []);
  for (const d of deals) byStage.get(d.stage)?.push(d);

  return (
    <nav className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-2 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Deals</h2>
        <Link
          href="/deals/new"
          className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white"
        >
          + New
        </Link>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {STAGE_ORDER.map(({ stage, label }) => {
          const items = byStage.get(stage) ?? [];
          if (stage === "archived" && items.length === 0) return null;
          return (
            <section key={stage} className="px-2 py-2">
              <h3 className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                {label} · {items.length}
              </h3>
              {items.length === 0 ? (
                <p className="px-2 py-1 text-xs text-zinc-600">—</p>
              ) : (
                <ul className="flex flex-col">
                  {items.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/deals/${d.id}`}
                        className={cn(
                          "flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-2",
                          selectedId === d.id && "bg-surface-2 text-white",
                        )}
                      >
                        <span className="truncate">{d.title ?? "(untitled)"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="border-t border-surface-2 p-3 text-xs text-zinc-500">
        <Link href="/settings/pdf-forms" className="hover:text-zinc-300">
          PDF forms →
        </Link>
      </div>
    </nav>
  );
}

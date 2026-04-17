import type { ChecklistItem } from "@/types/db";
import { cn } from "@/lib/utils";

interface Props {
  items: ChecklistItem[];
}

const STATE_CLASS: Record<ChecklistItem["state"], string> = {
  complete: "badge-ok",
  warn: "badge-warn",
  missing: "badge-missing",
  manual: "badge-manual",
};

const STATE_ICON: Record<ChecklistItem["state"], string> = {
  complete: "✓",
  warn: "!",
  missing: "○",
  manual: "✎",
};

export function ChecklistPanel({ items }: Props) {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const missing = sorted.filter((i) => i.state === "missing").length;
  const warn = sorted.filter((i) => i.state === "warn").length;

  return (
    <section className="rounded-xl border border-surface-2 bg-surface-1">
      <header className="flex items-center justify-between border-b border-surface-2 px-4 py-2">
        <h3 className="text-sm font-semibold">Checklist</h3>
        <p className="text-xs text-zinc-400">
          {missing} missing{warn > 0 && ` · ${warn} warn`}
        </p>
      </header>

      <ul className="divide-y divide-surface-2">
        {sorted.length === 0 ? (
          <li className="px-4 py-2 text-xs text-zinc-500">No items yet — add a planned PDF to populate the checklist.</li>
        ) : (
          sorted.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                  STATE_CLASS[item.state],
                )}
              >
                {STATE_ICON[item.state]}
              </span>
              <div className="flex-1">
                <p className="text-sm">{item.label}</p>
                {item.message && <p className="text-xs text-zinc-500">{item.message}</p>}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PdfFieldMapping } from "@/types/db";
import { cn } from "@/lib/utils";

interface Props {
  formId: string;
  mappings: PdfFieldMapping[];
}

export function PdfMappingReview({ formId, mappings: initial }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "ai_proposed" | "user_confirmed" | "unmapped">("all");

  function update(id: string, patch: Partial<PdfFieldMapping>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveAll() {
    setSaving(true);
    const res = await fetch(`/api/pdf/mappings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formId, mappings: rows }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "unmapped") return !r.target_path;
    return r.status === filter;
  });

  const proposed = rows.filter((r) => r.status === "ai_proposed").length;
  const confirmed = rows.filter((r) => r.status === "user_confirmed").length;
  const overridden = rows.filter((r) => r.status === "user_overridden").length;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl border border-surface-2 bg-surface-1 px-4 py-2 text-sm">
        <div className="flex gap-4 text-xs">
          <span>{rows.length} total</span>
          <span className="text-zinc-400">{proposed} proposed</span>
          <span className="text-ok">{confirmed} confirmed</span>
          <span className="text-warn">{overridden} overridden</span>
        </div>
        <div className="flex gap-2">
          {(["all", "ai_proposed", "unmapped"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2 py-1 text-xs",
                filter === f ? "bg-accent text-white" : "bg-surface-2 text-zinc-400",
              )}
            >
              {f === "ai_proposed" ? "Proposed" : f === "unmapped" ? "Unmapped" : "All"}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-surface-2 rounded-xl border border-surface-2">
        {filtered.map((r) => (
          <li key={r.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
            <div>
              <p className="font-mono text-xs text-zinc-400">{r.pdf_field_name}</p>
              {r.ai_rationale && <p className="text-[11px] text-zinc-500">{r.ai_rationale}</p>}
            </div>
            <input
              value={r.target_path ?? ""}
              onChange={(e) => update(r.id, { target_path: e.target.value || null, status: "user_overridden" })}
              placeholder="primary.firstName"
              className="rounded-md border border-surface-2 bg-surface-2 px-2 py-1 font-mono text-xs outline-none focus:border-accent"
            />
            <input
              value={r.transform ?? ""}
              onChange={(e) => update(r.id, { transform: e.target.value || null, status: "user_overridden" })}
              placeholder="none"
              className="w-28 rounded-md border border-surface-2 bg-surface-2 px-2 py-1 font-mono text-xs outline-none focus:border-accent"
            />
            <button
              onClick={() => update(r.id, { status: "user_confirmed" })}
              className={cn(
                "rounded-md px-2 py-1 text-xs",
                r.status === "user_confirmed" ? "bg-ok/20 text-ok" : "bg-surface-2 text-zinc-300",
              )}
            >
              {r.status === "user_confirmed" ? "Confirmed" : "Confirm"}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <button
          onClick={saveAll}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save mappings"}
        </button>
      </div>
    </div>
  );
}

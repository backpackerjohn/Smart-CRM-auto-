"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PdfForm } from "@/types/db";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string;
  forms: PdfForm[];
}

export function FillFormsButton({ dealId, forms }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group by form_set, falling back to "Other".
  const groups = new Map<string, PdfForm[]>();
  for (const f of forms) {
    const key = f.form_set ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  async function fill(formIds: string[]) {
    if (formIds.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/pdf/fill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId, formIds }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (forms.length === 0) {
    return (
      <Link
        href="/settings/pdf-forms"
        className="rounded-md bg-surface-2 px-3 py-1 text-xs text-zinc-300"
      >
        Upload a PDF form →
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium",
          busy ? "bg-surface-2 text-zinc-500" : "bg-accent text-white",
        )}
      >
        {busy ? "Filling…" : "Fill forms"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-80 rounded-xl border border-surface-2 bg-surface-1 p-3 text-sm shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Fill which?
            </span>
            <button
              onClick={() => fill(forms.map((f) => f.id))}
              disabled={busy}
              className="rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-white"
            >
              Fill all ({forms.length})
            </button>
          </div>

          <ul className="divide-y divide-surface-2">
            {Array.from(groups.entries()).map(([group, gForms]) => (
              <li key={group} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                    {group}
                  </span>
                  {gForms.length > 1 && (
                    <button
                      onClick={() => fill(gForms.map((f) => f.id))}
                      disabled={busy}
                      className="text-[10px] text-accent hover:underline"
                    >
                      Fill set
                    </button>
                  )}
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {gForms.map((f) => (
                    <li key={f.id} className="flex items-center justify-between">
                      <span className="truncate text-xs">{f.name}</span>
                      <button
                        onClick={() => fill([f.id])}
                        disabled={busy}
                        className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        Fill
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-2 rounded-md bg-danger/10 px-2 py-1 text-xs text-danger">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

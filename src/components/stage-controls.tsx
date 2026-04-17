"use client";

import type { Deal, DealStage } from "@/types/db";
import { useRouter } from "next/navigation";
import { useState } from "react";

const NEXT_STAGE: Record<DealStage, DealStage | null> = {
  active: "pending_finance",
  pending_finance: "delivered",
  delivered: "archived",
  archived: null,
};

const STAGE_LABEL: Record<DealStage, string> = {
  active: "Active",
  pending_finance: "Pending Finance",
  delivered: "Delivered",
  archived: "Archived",
};

export function StageControls({ deal }: { deal: Deal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = NEXT_STAGE[deal.stage];

  async function advance() {
    if (!next || busy) return;
    setBusy(true);
    const res = await fetch(`/api/deals/${deal.id}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  const deliveredCountdown =
    deal.stage === "delivered" && deal.delivered_at
      ? hoursUntilArchive(deal.delivered_at)
      : null;

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-zinc-300">
        {STAGE_LABEL[deal.stage]}
      </span>
      {deliveredCountdown !== null && (
        <span className="text-xs text-zinc-500">
          auto-archives in {deliveredCountdown}h
        </span>
      )}
      {next && (
        <button
          onClick={advance}
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Move to {STAGE_LABEL[next]}
        </button>
      )}
    </div>
  );
}

function hoursUntilArchive(deliveredAt: string): number {
  const delivered = new Date(deliveredAt).getTime();
  const archives = delivered + 24 * 60 * 60 * 1000;
  const hours = Math.max(0, Math.ceil((archives - Date.now()) / (60 * 60 * 1000)));
  return hours;
}

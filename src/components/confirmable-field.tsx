"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string;
  fieldPath: string;          // e.g. "primary.dl_number"
  label: string;
  value: string | number | null | undefined;
  initialConfirmed: boolean;
  warning?: string | null;     // e.g. "VIN failed checksum"
}

/**
 * Renders a high-stakes field (VIN, DL#, DOB, payoff, SSN). If a value is
 * present but the deal's confirmed_fields doesn't mark this path as
 * confirmed, the field is highlighted red and prompts "Tap to confirm."
 * Once confirmed, it renders like any other field.
 */
export function ConfirmableField({ dealId, fieldPath, label, value, initialConfirmed, warning }: Props) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [busy, setBusy] = useState(false);

  const hasValue = value !== null && value !== undefined && value !== "";
  const needsConfirm = hasValue && !confirmed;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const target = !confirmed;
    const res = await fetch(`/api/deals/${dealId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fieldPath, confirmed: target }),
    });
    setBusy(false);
    if (res.ok) {
      setConfirmed(target);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm",
            needsConfirm ? "text-danger" : warning ? "text-warn" : "text-zinc-200",
            !hasValue && "text-zinc-600",
          )}
        >
          {hasValue ? String(value) : "—"}
        </span>
        {hasValue && (
          <button
            onClick={toggle}
            disabled={busy}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              confirmed
                ? "bg-ok/15 text-ok"
                : "bg-danger/15 text-danger hover:bg-danger/25",
            )}
            title={confirmed ? "Confirmed — click to un-confirm" : "Tap to confirm"}
          >
            {confirmed ? "✓ confirmed" : "confirm"}
          </button>
        )}
      </div>
      {warning && <p className="mt-0.5 text-[10px] text-warn">{warning}</p>}
    </div>
  );
}

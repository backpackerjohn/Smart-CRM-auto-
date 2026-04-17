"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptureKind, Deal } from "@/types/db";
import { cn } from "@/lib/utils";
import { enqueueCapture, drainQueue, countPending } from "@/lib/offline/queue";

const KIND_OPTIONS: Array<{ value: CaptureKind; label: string }> = [
  { value: "dl_front", label: "DL front" },
  { value: "dl_back", label: "DL back" },
  { value: "insurance_card", label: "Insurance" },
  { value: "registration", label: "Registration" },
  { value: "title", label: "Title" },
  { value: "payoff_letter", label: "Payoff" },
  { value: "stock_sheet", label: "Stock sheet" },
  { value: "dms_screenshot", label: "DMS screen" },
  { value: "other", label: "Other" },
];

interface Props {
  activeDeals: Pick<Deal, "id" | "title" | "stage">[];
}

export function CaptureScreen({ activeDeals }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [kind, setKind] = useState<CaptureKind>("dl_front");
  const [assigning, setAssigning] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);

  // Drain queue on mount + whenever the browser comes back online.
  useEffect(() => {
    async function sync() {
      const { sent } = await drainQueue().catch(() => ({ sent: 0, failed: 0 }));
      const n = await countPending().catch(() => 0);
      setPendingUploads(n);
      return sent;
    }
    sync();
    function onOnline() { sync(); }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function shoot() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (!blob) return;
    setShot({ blob, url: URL.createObjectURL(blob) });
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  }

  async function assign(target: "deal" | "new" | "unassigned", dealId?: string) {
    if (!shot) return;
    setAssigning(true);
    const form = new FormData();
    form.set("file", shot.blob, `${kind}.jpg`);
    form.set("kind", kind);
    form.set("device", "mobile");
    if (target === "deal" && dealId) form.set("dealId", dealId);
    if (target === "new") form.set("createNewDeal", "1");

    try {
      if (!navigator.onLine) throw new Error("offline");
      const res = await fetch("/api/captures", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const { dealId: returnedDealId } = await res.json();
      retake();
      setAssigning(false);
      if (returnedDealId) {
        window.location.href = `/deals/${returnedDealId}`;
      }
    } catch (err) {
      // Network / offline fallback: queue locally and move on.
      try {
        await enqueueCapture({
          dealId: target === "deal" ? (dealId ?? null) : null,
          kind,
          assignedTo: "unassigned",
          device: "mobile",
          createNewDeal: target === "new",
          blob: shot.blob,
          filename: `${kind}.jpg`,
        });
        const n = await countPending();
        setPendingUploads(n);
        retake();
      } catch (queueErr) {
        setError(err instanceof Error ? err.message : "Upload failed and queue unavailable.");
      }
      setAssigning(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-danger">{error}</p>
          <p className="mt-2 text-xs text-zinc-500">Grant camera permission and reload.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        {!shot ? (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        ) : (
          <img src={shot.url} alt="capture" className="h-full w-full object-contain" />
        )}
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute left-0 top-0 flex w-full gap-1 overflow-x-auto p-2 text-xs">
          {KIND_OPTIONS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "whitespace-nowrap rounded-full border border-white/20 bg-black/40 px-3 py-1",
                kind === k.value && "bg-accent",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        {pendingUploads > 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-warn/90 px-3 py-1 text-[11px] font-medium text-black">
            {pendingUploads} queued · will upload when online
          </div>
        )}
      </div>

      {!shot ? (
        <div className="flex items-center justify-center gap-6 bg-black py-4">
          <button
            onClick={shoot}
            className="h-16 w-16 rounded-full border-4 border-white bg-white/10"
            aria-label="Shutter"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-white/10 bg-black p-4">
          <p className="text-sm text-zinc-300">Attach this {kind.replace("_", " ")} to:</p>
          <div className="flex flex-col gap-2">
            {activeDeals.slice(0, 5).map((d) => (
              <button
                key={d.id}
                disabled={assigning}
                onClick={() => assign("deal", d.id)}
                className="rounded-lg bg-surface-2 px-3 py-2 text-left text-sm"
              >
                {d.title ?? "(untitled)"} <span className="ml-2 text-xs text-zinc-500">{d.stage}</span>
              </button>
            ))}
            <button
              disabled={assigning}
              onClick={() => assign("new")}
              className="rounded-lg bg-accent px-3 py-2 text-left text-sm font-medium"
            >
              + New Deal
            </button>
            <button
              disabled={assigning}
              onClick={() => assign("unassigned")}
              className="rounded-lg bg-surface-2 px-3 py-2 text-left text-sm text-zinc-400"
            >
              Unassigned — decide later
            </button>
            <button
              disabled={assigning}
              onClick={retake}
              className="rounded-lg border border-white/20 px-3 py-2 text-sm"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

import type { Capture, CaptureKind } from "@/types/db";

export interface GalleryRow extends Capture {
  signedUrl: string | null;
}

interface Props {
  rows: GalleryRow[];
}

const KIND_LABEL: Record<CaptureKind, string> = {
  dl_front: "DL front",
  dl_back: "DL back",
  insurance_card: "Insurance",
  registration: "Registration",
  title: "Title",
  payoff_letter: "Payoff",
  stock_sheet: "Stock sheet",
  dms_screenshot: "DMS screen",
  other: "Other",
};

export function CapturesGallery({ rows }: Props) {
  return (
    <section className="rounded-xl border border-surface-2 bg-surface-1">
      <header className="flex items-center justify-between border-b border-surface-2 px-4 py-2">
        <h3 className="text-sm font-semibold">Source images</h3>
        <p className="text-xs text-zinc-400">{rows.length} captures</p>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500">No captures yet.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              {r.signedUrl ? (
                <a href={r.signedUrl} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.signedUrl}
                    alt={KIND_LABEL[r.kind]}
                    className="aspect-square w-full rounded-md object-cover ring-1 ring-surface-2"
                  />
                </a>
              ) : (
                <div className="aspect-square w-full rounded-md bg-surface-2" />
              )}
              <p className="mt-1 text-[10px] text-zinc-500">
                {KIND_LABEL[r.kind]}
                {r.assigned_to !== "unassigned" && (
                  <span className="ml-1 text-zinc-600">· {r.assigned_to.replace("_", " ")}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

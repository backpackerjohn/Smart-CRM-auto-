import type { FilledPdf, PdfForm } from "@/types/db";

export interface FilledPdfRow extends FilledPdf {
  signedUrl: string | null;
  form: Pick<PdfForm, "id" | "name"> | null;
}

interface Props {
  rows: FilledPdfRow[];
}

export function FilledPdfsPanel({ rows }: Props) {
  return (
    <section className="rounded-xl border border-surface-2 bg-surface-1">
      <header className="flex items-center justify-between border-b border-surface-2 px-4 py-2">
        <h3 className="text-sm font-semibold">Filled PDFs</h3>
        <p className="text-xs text-zinc-400">{rows.length} stored</p>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500">
          None yet. Click Fill forms in the header to generate filled PDFs for this deal.
        </p>
      ) : (
        <ul className="divide-y divide-surface-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{r.form?.name ?? "Unknown form"}</p>
                <p className="text-[11px] text-zinc-500">
                  {new Date(r.created_at).toLocaleString()} · {r.fields_filled ?? 0} filled · {r.fields_blank ?? 0} blank
                </p>
              </div>
              <div className="flex gap-2">
                {r.signedUrl && (
                  <>
                    <a
                      href={r.signedUrl}
                      download
                      className="rounded-md bg-surface-2 px-2 py-1 text-[11px] text-zinc-300"
                    >
                      Download
                    </a>
                    <a
                      href={r.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-surface-2 px-2 py-1 text-[11px] text-zinc-300"
                    >
                      Open
                    </a>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

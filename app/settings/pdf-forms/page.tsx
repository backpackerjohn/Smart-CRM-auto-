import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PdfFormUpload } from "@/components/pdf-form-upload";

export default async function PdfFormsPage() {
  const supabase = await createClient();
  const { data: forms } = await supabase
    .from("pdf_forms")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">PDF forms</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Upload a fillable PDF. The AI will propose field mappings; you confirm once.
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Home</Link>
      </div>

      <PdfFormUpload />

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-300">Uploaded forms</h2>
        {forms && forms.length > 0 ? (
          <ul className="mt-2 divide-y divide-surface-2 rounded-xl border border-surface-2">
            {forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-zinc-500">
                    {f.field_count ?? 0} fields · {f.form_set ?? "no set"}
                  </p>
                </div>
                <Link
                  href={`/settings/pdf-forms/${f.id}`}
                  className="rounded-md bg-surface-2 px-3 py-1 text-xs"
                >
                  Review mapping
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No forms uploaded yet.</p>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PdfMappingReview } from "@/components/pdf-mapping-review";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PdfMappingPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: form }, { data: mappings }] = await Promise.all([
    supabase.from("pdf_forms").select("*").eq("id", id).maybeSingle(),
    supabase.from("pdf_field_mappings").select("*").eq("pdf_form_id", id).order("pdf_field_name"),
  ]);

  if (!form) notFound();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{form.name}</h1>
          <p className="text-xs text-zinc-500">{form.field_count ?? 0} fields · {form.form_set ?? "no set"}</p>
        </div>
        <Link href="/settings/pdf-forms" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Forms
        </Link>
      </div>

      <PdfMappingReview formId={id} mappings={mappings ?? []} />
    </main>
  );
}

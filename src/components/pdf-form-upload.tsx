"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PdfFormUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [formSet, setFormSet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("name", name || file.name);
    if (formSet) body.set("formSet", formSet);

    const res = await fetch("/api/pdf/upload", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const { id } = await res.json();
    router.push(`/settings/pdf-forms/${id}`);
  }

  return (
    <form onSubmit={upload} className="mt-4 flex flex-col gap-3 rounded-xl border border-surface-2 bg-surface-1 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">PDF file (must have named form fields)</span>
        <input
          type="file"
          accept="application/pdf"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ohio retail delivery"
          className="rounded-lg border border-surface-2 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Form set (grouping; optional)</span>
        <input
          value={formSet}
          onChange={(e) => setFormSet(e.target.value)}
          placeholder="retail_delivery"
          className="rounded-lg border border-surface-2 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !file}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Uploading + mapping…" : "Upload and auto-map"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

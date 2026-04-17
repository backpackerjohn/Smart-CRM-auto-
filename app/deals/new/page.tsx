"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewDealPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title || null }),
    });
    if (!res.ok) {
      setError(await res.text());
      setBusy(false);
      return;
    }
    const { id } = await res.json();
    router.push(`/deals/${id}`);
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">New deal</h1>
      <p className="mt-1 text-sm text-zinc-400">
        You can start blank and attach a customer later.
      </p>

      <form onSubmit={create} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Title (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Smith — 2024 Tacoma"
            className="rounded-lg border border-surface-2 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create deal"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </main>
  );
}

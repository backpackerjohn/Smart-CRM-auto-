"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={sendMagicLink}
        className="w-full max-w-sm rounded-2xl border border-surface-2 bg-surface-1 p-6 shadow-xl"
      >
        <h1 className="text-xl font-semibold">Smart CRM Auto</h1>
        <p className="mt-1 text-sm text-zinc-400">Sign in with a magic link.</p>

        <input
          type="email"
          required
          autoFocus
          placeholder="you@dealership.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-4 w-full rounded-lg border border-surface-2 bg-surface-2 px-3 py-2 text-base outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={status === "sending" || status === "sent"}
          className="mt-3 w-full rounded-lg bg-accent px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : status === "sent" ? "Check your inbox" : "Send magic link"}
        </button>

        {error && (
          <p className="mt-3 rounded-md bg-danger/10 px-2 py-1 text-sm text-danger">{error}</p>
        )}
      </form>
    </main>
  );
}

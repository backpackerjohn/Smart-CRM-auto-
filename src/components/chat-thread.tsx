"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/types/db";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";

interface Props {
  dealId: string;
  initialMessages: ChatMessage[];
}

// Chat metadata phases that should re-render server components (profile + checklist).
const REFRESH_PHASES = new Set(["extraction_applied", "correction_applied", "stage_changed"]);

export function ChatThread({ dealId, initialMessages }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Subscribe to realtime messages for this deal.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`deal:${dealId}:chat`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `deal_id=eq.${dealId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

          const phase = (m.metadata as { phase?: string } | null)?.phase;
          if (phase && REFRESH_PHASES.has(phase)) {
            router.refresh();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input;
    setInput("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId, content: text }),
    });
    if (!res.ok) {
      console.error("chat send failed", await res.text());
    }
    setSending(false);
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-surface-2 bg-surface-1">
      <header className="border-b border-surface-2 px-4 py-2">
        <h3 className="text-sm font-semibold">Chat</h3>
      </header>

      <div ref={scrollRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-zinc-500">No messages yet. Upload a photo or ask a question.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                m.role === "user" ? "ml-auto bg-accent text-white" : "bg-surface-2 text-zinc-100",
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              <p className="mt-1 text-[10px] opacity-60">
                {new Date(m.created_at).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-surface-2 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, correct, or note something…"
          className="flex-1 rounded-lg border border-surface-2 bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

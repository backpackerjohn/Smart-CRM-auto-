import { callChat } from "./client";
import type { ChatMessage, Deal, Customer } from "@/types/db";
import type { ChecklistRow } from "@/types/checklist";

// Chat is grounded in a single Deal. Full deal context is stuffed into the system instruction.
// Typed corrections are parsed deterministically by the server route, not by the chat model —
// the chat model only acknowledges them.

export interface ChatContext {
  deal: Deal;
  primary: Customer | null;
  coBuyer: Customer | null;
  checklist: ChecklistRow[];
  recentMessages: ChatMessage[];       // last N, newest last
  userMessage: string;
}

function formatChecklist(rows: ChecklistRow[]): string {
  if (!rows.length) return "(empty)";
  return rows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => {
      const mark = r.state === "complete" ? "✅" : r.state === "warn" ? "⚠️" : r.state === "manual" ? "✎" : "☐";
      const msg = r.message ? ` — ${r.message}` : "";
      return `${mark} ${r.label}${msg}`;
    })
    .join("\n");
}

function formatCustomer(c: Customer | null, label: string): string {
  if (!c) return `${label}: none`;
  const name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");
  const addr = [c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(", ");
  return `${label}: ${name || "(unnamed)"}\n  DL: ${c.dl_number ?? "?"} (${c.dl_state ?? "?"})\n  DOB: ${c.dob ?? "?"}\n  Address: ${addr || "?"}`;
}

export async function answerInDealChat(ctx: ChatContext): Promise<string> {
  const system = `You are the in-deal assistant for a car dealership CRM. You help the salesperson on ONE deal at a time.

Rules:
- Answer only from the provided deal context. If you don't know, say so.
- Be terse. One to three sentences unless asked for more.
- Never invent VINs, SSNs, DL numbers, or dollar amounts.
- If the user types a correction (like "address is 456 Oak"), confirm that you'll update it. The system parses corrections separately; you just acknowledge.
- Never leak data from other deals.

Deal title: ${ctx.deal.title ?? "(untitled)"}
Deal stage: ${ctx.deal.stage}

${formatCustomer(ctx.primary, "Primary")}

${formatCustomer(ctx.coBuyer, "Co-buyer")}

Checklist:
${formatChecklist(ctx.checklist)}
`;

  const contents = [
    ...ctx.recentMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: ctx.userMessage }] },
  ];

  const { text } = await callChat(contents, { systemInstruction: system, temperature: 0.3, maxOutputTokens: 400 });
  return text.trim();
}

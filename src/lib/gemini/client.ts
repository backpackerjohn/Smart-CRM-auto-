import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

// Central Gemini client. Server-only — never import from a client component.
// Zero-retention: ensure the API key used is on a project with "Data not used to train" enabled.

let _client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";

export interface CallOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface StructuredCallOptions<T> extends CallOptions {
  responseSchema: unknown;         // OpenAPI 3.0-shaped schema accepted by Gemini
  parse?: (raw: unknown) => T;
}

export async function callStructured<T>(
  contents: Array<{ role?: string; parts: Array<Record<string, unknown>> }>,
  opts: StructuredCallOptions<T>,
): Promise<{ value: T; latencyMs: number; raw: GenerateContentResponse }> {
  const client = getGemini();
  const started = Date.now();
  const raw = await client.models.generateContent({
    model: opts.model ?? DEFAULT_MODEL,
    contents,
    config: {
      systemInstruction: opts.systemInstruction,
      temperature: opts.temperature ?? 0.1,
      maxOutputTokens: opts.maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: opts.responseSchema as never,
    },
  });
  const latencyMs = Date.now() - started;

  const text = raw.text ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }
  const value = opts.parse ? opts.parse(parsed) : (parsed as T);
  return { value, latencyMs, raw };
}

export async function callChat(
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>,
  opts: CallOptions = {},
): Promise<{ text: string; latencyMs: number; raw: GenerateContentResponse }> {
  const client = getGemini();
  const started = Date.now();
  const raw = await client.models.generateContent({
    model: opts.model ?? DEFAULT_MODEL,
    contents,
    config: {
      systemInstruction: opts.systemInstruction,
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  });
  return { text: raw.text ?? "", latencyMs: Date.now() - started, raw };
}

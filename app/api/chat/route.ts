export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

// -------- Env --------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const CALENDLY =
  process.env.NEXT_PUBLIC_CALENDLY_LINK ??
  "https://calendly.com/martividigital/30min";
const WEBHOOK = process.env.LEAD_WEBHOOK_URL ?? "";

/**
 * Comma-separated allowlist, e.g.:
 * "https://martiviconsulting.com, https://www.martiviconsulting.com"
 * If empty, we allow "*".
 */
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// -------- OpenAI --------
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// -------- Types / Schema --------
type Role = "system" | "user" | "assistant";
type ChatMessage = { role: Role; content: string };
type Lead = {
  name?: string;
  email?: string;
  company?: string;
  budget?: string;
  timeline?: string;
  country?: string;
};

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })
    )
    .default([]),
  lead: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      company: z.string().optional(),
      budget: z.string().optional(),
      timeline: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

// -------- CORS helper (normalize origin and echo if allowed) --------
function corsHeaders(req: NextRequest) {
  const origin = (req.headers.get("origin") || "").trim().toLowerCase();

  const allow =
    ALLOW_ORIGINS.length === 0
      ? "*" // allow all if none configured
      : ALLOW_ORIGINS.includes(origin)
      ? origin // echo exact origin if matched
      : ALLOW_ORIGINS[0]; // fallback to first

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(req: NextRequest, body: unknown, init?: number | ResponseInit) {
  const base: ResponseInit =
    typeof init === "number" ? { status: init } : init ?? {};
  return NextResponse.json(body, {
    ...base,
    headers: { ...(base.headers || {}), ...corsHeaders(req) },
  });
}

// -------- Routes --------
const SYSTEM_PROMPT = `You are MARTIVI CONSULTING’s assistant.
Goals:
1) Understand the user’s need in 2–3 short questions max.
2) Explain services clearly, concise, in the user's language (Eng/Geo).
3) Always offer: free 20-min discovery call (${CALENDLY}), or leave contacts.
4) If unsure, ask 1 clarifying question; do not invent facts.
5) Collect lead fields when the user shows purchase intent:
   - Full name, Email, Company (optional), Budget range, Timeline, Country.
Tone: warm, expert, practical. Keep answers under 8 sentences unless asked.`;

// Healthcheck
export async function GET(req: NextRequest) {
  return json(req, { ok: true });
}

// Preflight
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// Chat
export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY)
      return json(req, { error: "OPENAI_API_KEY missing" }, 500);

    const parsed = BodySchema.parse(await req.json());
    const trimmed: ChatMessage[] = (parsed.messages ?? []).slice(-12);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    // Strip Calendly links; UI shows the button instead.
    const cleaned = raw
      .replace(/\[.*?\]\(https?:\/\/calendly\.com[^\)]*\)/gi, "")
      .replace(/https?:\/\/calendly\.com[^\s)]+/gi, "")
      .trim();

    // Simple lead signal: email in reply or provided
    const hasEmailInReply =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw);
    const maybeLead = hasEmailInReply || Boolean(parsed.lead?.email);

    if (maybeLead && WEBHOOK) {
      const payload = {
        source: "chatbot",
        lead: parsed.lead ?? ({} as Lead),
        rawReply: raw,
        when: new Date().toISOString(),
      };
      try {
        await fetch(WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error("Lead webhook error:", e);
      }
    }

    return json(req, { reply: cleaned });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Chat error:", msg);
    return json(req, { error: "bad_request" }, 400);
  }
}
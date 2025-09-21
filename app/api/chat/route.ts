export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

// CORS
const ORIGIN = process.env.ALLOWED_ORIGIN || "https://www.martiviconsulting.com";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: CORS });
}

// lazy client (so OPTIONS/GET don't require the key)
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  return new OpenAI({ apiKey });
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Lead = { name?: string; email?: string; company?: string; budget?: string; timeline?: string; country?: string };

const BodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system","user","assistant"]),
    content: z.string()
  })).default([]),
  lead: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    company: z.string().optional(),
    budget: z.string().optional(),
    timeline: z.string().optional(),
    country: z.string().optional(),
  }).optional()
});

const CALENDLY = process.env.NEXT_PUBLIC_CALENDLY_LINK || "#";
const SYSTEM_PROMPT = `You are MARTIVI CONSULTING’s assistant.
Goals:
1) Understand the user’s need in 2–3 short questions max.
2) Explain services clearly, concise, in the user's language (Eng/Geo).
3) Always offer: free 20-min discovery call (${CALENDLY}), or leave contacts.
4) If unsure, ask 1 clarifying question; do not invent facts.
5) Collect lead fields when the user shows purchase intent:
   - Full name, Email, Company (optional), Budget range, Timeline, Country.
Tone: warm, expert, practical. Keep answers under 8 sentences unless asked.`;

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { messages, lead } = BodySchema.parse(json);

    const client = getOpenAI(); // <-- create here
    const trimmed: ChatMessage[] = (messages ?? []).slice(-12);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed]
    });

    const text = (completion.choices[0]?.message?.content ?? "").replace("[#]", CALENDLY);

    const maybeLead =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) || (lead && lead.email);

    const webhook = process.env.LEAD_WEBHOOK_URL;
    if (maybeLead && webhook) {
      const payload = {
        source: "chatbot",
        lead: lead || {},
        rawReply: text,
        when: new Date().toISOString()
      };
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Lead webhook error:", err);
      }
    }

    return NextResponse.json({ reply: text }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = String(msg).includes("OPENAI_API_KEY") ? 500 : 400;
    return NextResponse.json({ error: msg }, { status, headers: CORS });
  }
}
"use client";
import { useEffect, useRef, useState } from "react";

type Role = "system" | "user" | "assistant";
type Message = { role: Role; content: string };

// Calendly link
const CALENDLY =
  process.env.NEXT_PUBLIC_CALENDLY_LINK ||
  "https://calendly.com/martividigital/30min";

// API base (Vercel) — falls back to same-origin for local testing
const API_BASE = process.env.NEXT_PUBLIC_CHAT_API_BASE || "";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // auto-scroll to newest message
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input };
    const newMessages: Message[] = [...messages, userMsg];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      // strip Calendly links from bot text
      const rawReply: string = typeof data.reply === "string" ? data.reply : "";
      const cleanedReply = rawReply
        .replace(/\[.*?\]\(https?:\/\/calendly\.com[^\)]*\)/gi, "")
        .replace(/https?:\/\/calendly\.com[^\s)]+/gi, "")
        .trim();

      const botMsg: Message = { role: "assistant", content: cleanedReply };
      setMessages([...newMessages, botMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          padding: "10px 14px",
          borderRadius: 999,
          border: "none",
          background: "#111",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
          zIndex: 50,
        }}
      >
        Chat with us
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 80,
            width: 340,
            height: 440,
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            zIndex: 50,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: 10,
              borderBottom: "1px solid #ddd",
              fontWeight: 700,
            }}
          >
            <span>MARTIVI CONSULTING</span>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            style={{ flex: 1, overflowY: "auto", padding: 10, fontSize: 14 }}
          >
            {messages.map((m, i) => {
              const isBot = m.role === "assistant";
              const suggestsCall =
                isBot &&
                /schedule.*call|book.*call|discovery call/i.test(m.content);

              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 8,
                    textAlign: isBot ? "left" : "right",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: 12,
                      background: isBot ? "#f1f1f1" : "#111",
                      color: isBot ? "#000" : "#fff",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.content}
                  </div>

                  {/* Dynamic CTA button */}
                  {suggestsCall && (
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={CALENDLY}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          textDecoration: "none",
                          padding: "8px 14px",
                          borderRadius: 8,
                          background: "#0070f3",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 14,
                          display: "inline-block",
                        }}
                      >
                        📅 Book a Call
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
            {loading && (
              <div style={{ opacity: 0.6 }}>assistant is typing…</div>
            )}
          </div>

          {/* Composer */}
          <div style={{ display: "flex", borderTop: "1px solid #ddd" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              style={{ flex: 1, border: "none", padding: 10, outline: "none" }}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              style={{
                border: "none",
                background: "#111",
                color: "#fff",
                padding: "0 14px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
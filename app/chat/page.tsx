"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  Bot,
  CircleAlert,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useFplSettings } from "@/contexts/FplSettingsContext";
import { StructuredAssistantMessage } from "@/components/assistant/StructuredAssistantMessage";
import type { AssistantEvidenceItem } from "@/components/assistant/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: AssistantEvidenceItem[];
  isLoading?: boolean;
  error?: boolean;
}

const suggestions = [
  "Compare two midfielders using stored facts",
  "Which players are currently flagged?",
  "Show affordable forward candidates",
  "What data is still missing for GW1?",
];

export default function ChatPage() {
  const { assistantLanguage } = useFplSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };
    const history = [...messages, userMessage];
    const assistantId = `assistant-${Date.now()}`;
    setMessages([
      ...history,
      { id: assistantId, role: "assistant", content: "", isLoading: true },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: assistantLanguage,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        evidence?: AssistantEvidenceItem[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Assistant request failed");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: body.message ?? "No answer was returned.",
                evidence: body.evidence ?? [],
                isLoading: false,
              }
            : message,
        ),
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  error instanceof Error
                    ? error.message
                    : "Assistant unavailable",
                error: true,
                isLoading: false,
              }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="grid gap-5 border-b border-border py-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-2xl">
          <p className="text-[10px] font-black tracking-[0.16em] text-forecast uppercase">
            Evidence assistant
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
            Ask, then inspect the evidence
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Answers separate the assistant’s interpretation from stored facts
            and unavailable forecasts.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-uncertainty/40 bg-uncertainty/5 px-3 py-2 text-[10px] font-bold text-uncertainty">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          2026/27 forecasts pending
        </div>
      </header>

      <main className="flex-1 py-6">
        <div className="space-y-5">
          {messages.length === 0 && (
            <section className="grid min-h-[26rem] place-items-center border border-border bg-card px-5 py-10 text-center">
              <div className="max-w-2xl">
                <span className="mx-auto grid size-12 place-items-center border border-foreground bg-foreground text-background">
                  <Bot className="size-5" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-black">
                  Start with a decision, not a prompt trick
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  Ask about a player, a shortlist or the evidence needed for a
                  transfer. The assistant will show which internal lookups
                  informed its answer.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="border border-border bg-background px-3 py-3 text-left text-xs font-bold transition-colors hover:border-foreground/40 hover:bg-muted"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] border border-primary bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
                  {message.content}
                </div>
              </div>
            ) : message.isLoading ? (
              <div
                key={message.id}
                className="flex items-center gap-2 border border-border bg-card px-4 py-4 text-xs text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Checking the available evidence…
              </div>
            ) : message.error ? (
              <div
                key={message.id}
                className="flex items-start gap-3 border border-risk/40 bg-risk/5 px-4 py-3 text-sm"
                role="alert"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0 text-risk"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-black">Assistant unavailable</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {message.content}
                  </p>
                </div>
              </div>
            ) : (
              <StructuredAssistantMessage
                key={message.id}
                content={message.content}
                evidence={message.evidence ?? []}
              />
            ),
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/95 py-4 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Question for the FPL assistant</span>
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a player or decision…"
              disabled={isLoading}
            />
          </label>
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <ArrowUp aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Sparkles className="size-3" aria-hidden="true" />
          Assistant language:{" "}
          {assistantLanguage === "auto"
            ? "follows your question"
            : assistantLanguage === "ru"
              ? "Русский"
              : "English"}
        </p>
      </footer>
    </div>
  );
}

// lib/llm/client.ts
// Универсальный LLM-клиент с поддержкой Groq и Gemini

import { LLM_CONFIG, LlmProvider } from "./config";

// ==========================================
// TYPES
// ==========================================

export type LlmRole = "system" | "user" | "assistant" | "tool";

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmCallOptions {
  model?: string;
  tools?: LlmToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
}

export interface LlmCallResult {
  message: string | null;
  toolCalls: LlmToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ==========================================
// MAIN CLIENT
// ==========================================

export async function callLlm(
  messages: LlmMessage[],
  options: LlmCallOptions = {}
): Promise<LlmCallResult> {
  const provider =
    (process.env.LLM_PROVIDER as LlmProvider) || LLM_CONFIG.defaultProvider;

  if (provider === "groq") {
    return callGroq(messages, options);
  } else if (provider === "gemini") {
    return callGemini(messages, options);
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

// ==========================================
// GROQ ADAPTER
// ==========================================

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}

async function callGroq(
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const model = options.model || LLM_CONFIG.models.groq;

  // Конвертируем messages в формат Groq (OpenAI-compatible)
  const groqMessages: GroqMessage[] = messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool" as const,
        content: msg.content,
        tool_call_id: msg.toolCallId,
        name: msg.name,
      };
    }
    if (msg.role === "assistant" && msg.toolCalls) {
      return {
        role: "assistant" as const,
        content: null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  });

  // Конвертируем tools в формат Groq
  const tools = options.tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const body: Record<string, unknown> = {
    model,
    messages: groqMessages,
    temperature: options.temperature ?? LLM_CONFIG.defaultTemperature,
    max_tokens: options.maxTokens ?? LLM_CONFIG.maxTokensPerCall,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = options.toolChoice || "auto";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_CONFIG.timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    
    // Fallback для ошибки tool_use_failed с XML-форматом (Llama 3.3)
    // Пример: {"error":{"message":"...","failed_generation":"<function=search_replacements{\"position\": \"DEF\"}></function>"}}
    if (response.status === 400 && errorText.includes("tool_use_failed")) {
      try {
        const errorJson = JSON.parse(errorText);
        const failedGeneration = errorJson.error?.failed_generation;
        
        if (typeof failedGeneration === "string") {
          // Парсим формат <function=NAME ARGS></function>
          const match = failedGeneration.match(/<function=(\w+)(.*?)><\/function>/);
          if (match) {
            const toolName = match[1];
            const argsString = match[2];
            
            try {
              const args = JSON.parse(argsString);
              console.log(`[Groq Fallback] Recovered tool call: ${toolName}`, args);
              
              return {
                message: null,
                toolCalls: [{
                  id: `fallback_${Date.now()}`,
                  name: toolName,
                  arguments: args,
                }],
                // Usage неизвестен при ошибке
              };
            } catch (e) {
              console.error("[Groq Fallback] Failed to parse args JSON:", e);
            }
          }
        }
      } catch (e) {
        console.error("[Groq Fallback] Failed to parse error JSON:", e);
      }
    }

    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  // Парсим tool_calls
  const toolCalls: LlmToolCall[] = (choice.message.tool_calls || []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}"),
    })
  );

  return {
    message: choice.message.content,
    toolCalls,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

// ==========================================
// GEMINI ADAPTER
// ==========================================

async function callGemini(
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const model = options.model || LLM_CONFIG.models.gemini;

  // Извлекаем system prompt
  const systemInstruction = messages.find((m) => m.role === "system")?.content;

  // Конвертируем messages в формат Gemini
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: msg.name,
                response: { result: msg.content },
              },
            },
          ],
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "model",
          parts: msg.toolCalls.map((tc) => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          })),
        };
      }
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      };
    });

  // Конвертируем tools в формат Gemini
  const tools = options.tools?.length
    ? [
        {
          functionDeclarations: options.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        },
      ]
    : undefined;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? LLM_CONFIG.defaultTemperature,
      maxOutputTokens: options.maxTokens ?? LLM_CONFIG.maxTokensPerCall,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (tools) {
    body.tools = tools;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_CONFIG.timeoutMs),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    throw new Error("No response from Gemini");
  }

  // Парсим function calls
  const toolCalls: LlmToolCall[] = [];
  let messageText: string | null = null;

  for (const part of candidate.content?.parts || []) {
    if (part.functionCall) {
      toolCalls.push({
        id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      });
    } else if (part.text) {
      messageText = part.text;
    }
  }

  return {
    message: messageText,
    toolCalls,
    usage: data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : undefined,
  };
}

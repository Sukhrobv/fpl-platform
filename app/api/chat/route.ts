// app/api/chat/route.ts
// Chat API endpoint с поддержкой function calling

import { NextRequest, NextResponse } from "next/server";
import { callLlm, LlmMessage } from "@/lib/llm/client";
import { SYSTEM_PROMPT } from "@/lib/llm/prompts/systemPrompt";
import { getToolDefinitionsForLlm, executeTool } from "@/lib/llm/tools/definitions";
import { LLM_CONFIG } from "@/lib/llm/config";

// ==========================================
// TYPES
// ==========================================

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  userId?: string;
}

interface ChatResponse {
  message: string;
  toolsUsed: string[];
}

// ==========================================
// HANDLER
// ==========================================

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest;
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Формируем контекст для LLM
    const llmMessages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.slice(-LLM_CONFIG.maxMessagesHistory).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const toolsUsed: string[] = [];

    // Первый вызов LLM
    let result = await callLlm(llmMessages, {
      tools: getToolDefinitionsForLlm(),
      toolChoice: "auto",
    });

    // Обработка tool calls (цикл)
    let iterations = 0;
    while (
      result.toolCalls.length > 0 &&
      iterations < LLM_CONFIG.maxToolCallsPerRequest
    ) {
      iterations++;

      // Добавляем assistant message с tool calls
      llmMessages.push({
        role: "assistant",
        content: result.message || "",
        toolCalls: result.toolCalls,
      });

      // Выполняем все tool calls
      for (const toolCall of result.toolCalls) {
        console.log(`[Chat API] Executing tool: ${toolCall.name}`, toolCall.arguments);
        toolsUsed.push(toolCall.name);

        const toolResult = await executeTool(toolCall.name, toolCall.arguments);

        llmMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(toolResult, null, 2),
        });
      }

      // Снова вызываем LLM для финального ответа
      result = await callLlm(llmMessages, {
        tools: getToolDefinitionsForLlm(),
        toolChoice: "auto",
      });
    }

    // Возвращаем ответ
    return NextResponse.json({
      message: result.message || "Не удалось получить ответ",
      toolsUsed: [...new Set(toolsUsed)], // Уникальные tools
    } satisfies ChatResponse);
  } catch (error) {
    console.error("[Chat API] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Определяем тип ошибки для пользователя
    if (errorMessage.includes("API_KEY")) {
      return NextResponse.json(
        { error: "LLM API key not configured" },
        { status: 500 }
      );
    }

    if (errorMessage.includes("timeout")) {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

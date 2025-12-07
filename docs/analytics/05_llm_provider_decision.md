# Решение по LLM-провайдеру для FPL AI Assistant

## Выбранный провайдер: **Groq**

### Модель: `llama-3.3-70b-versatile`

## Обоснование выбора

| Критерий              | Groq              | Gemini        |
| --------------------- | ----------------- | ------------- |
| **Бесплатный лимит**  | 14,400 req/day    | 1,500 req/day |
| **Function Calling**  | ✅ Отличный       | ✅ Хороший    |
| **Скорость ответа**   | Очень быстрая     | Быстрая       |
| **API совместимость** | OpenAI-compatible | Custom        |

### Причины выбора Groq:

1. **Высокий бесплатный лимит** — 14,400 запросов/день достаточно для 3-5 пользователей
2. **Качественный Function Calling** — Llama 3.1 70B отлично понимает JSON Schema
3. **OpenAI-совместимый API** — упрощает интеграцию и миграцию
4. **Низкая латентность** — ответы за ~1 сек благодаря LPU

## Конфигурация

```env
# .env
LLM_PROVIDER=groq
GROQ_API_KEY=your_api_key_here
```

## Fallback стратегия

При исчерпании лимита Groq или недоступности — переключение на Gemini:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
```

## Получение API ключа

1. Зарегистрироваться на [console.groq.com](https://console.groq.com)
2. Создать API key
3. Добавить в `.env` файл

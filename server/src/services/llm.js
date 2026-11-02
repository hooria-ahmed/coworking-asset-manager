// Shared service: the one place that talks to the LLM API.
// Supports Groq API (free ultra-fast models) and Anthropic Claude API.
// Owner: Misbah (AI). The API key stays on the server only (NFR-SC).
const Anthropic = require('@anthropic-ai/sdk');
const { AI_TIMEOUT_MS } = require('../config/constants');

const MODEL = process.env.AI_MODEL || (process.env.GROQ_API_KEY ? 'openai/gpt-oss-120b' : 'claude-opus-5-5');

const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

let client = null;

class GroqAPIError extends Anthropic.APIError {
  constructor(status, message) {
    super(status, { error: { message } }, message, new Headers());
    this.name = 'GroqAPIError';
  }
}

function isAIConfigured() {
  return Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

async function callGroq({ system, messages, tools, outputFormat, maxTokens = 4000 }) {
  const model = process.env.GROQ_MODEL || (process.env.AI_MODEL && !process.env.AI_MODEL.startsWith('claude') ? process.env.AI_MODEL : 'openai/gpt-oss-120b');

  const openAiMessages = [];
  if (system) {
    let sysText = system;
    if (outputFormat) {
      sysText += `\n\nIMPORTANT: You must output a valid JSON object conforming to this schema:\n${JSON.stringify(outputFormat)}`;
    }
    openAiMessages.push({ role: 'system', content: sysText });
  }

  for (const m of messages) {
    if (typeof m.content === 'string') {
      openAiMessages.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      if (m.role === 'assistant') {
        const textParts = [];
        const toolCalls = [];
        for (const b of m.content) {
          if (b.type === 'text' && b.text) textParts.push(b.text);
          if (b.type === 'tool_use') {
            toolCalls.push({
              id: b.id,
              type: 'function',
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input || {}),
              },
            });
          }
        }
        openAiMessages.push({
          role: 'assistant',
          content: textParts.join('\n') || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        });
      } else if (m.role === 'user') {
        const toolResults = m.content.filter((b) => b.type === 'tool_result');
        if (toolResults.length) {
          for (const tr of toolResults) {
            openAiMessages.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
            });
          }
        } else {
          const text = m.content.map((b) => b.text || JSON.stringify(b)).join('\n');
          openAiMessages.push({ role: 'user', content: text });
        }
      }
    }
  }

  const openAiTools = tools?.length
    ? tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema || { type: 'object', properties: {} },
        },
      }))
    : undefined;

  const payload = {
    model,
    max_tokens: maxTokens,
    messages: openAiMessages,
    ...(openAiTools ? { tools: openAiTools } : {}),
    ...(outputFormat ? { response_format: { type: 'json_object' } } : {}),
  };

  // A timeout (AbortSignal) or a network failure throws a plain Error, not an APIError. Turn it
  // into a GroqAPIError so callers fall back to rules / answer 503 instead of a 500 (FR-AI-07, FR-RC-07).
  let response;
  try {
    response = await fetch(process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS || 15000),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new GroqAPIError(timedOut ? 408 : 503, `Groq request failed: ${timedOut ? 'timed out' : err?.message || 'network error'}`);
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new GroqAPIError(response.status, `Groq API error (${response.status}): ${errBody}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new GroqAPIError(502, 'Groq returned a reply that is not JSON');
  }
  const choice = data.choices?.[0];
  if (!choice) throw new GroqAPIError(500, 'Empty response from Groq');

  const msg = choice.message;
  const contentBlocks = [];
  if (msg.content) {
    contentBlocks.push({ type: 'text', text: msg.content });
  }
  if (msg.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      let parsed = {};
      try { parsed = JSON.parse(tc.function.arguments || '{}'); } catch {}
      contentBlocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: parsed,
      });
    }
  }

  const stop_reason = (choice.finish_reason === 'tool_calls' || msg.tool_calls?.length) ? 'tool_use' : 'end_turn';

  return {
    stop_reason,
    content: contentBlocks,
  };
}

async function createMessage({ system, messages, tools, outputFormat, maxTokens = 4000, effort = 'low', retry = true }) {
  if (process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return callGroq({ system, messages, tools, outputFormat, maxTokens });
  }

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: {
      effort,
      ...(outputFormat ? { format: { type: 'json_schema', schema: outputFormat } } : {}),
    },
    system,
    messages,
    ...(tools ? { tools } : {}),
  };
  const options = retry ? undefined : { maxRetries: 0 };
  if (FALLBACK_MODELS.has(MODEL)) {
    return getClient().beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, options);
  }
  return getClient().messages.create(params, options);
}

// All text blocks of a response joined together.
function textOf(response) {
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

module.exports = { MODEL, isAIConfigured, getClient, createMessage, textOf, Anthropic };

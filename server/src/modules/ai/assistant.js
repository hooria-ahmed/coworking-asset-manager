const C = require('../../config/constants');
const { ApiError } = require('../../utils/http');
const { isAIConfigured, createMessage, textOf, Anthropic } = require('../../services/llm');
const { FEATURE, assertWithinLimit, logChat } = require('./usage');
const { toolsFor, runTool } = require('./tools');
const { today } = require('./dates');

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 2000;
const MAX_LINKS = 6;
const UNAVAILABLE = 'The AI assistant is unavailable right now. Please use search instead.';

function systemPrompt(user) {
  const t = today();
  return `You are the AI Asset Assistant of a co-working space's asset management system.
You answer questions about the space's assets (laptops, projectors, cameras, cables and so on), their availability and the user's own requests.

Rules:
- Use only the tools to find information. If the tools return nothing, say the asset does not exist or is not available. Never invent assets, specifications, dates or statuses.
- You cannot change any record. You cannot book, approve, cancel or return anything. To borrow an asset, tell the user to open it and use the Request button.
- Only discuss this system's assets and the user's requests. Politely decline unrelated questions.
- Keep answers clear, structured and friendly. When listing assets, use neat bullet points ('- ') with the asset name in bold (e.g. '- **MacBook Pro 14** – Floor 2, Store Room (Available)'). Clearly mention location and availability status. Keep explanations concise and easy to read.
- Today is ${t}. Work out dates such as "tomorrow" or "next Monday" from this date and write dates as YYYY-MM-DD.

The user is ${user.name}, role ${user.role}.${user.role === C.ROLE.ADMIN
    ? ' As an admin they may see all requests and overdue items.'
    : " They are a member: you can only see their own requests, never other members' details."}`;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const messages = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_HISTORY_CHARS) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}

function buildLinks(answer, seenAssets, availability, user) {
  const text = answer.toLowerCase();
  const links = [];
  for (const [id, name] of seenAssets) {
    if (links.length >= MAX_LINKS) break;
    if (!text.includes(name.toLowerCase())) continue;
    links.push({ label: `View ${name}`, href: `/assets/${id}` });
    const free = availability.get(id);
    if (free && user.role === C.ROLE.MEMBER) {
      links.push({ label: `Request ${name}`, href: `/request/${id}?start=${free.start}&days=${free.days}` });
    }
  }
  return links.slice(0, MAX_LINKS);
}

async function chat(body, user) {
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) throw new ApiError(400, 'Please type a question');
  if (question.length > C.MAX_QUESTION_LENGTH) {
    throw new ApiError(400, `Questions can be at most ${C.MAX_QUESTION_LENGTH} characters`);
  }
  if (!isAIConfigured()) throw new ApiError(503, UNAVAILABLE);
  await assertWithinLimit(user.user_id);

  const system = systemPrompt(user);
  const tools = toolsFor(user);
  const messages = [...cleanHistory(body.history), { role: 'user', content: question }];
  const seenAssets = new Map();
  const availability = new Map();

  let answer = null;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS && answer === null; round++) {
      const response = await createMessage({ system, messages, tools });
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'refusal') {
        answer = 'Sorry, I can only help with questions about the co-working space\'s assets and your requests.';
      } else if (response.stop_reason !== 'tool_use') {
        answer = textOf(response) || 'Sorry, I could not find an answer. Please try asking in a different way.';
      } else {
        const calls = response.content.filter((b) => b.type === 'tool_use');
        const results = await Promise.all(calls.map(async (call) => {
          const { output, content, isError } = await runTool(call.name, call.input, user);
          for (const a of output?.assets || (output?.asset ? [output.asset] : [])) seenAssets.set(a.asset_id, a.name);
          if (call.name === 'check_availability' && output?.available) {
            const days = Math.round((Date.parse(output.end_date) - Date.parse(output.start_date)) / 86400000) + 1;
            if (days >= C.MIN_BORROW_DAYS && days <= C.MAX_BORROW_DAYS) availability.set(output.asset.asset_id, { start: output.start_date, days });
          }
          return { type: 'tool_result', tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) };
        }));
        messages.push({ role: 'user', content: results });
      }
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.warn('[ai/chat] Claude API error:', err.status ?? '', err.message);
      throw new ApiError(503, UNAVAILABLE);
    }
    throw err;
  }
  if (answer === null) answer = 'That needed more lookups than I can do at once. Please ask a simpler or more specific question.';

  const links = buildLinks(answer, seenAssets, availability, user);
  await logChat(user.user_id, FEATURE.ASSISTANT, question, answer);
  return { answer, links };
}

module.exports = { chat };

const db = require('../../config/db');
const C = require('../../config/constants');
const { ApiError, requireFields } = require('../../utils/http');
const { getAvailableAssets } = require('../../services/availability');
const { isAIConfigured, createMessage, textOf, Anthropic } = require('../../services/llm');
const { FEATURE, assertWithinLimit, logChat } = require('./usage');
const { today, isValidDate, addDays } = require('./dates');

const NEAREST_DATE_SEARCH_DAYS = 14;
const MAX_AI_CANDIDATES = 40;
const MAX_PURPOSE_LENGTH = 255;

function validate(body) {
  requireFields(body, ['requirement', 'purpose', 'start_date', 'duration_days']);
  const requirement = String(body.requirement).trim();
  const purpose = String(body.purpose).trim();
  const startDate = String(body.start_date);
  const days = Number(body.duration_days);

  if (!requirement) throw new ApiError(400, 'Please describe what you need');
  if (requirement.length > C.MAX_QUESTION_LENGTH) {
    throw new ApiError(400, `Requirement must be ${C.MAX_QUESTION_LENGTH} characters or fewer`);
  }
  if (!purpose) throw new ApiError(400, 'Please enter the purpose');
  if (purpose.length > MAX_PURPOSE_LENGTH) throw new ApiError(400, `Purpose must be ${MAX_PURPOSE_LENGTH} characters or fewer`);
  if (!isValidDate(startDate)) throw new ApiError(400, 'Start date must be a valid date (YYYY-MM-DD)');
  if (startDate < today()) throw new ApiError(400, 'Start date cannot be in the past');
  if (!Number.isInteger(days) || days < C.MIN_BORROW_DAYS || days > C.MAX_BORROW_DAYS) {
    throw new ApiError(400, `Duration must be a whole number from ${C.MIN_BORROW_DAYS} to ${C.MAX_BORROW_DAYS} days`);
  }
  return { requirement, purpose, startDate, days, endDate: addDays(startDate, days - 1) };
}

const STOP_WORDS = new Set(`a an and are as at be but by can do for from get good have i in into is it its
  like looking me my need needs of on or our please some that the this to use using want we will with would
  day days week weeks month best one any`.split(/\s+/));

const RELATED_WORDS = {
  video: ['video', 'camera', 'editing'], editing: ['editing', 'video'], edit: ['editing'],
  film: ['camera', 'video'], filming: ['camera', 'video', 'tripod'], record: ['camera', 'video'],
  photo: ['camera'], photos: ['camera'], photography: ['camera'], vlog: ['camera', 'video'],
  presentation: ['projector', 'hdmi'], present: ['projector'], presenting: ['projector'],
  slides: ['projector'], meeting: ['projector', 'hdmi'], screen: ['projector', 'hdmi'], display: ['projector', 'hdmi'],
  computer: ['laptop', 'desktop', 'workstation'], pc: ['desktop', 'workstation'], notebook: ['laptop'],
  render: ['rendering', 'workstation', 'rtx'], rendering: ['rendering', 'workstation'], '3d': ['rendering', 'workstation'],
  design: ['rendering', 'workstation', 'laptop'], coding: ['laptop', 'desktop'], programming: ['laptop', 'desktop'],
  office: ['office', 'laptop'], typing: ['office', 'laptop'], browsing: ['browsing', 'laptop'],
  electronics: ['arduino', 'sensors', 'lab'], iot: ['arduino', 'sensors'], robotics: ['arduino', 'sensors'],
  cable: ['cable', 'hdmi', 'adapter'], connect: ['cable', 'adapter', 'hdmi'], adapter: ['adapter', 'usb-c'],
  charger: ['adapter', 'power'], mac: ['macbook'], apple: ['macbook'],
};

const CONDITION_BONUS = { New: 1, Good: 0.5, Fair: 0, Damaged: -1 };
const FIELD_WEIGHT = { category: 3, name: 2, description: 1 };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function words(text) {
  return String(text).toLowerCase().split(/[^a-z0-9+-]+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function buildTerms(requirement, purpose) {
  const terms = [];
  const add = (term, word, weight) => {
    const existing = terms.find((t) => t.term === term);
    if (!existing) terms.push({ term, word, weight });
    else if (weight > existing.weight) Object.assign(existing, { word, weight });
  };
  for (const [text, base] of [[requirement, 1], [purpose, 0.5]]) {
    for (const w of words(text)) {
      add(w, w, base);
      if (w.length > 3 && w.endsWith('s')) add(w.slice(0, -1), w, base);
      for (const related of RELATED_WORDS[w] || []) add(related, w, base * 0.6);
    }
  }
  return terms;
}

function scoreAsset(asset, terms) {
  const fields = { category: asset.category, name: asset.name, description: asset.description || '' };
  let keywordScore = 0;
  const matchedWords = new Set();
  for (const { term, word, weight } of terms) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}`, 'i');
    for (const [field, text] of Object.entries(fields)) {
      if (re.test(text)) {
        keywordScore += FIELD_WEIGHT[field] * weight;
        matchedWords.add(word);
      }
    }
  }
  return { keywordScore, matchedWords: [...matchedWords] };
}

function ruleReason(asset, matchedWords) {
  const quoted = matchedWords.slice(0, 3).map((w) => `"${w}"`).join(', ');
  let detail = (asset.description || '').replace(/\s+/g, ' ').trim();
  if (detail.length > 140) detail = `${detail.slice(0, 137).trimEnd()}...`;
  else if (detail) detail = detail.replace(/\.?$/, '.');
  if (detail) detail = ` ${detail}`;
  return `Matches ${quoted}.${detail} ${asset.condition} condition.`.trim();
}

function rankByRules(requirement, purpose, assets) {
  const terms = buildTerms(requirement, purpose);
  return assets
    .map((asset) => ({ asset, ...scoreAsset(asset, terms) }))
    .filter((s) => s.keywordScore > 0)
    .map((s) => ({ ...s, score: s.keywordScore + (CONDITION_BONUS[s.asset.condition] || 0) }))
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name))
    .map((s) => ({ asset: s.asset, reason: ruleReason(s.asset, s.matchedWords) }));
}

class AIReplyError extends Error {}

const RANKING_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { asset_id: { type: 'integer' }, reason: { type: 'string' } },
        required: ['asset_id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
};

const RANKING_SYSTEM = `You recommend equipment to members of a co-working space.
You are given a member's need and a list of candidate assets that are all free for the member's dates.
Choose up to ${C.MAX_RECOMMENDATIONS} candidates that can meet the need, best first.
Rules:
- Use only asset_id values from the candidate list.
- Judge suitability from the name, category, description and condition only. Do not invent specifications.
- Give each choice one short sentence (at most 25 words) saying why it suits this need, in plain language.
- Prefer better condition when two assets fit equally well.
- If no candidate can reasonably meet the need, return an empty list.`;

async function rankWithAI({ requirement, purpose, startDate, endDate, days }, candidates) {
  let pool = candidates;
  if (pool.length > MAX_AI_CANDIDATES) {
    const relevant = rankByRules(requirement, purpose, pool).map((r) => r.asset);
    const rest = pool.filter((a) => !relevant.includes(a));
    pool = [...relevant, ...rest].slice(0, MAX_AI_CANDIDATES);
  }
  const list = pool.map((a) => ({
    asset_id: a.asset_id, name: a.name, category: a.category, location: a.location,
    condition: a.condition, description: a.description || '',
  }));
  const response = await createMessage({
    system: RANKING_SYSTEM,
    outputFormat: RANKING_SCHEMA,
    maxTokens: 4000,
    retry: false,
    messages: [{
      role: 'user',
      content: `Member's need: ${requirement}\nPurpose: ${purpose}\nDates: ${startDate} to ${endDate} (${days} day${days > 1 ? 's' : ''})\n\nCandidate assets (one JSON object per line):\n${list.map((a) => JSON.stringify(a)).join('\n')}`,
    }],
  });
  if (response.stop_reason === 'refusal') throw new AIReplyError('The AI declined the request');

  let parsed;
  try {
    parsed = JSON.parse(textOf(response));
  } catch {
    throw new AIReplyError(`The AI reply was not valid JSON (stop_reason: ${response.stop_reason})`);
  }
  if (!Array.isArray(parsed?.recommendations)) throw new AIReplyError('The AI reply had no recommendations list');

  const byId = new Map(pool.map((a) => [a.asset_id, a]));
  const seen = new Set();
  const ranked = [];
  for (const r of parsed.recommendations) {
    const asset = byId.get(Number(r.asset_id));
    if (!asset || seen.has(asset.asset_id)) continue;
    seen.add(asset.asset_id);
    ranked.push({ asset, reason: String(r.reason || '').trim().slice(0, 300) || 'Suits the stated need.' });
  }
  return ranked;
}

async function findNearestDate(input, excludeIds) {
  const [all] = await db.query(
    `SELECT a.*, c.name AS category FROM assets a JOIN categories c ON c.category_id = a.category_id
      WHERE a.status <> ?`,
    [C.ASSET_STATUS.RETIRED]
  );
  if (!rankByRules(input.requirement, input.purpose, all).length) return { anyMatch: false, nearest: null };

  for (let i = 1; i <= NEAREST_DATE_SEARCH_DAYS; i++) {
    const start = addDays(input.startDate, i);
    const free = await getAvailableAssets(start, addDays(start, input.days - 1));
    const matches = rankByRules(input.requirement, input.purpose, free.filter((a) => !excludeIds.has(a.asset_id)));
    if (matches.length) return { anyMatch: true, nearest: start };
  }
  return { anyMatch: true, nearest: null };
}

const publicAsset = (a) => ({
  asset_id: a.asset_id, asset_tag: a.asset_tag, name: a.name, category: a.category, location: a.location,
  condition: a.condition, description: a.description, image_path: a.image_path,
});

async function recommend(body, user) {
  const input = validate(body);
  await assertWithinLimit(user.user_id);

  const candidates = await getAvailableAssets(input.startDate, input.endDate);
  let source = 'rules';
  let ranked = null;
  if (candidates.length && isAIConfigured()) {
    try {
      ranked = await rankWithAI(input, candidates);
      source = 'ai';
    } catch (err) {
      if (!(err instanceof Anthropic.APIError) && !(err instanceof AIReplyError)) throw err;
      console.warn('[ai/recommend] AI ranking failed, using rule-based ranking:', err.message);
    }
  }
  if (!ranked) ranked = rankByRules(input.requirement, input.purpose, candidates);
  ranked = ranked.slice(0, C.MAX_RECOMMENDATIONS);

  const result = {
    source,
    start_date: input.startDate,
    end_date: input.endDate,
    duration_days: input.days,
    recommendations: ranked.map((r, i) => ({ rank: i + 1, reason: r.reason, asset: publicAsset(r.asset) })),
  };

  if (!ranked.length) {
    const { anyMatch, nearest } = await findNearestDate(input, new Set(candidates.map((a) => a.asset_id)));
    result.nearest_date = nearest;
    if (nearest) {
      result.message = `No suitable asset is free from ${input.startDate} to ${input.endDate}. The nearest start date with a suitable asset is ${nearest}.`;
    } else if (anyMatch) {
      result.message = `The assets that suit this need are booked, borrowed or under maintenance for the next ${NEAREST_DATE_SEARCH_DAYS} days. Please try later dates.`;
    } else {
      result.message = 'The space has no asset that matches this need. Try describing it in other words, or browse the catalogue.';
    }
  }

  await logChat(
    user.user_id,
    FEATURE.RECOMMENDATION,
    `Need: ${input.requirement}\nPurpose: ${input.purpose}\nDates: ${input.startDate} to ${input.endDate} (${input.days} days)`,
    JSON.stringify({
      source,
      recommendations: result.recommendations.map((r) => ({ asset_id: r.asset.asset_id, name: r.asset.name, reason: r.reason })),
      ...(result.message ? { message: result.message } : {}),
    })
  );
  return result;
}

module.exports = { recommend, rankByRules };

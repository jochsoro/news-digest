/**
 * Résumé : transforme les articles d'une région (tous thèmes) en blocs de
 * 3–4 phrases. Un seul appel LLM par région — c'est ce qui rend le palier
 * gratuit suffisant (~30 appels/jour).
 *
 * Repli extractif OBLIGATOIRE : si la clé manque, si le quota saute ou si
 * la réponse est inexploitable, on assemble titre + chapô des meilleurs
 * articles. L'édition sort toujours.
 */
import { log, sleep } from './util.mjs';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
/** Pause entre deux appels : reste sous les limites par minute du palier gratuit. */
const PACE_MS = Number(process.env.GEMINI_PACE_MS || 4500);

const CATEGORY_LABELS = {
  general: 'À la une',
  world: 'International',
  geopolitics: 'Géopolitique',
  business: 'Économie',
  technology: 'Tech',
  science: 'Science',
  discovery: 'Découvertes',
  health: 'Santé',
  sports: 'Sport',
  environment: 'Environnement',
  culture: 'Culture',
  entertainment: 'Divertissement',
};

/**
 * @param {string} regionName
 * @param {Map<string, Article[]>} perCategory
 * @returns {Promise<Map<string, {summary: string, method: 'llm'|'extractive'}>>}
 */
export async function summarizeRegion(regionName, perCategory) {
  const extractive = new Map();
  for (const [cat, items] of perCategory) extractive.set(cat, { summary: extractiveSummary(items), method: 'extractive' });

  if (!GEMINI_KEY) {
    log(`  (pas de GEMINI_API_KEY : résumé extractif pour ${regionName})`);
    return extractive;
  }

  try {
    const llm = await callGemini(regionName, perCategory);
    // Fusion : on ne garde le LLM que là où il a répondu proprement.
    const out = new Map(extractive);
    for (const [cat, text] of llm) {
      if (text && text.length >= 60 && perCategory.has(cat)) out.set(cat, { summary: text, method: 'llm' });
    }
    await sleep(PACE_MS);
    return out;
  } catch (e) {
    log(`  ! Gemini a échoué pour ${regionName} : ${String(e?.message ?? e).slice(0, 160)} → repli extractif`);
    return extractive;
  }
}

// ---------- repli extractif ----------

/** Première phrase du meilleur article en manchette, puis le chapô suivant. */
export function extractiveSummary(items) {
  const parts = [];
  for (const a of items.slice(0, 3)) {
    const lead = firstSentence(a.title);
    const body = a.summary && !sameStart(a.summary, a.title) ? firstSentence(a.summary) : '';
    const sentence = body ? `${ensureDot(lead)} ${ensureDot(body)}` : ensureDot(lead);
    parts.push(sentence);
    if (parts.join(' ').length > 420) break;
  }
  return parts.join(' ').trim();
}

function firstSentence(t) {
  const s = String(t ?? '').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  return (m ? m[1] : s).trim();
}

function ensureDot(s) {
  return /[.!?…]$/.test(s) ? s : s + '.';
}

function sameStart(a, b) {
  return a.slice(0, 40).toLowerCase() === b.slice(0, 40).toLowerCase();
}

// ---------- Gemini ----------

async function callGemini(regionName, perCategory) {
  const sections = [];
  for (const [cat, items] of perCategory) {
    const lines = items.map((a, i) => `  ${i + 1}. [${a.source}] ${a.title}${a.summary ? ` — ${a.summary.slice(0, 260)}` : ''}`);
    sections.push(`## ${cat} (${CATEGORY_LABELS[cat] ?? cat})\n${lines.join('\n')}`);
  }

  const prompt = [
    `Tu rédiges le digest quotidien d'actualités pour « ${regionName} », en français, pour un lecteur pressé qui lit sur son téléphone le matin.`,
    `Pour CHAQUE thème ci-dessous, écris un résumé de 3 à 4 phrases courtes, factuelles, au présent, sans opinion ni superlatif, qui synthétise les articles fournis (pas un par un : une vue d'ensemble).`,
    `La PREMIÈRE phrase doit être une manchette autonome et concrète (sujet + fait), car elle sera affichée en gros titre. Pas de « Dans l'actualité… », pas de formule creuse.`,
    `N'invente aucun fait absent des articles. Si un thème n'a qu'un article maigre, fais 2 phrases.`,
    `Réponds UNIQUEMENT en JSON : {"blocks":[{"category":"<id du thème>","summary":"<texte>"}]} avec exactement les ids de thème donnés.`,
    '',
    sections.join('\n\n'),
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            blocks: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: { category: { type: 'STRING' }, summary: { type: 'STRING' } },
                required: ['category', 'summary'],
              },
            },
          },
          required: ['blocks'],
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  const parsed = JSON.parse(text);
  const out = new Map();
  for (const b of parsed.blocks ?? []) {
    if (typeof b.category === 'string' && typeof b.summary === 'string') out.set(b.category, b.summary.trim());
  }
  return out;
}

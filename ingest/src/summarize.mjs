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

/** Modèle imposé (variable GitHub GEMINI_MODEL) ; vide = choisi automatiquement. */
const GEMINI_MODEL_PREF = (process.env.GEMINI_MODEL || '').trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * État de Gemini pour CE run : modèles candidats (découverts une fois) et
 * coupe-circuit. Une erreur définitive (modèle retiré, clé refusée, quota
 * épuisé) coupe l'IA pour le reste du run : on ne martèle pas l'API 25 fois.
 */
const gemini = {
  candidates: /** @type {string[] | null} */ (null),
  model: /** @type {string | null} */ (null),
  disabled: false,
  reason: '',
};
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
  if (gemini.disabled) return extractive;

  try {
    const llm = await callGeminiWithFallback(regionName, perCategory);
    // Fusion : on ne garde le LLM que là où il a répondu proprement.
    const out = new Map(extractive);
    for (const [cat, text] of llm) {
      if (text && text.length >= 60 && perCategory.has(cat)) out.set(cat, { summary: text, method: 'llm' });
    }
    await sleep(PACE_MS);
    return out;
  } catch (e) {
    const msg = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 160);
    if (e?.fatal) {
      gemini.disabled = true;
      gemini.reason = msg;
      log(`  ! Gemini coupé pour ce run (${msg}) → résumé extractif pour toutes les régions`);
    } else {
      log(`  ! Gemini a échoué pour ${regionName} : ${msg} → repli extractif`);
    }
    return extractive;
  }
}

/** Pour le récapitulatif de fin de run. */
export function geminiStatus() {
  if (!GEMINI_KEY) return 'pas de clé';
  if (gemini.disabled) return `coupé : ${gemini.reason}`;
  return gemini.model ?? 'non utilisé';
}

// ---------- choix du modèle ----------

/**
 * Liste les modèles accessibles à CETTE clé et les classe : Flash stable le
 * plus récent d'abord, puis préversions, puis « lite ». Google retire
 * régulièrement des modèles aux nouveaux comptes : aucun nom n'est figé ici.
 */
async function discoverModels() {
  const res = await fetch(`${API}/models?pageSize=200&key=${GEMINI_KEY}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw fatalError(`liste des modèles : HTTP ${res.status}`);
  const data = await res.json();
  const EXCLUDE = /(image|tts|audio|live|embed|vision|thinking-exp|-exp|learnlm|gemma|aqa|computer-use|robotics)/i;
  const ranked = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => String(m.name).replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini') && n.includes('flash') && !EXCLUDE.test(n))
    .map((n) => {
      const version = Number((/gemini-(\d+(?:\.\d+)?)/.exec(n) ?? [])[1] ?? 0);
      const preview = /preview/.test(n);
      const lite = /lite/.test(n);
      const pinned = /-\d{3}$|-\d{2}-\d{4}$/.test(n); // variante datée : on préfère l'alias
      // Clé de tri : stable > préversion, normal > lite, version la plus haute, alias > daté.
      return { n, key: [preview ? 0 : 1, lite ? 0 : 1, version, pinned ? 0 : 1] };
    })
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
      return a.n.localeCompare(b.n);
    })
    .map((x) => x.n);
  if (!ranked.length) throw fatalError('aucun modèle Flash disponible pour cette clé');
  return ranked;
}

async function candidateModels() {
  if (gemini.candidates) return gemini.candidates;
  const discovered = await discoverModels();
  gemini.candidates = GEMINI_MODEL_PREF
    ? [GEMINI_MODEL_PREF, ...discovered.filter((m) => m !== GEMINI_MODEL_PREF)]
    : discovered;
  log(`  Gemini : modèles candidats ${gemini.candidates.slice(0, 4).join(', ')}${gemini.candidates.length > 4 ? '…' : ''}`);
  return gemini.candidates;
}

/** Essaie le modèle retenu ; s'il a été retiré, passe au suivant et s'en souvient. */
async function callGeminiWithFallback(regionName, perCategory) {
  const models = gemini.model ? [gemini.model] : (await candidateModels()).slice(0, 4);
  let lastError;
  for (const model of models) {
    try {
      const out = await callGemini(model, regionName, perCategory);
      if (gemini.model !== model) {
        gemini.model = model;
        log(`  Gemini : modèle retenu « ${model} »`);
      }
      return out;
    } catch (e) {
      lastError = e;
      if (e?.status === 404 || e?.status === 400) continue; // modèle indisponible : suivant
      throw e;
    }
  }
  throw Object.assign(lastError ?? new Error('aucun modèle utilisable'), { fatal: true });
}

function fatalError(message) {
  return Object.assign(new Error(message), { fatal: true });
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

async function callGemini(model, regionName, perCategory) {
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

  const url = `${API}/models/${model}:generateContent?key=${GEMINI_KEY}`;
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
    let detail = body;
    try { detail = JSON.parse(body)?.error?.message ?? body; } catch { /* corps non JSON */ }
    const err = new Error(`HTTP ${res.status} ${String(detail).slice(0, 160)}`);
    err.status = res.status;
    // Clé refusée ou quota épuisé : inutile d'insister sur les autres régions.
    if (res.status === 401 || res.status === 403 || res.status === 429) err.fatal = true;
    throw err;
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

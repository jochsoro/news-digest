import { CategoryId } from '../models/category.model';
import { SummaryBlock, ArticleRef } from '../models/article.model';
import { Digest } from '../models/digest.model';

/**
 * Fabrique de digests de démonstration. Simule ce que renverrait le backend :
 * pour une région donnée, un ensemble de blocs résumés par thème.
 * En production, ces blocs viennent de la génération LLM quotidienne.
 *
 * Le contenu est volontairement générique mais plausible, et déterministe
 * par (regionId + date + category) grâce à un petit hash, pour que le même
 * digest réapparaisse tant qu'on ne change pas de jour.
 */

interface Template {
  summary: (region: string) => string;
  sources: ArticleRef[];
}

const TEMPLATES: Partial<Record<CategoryId, Template[]>> = {
  general: [
    {
      summary: (r) =>
        `Les principaux titres du jour ${r} sont dominés par l'actualité institutionnelle. ` +
        `Plusieurs annonces gouvernementales sont attendues cette semaine, dans un contexte social tendu. ` +
        `Les analystes soulignent une mobilisation inhabituelle de l'opinion.`,
      sources: [
        { title: 'Le point sur les annonces attendues', url: 'https://example.com/a1', source: 'Agence Régionale' },
        { title: 'Ce qu\'il faut retenir de la semaine', url: 'https://example.com/a2', source: 'Quotidien du Jour' },
      ],
    },
  ],
  geopolitics: [
    {
      summary: (r) =>
        `Sur le plan diplomatique, ${r} poursuit des négociations bilatérales sur les accords commerciaux régionaux. ` +
        `Des tensions frontalières restent surveillées par les observateurs internationaux. ` +
        `Un sommet est évoqué pour le trimestre prochain.`,
      sources: [
        { title: 'Reprise des négociations commerciales', url: 'https://example.com/g1', source: 'Desk International' },
      ],
    },
  ],
  business: [
    {
      summary: (r) =>
        `L'activité économique ${r} montre des signes de reprise, portée par les services et le numérique. ` +
        `L'inflation ralentit légèrement, mais le pouvoir d'achat reste au cœur des préoccupations. ` +
        `Les marchés réagissent prudemment aux dernières données.`,
      sources: [
        { title: 'Reprise portée par les services', url: 'https://example.com/b1', source: 'Éco & Finance' },
        { title: 'Inflation : le détail des chiffres', url: 'https://example.com/b2', source: 'Bourse Info' },
      ],
    },
  ],
  technology: [
    {
      summary: (r) =>
        `Côté tech, l'écosystème ${r} voit émerger plusieurs levées de fonds dans l'IA appliquée et la fintech. ` +
        `Les débats sur la régulation des données s'intensifient. ` +
        `Une start-up locale annonce une expansion à l'international.`,
      sources: [
        { title: "Levées de fonds record dans l'IA", url: 'https://example.com/t1', source: 'TechDaily' },
      ],
    },
  ],
  science: [
    {
      summary: (r) =>
        `En science, des équipes de recherche ${r} publient des travaux sur les matériaux à basse consommation d'énergie. ` +
        `Une collaboration universitaire internationale est annoncée. ` +
        `Les applications médicales suscitent un intérêt particulier.`,
      sources: [
        { title: 'Percée sur les matériaux basse consommation', url: 'https://example.com/s1', source: 'Revue Science' },
      ],
    },
  ],
  discovery: [
    {
      summary: (r) =>
        `Au rayon découvertes, une campagne de fouilles ${r} met au jour des vestiges inattendus. ` +
        `Des chercheurs documentent une espèce jusqu'ici non répertoriée dans la région. ` +
        `Les premières conclusions seront présentées lors d'un colloque.`,
      sources: [
        { title: 'Des vestiges inattendus exhumés', url: 'https://example.com/d1', source: 'Explorations' },
      ],
    },
  ],
  health: [
    {
      summary: (r) =>
        `En santé, les autorités ${r} lancent une campagne de prévention saisonnière. ` +
        `L'accès aux soins en zone rurale fait l'objet d'un nouveau plan. ` +
        `Les professionnels alertent sur les tensions de personnel.`,
      sources: [
        { title: 'Nouvelle campagne de prévention', url: 'https://example.com/h1', source: 'Santé Publique' },
      ],
    },
  ],
  sports: [
    {
      summary: (r) =>
        `Côté sport, les sélections ${r} préparent les prochaines échéances continentales. ` +
        `Un transfert majeur anime les discussions des supporters. ` +
        `Les résultats du week-end rebattent les cartes du championnat.`,
      sources: [
        { title: 'Les sélections en préparation', url: 'https://example.com/sp1', source: 'Sport Hebdo' },
        { title: 'Le transfert qui fait parler', url: 'https://example.com/sp2', source: 'Terrain' },
      ],
    },
  ],
  environment: [
    {
      summary: (r) =>
        `Sur l'environnement, ${r} dévoile des mesures d'adaptation face aux épisodes climatiques extrêmes. ` +
        `La question de la gestion de l'eau devient prioritaire. ` +
        `Des projets d'énergies renouvelables sont mis en avant.`,
      sources: [
        { title: "Plan d'adaptation climatique", url: 'https://example.com/e1', source: 'Planète' },
      ],
    },
  ],
  culture: [
    {
      summary: (r) =>
        `En culture, la scène ${r} s'anime avec plusieurs festivals et expositions. ` +
        `Un artiste local connaît une reconnaissance internationale. ` +
        `Le secteur réclame un soutien renforcé au financement.`,
      sources: [
        { title: 'Une saison culturelle dense', url: 'https://example.com/c1', source: 'Scènes' },
      ],
    },
  ],
  world: [
    {
      summary: () =>
        `À l'international, les regards se portent sur les prochaines échéances multilatérales. ` +
        `Les crises régionales continuent d'influencer les équilibres mondiaux. ` +
        `L'agenda climatique et économique domine les discussions.`,
      sources: [
        { title: 'Agenda multilatéral chargé', url: 'https://example.com/w1', source: 'Monde Diplo' },
      ],
    },
  ],
  entertainment: [
    {
      summary: (r) =>
        `Côté divertissement, les sorties ${r} rythment l'actualité des plateformes et des salles. ` +
        `Un événement grand public attire l'attention médiatique. ` +
        `Les audiences confirment l'engouement du moment.`,
      sources: [
        { title: 'Les sorties de la semaine', url: 'https://example.com/en1', source: 'Loisirs Mag' },
      ],
    },
  ],
};

/**
 * Visuels de démonstration. En production, l'image vient de l'article source
 * (champ `urlToImage` chez NewsAPI, `image` chez GNews, `<media:content>` en
 * RSS) et le backend la retaille / met en cache ; ici on pointe un service
 * d'images publiques avec une graine stable par thème.
 *
 * Volontairement incomplet : les thèmes absents exercent le repli en couleurs,
 * car beaucoup d'articles réels n'ont pas d'image exploitable.
 */
const IMAGES: Partial<Record<CategoryId, { url: string; credit: string }>> = {
  general: { url: 'https://picsum.photos/seed/nd-general/1200/1800', credit: 'Photo d’illustration' },
  sports: { url: 'https://picsum.photos/seed/nd-sports/1200/1800', credit: 'Photo d’illustration' },
  science: { url: 'https://picsum.photos/seed/nd-science/1200/1800', credit: 'Photo d’illustration' },
  environment: { url: 'https://picsum.photos/seed/nd-environment/1200/1800', credit: 'Photo d’illustration' },
  culture: { url: 'https://picsum.photos/seed/nd-culture/1200/1800', credit: 'Photo d’illustration' },
  discovery: { url: 'https://picsum.photos/seed/nd-discovery/1200/1800', credit: 'Photo d’illustration' },
  business: { url: 'https://picsum.photos/seed/nd-business/1200/1800', credit: 'Photo d’illustration' },
  world: { url: 'https://picsum.photos/seed/nd-world/1200/1800', credit: 'Photo d’illustration' },
};

/** Hash déterministe simple (chaîne → entier positif). */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Tournure grammaticale selon le niveau de région, pour un texte naturel. */
function regionPhrase(regionName: string, isWorld: boolean): string {
  return isWorld ? 'au niveau mondial' : `en/à ${regionName}`;
}

/**
 * Génère un digest complet pour une région et une date.
 * @param regionId identifiant de la région
 * @param regionName libellé affichable (pour le texte)
 * @param isWorld vrai si c'est le niveau monde
 * @param date YYYY-MM-DD
 */
export function buildMockDigest(
  regionId: string,
  regionName: string,
  isWorld: boolean,
  date: string,
): Digest {
  const phrase = regionPhrase(regionName, isWorld);
  const blocks: SummaryBlock[] = (Object.keys(TEMPLATES) as CategoryId[]).map((cat) => {
    const templates = TEMPLATES[cat]!;
    const seed = hash(`${regionId}|${cat}|${date}`);
    const tpl = templates[seed % templates.length];
    return {
      category: cat,
      summary: tpl.summary(phrase),
      sources: tpl.sources,
      // Salience pseudo-aléatoire mais stable, 0.4–1.0
      salience: 0.4 + (seed % 60) / 100,
      image: IMAGES[cat],
    };
  });

  return {
    regionId,
    date,
    blocks,
    generatedAt: new Date().toISOString(),
  };
}

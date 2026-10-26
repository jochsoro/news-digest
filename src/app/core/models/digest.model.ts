import { SummaryBlock } from './article.model';

/**
 * Digest mutualisé pour une combinaison (région, date).
 * Contient un bloc de résumé par thème couvert. On génère UN digest par
 * combinaison région+date, pas un par utilisateur : la personnalisation
 * se fait ensuite en réordonnant/filtrant ces blocs selon le profil.
 */
export interface Digest {
  regionId: string;
  /** Date du jour couverte, format YYYY-MM-DD. */
  date: string;
  blocks: SummaryBlock[];
  /** Horodatage de génération (ISO 8601). */
  generatedAt: string;
}

/**
 * Digest effectivement présenté à l'utilisateur : blocs filtrés sur ses
 * thèmes et réordonnés par la couche de personnalisation.
 */
export interface PersonalizedDigest extends Digest {
  /** Ordre appliqué + score de pertinence par bloc, pour transparence/debug. */
  personalized: true;
}

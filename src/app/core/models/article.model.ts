import { CategoryId } from './category.model';

/**
 * Article brut tel que récupéré d'une source (API d'actus ou flux RSS),
 * avant résumé. On ne stocke jamais le corps complet pour rester dans le
 * cadre du droit d'auteur : titre, chapô, lien vers la source.
 */
export interface Article {
  id: string;
  title: string;
  /** Chapô / description courte fournie par la source. */
  summary: string;
  url: string;
  source: string;
  /** ISO 8601. */
  publishedAt: string;
  imageUrl?: string;
  category: CategoryId;
  /** id de la région la plus précise à laquelle l'article se rattache. */
  regionId: string;
  /** Langue de l'article (ISO 639-1). */
  lang: string;
}

/**
 * Bloc de résumé produit par le LLM pour un couple (région, thème).
 * C'est l'unité mutualisée : générée une fois par jour, partagée entre
 * tous les utilisateurs qui ont cette combinaison dans leurs filtres.
 */
export interface SummaryBlock {
  category: CategoryId;
  /** 3-4 phrases de synthèse, rédigées par le LLM. */
  summary: string;
  /** Articles sources ayant nourri le résumé (pour les liens "lire l'article"). */
  sources: ArticleRef[];
  /** Score d'importance 0-1, sert au tri et à la personnalisation. */
  salience: number;
  /**
   * Visuel de fond : la meilleure image parmi les articles sources (celle de
   * l'article principal en général). Absente si aucune source n'en fournit —
   * l'écran retombe alors sur les couleurs du thème.
   */
  image?: ArticleImage;
}

export interface ArticleImage {
  url: string;
  /** Crédit à afficher discrètement (obligation usuelle des fournisseurs). */
  credit?: string;
}

export interface ArticleRef {
  title: string;
  url: string;
  source: string;
  /** Vignette fournie par la source, quand il y en a une. */
  imageUrl?: string;
}

/**
 * Thèmes de contenu. L'id reste en anglais (aligné sur les catégories
 * des APIs d'actus type NewsAPI/GNews : sport, health, science, technology…)
 * pour mapper directement, le label reste en français pour l'affichage.
 */
export interface Category {
  id: CategoryId;
  label: string;
  /** Emoji / pictogramme. */
  icon: string;
  /** Couleur d'accent (token CSS) pour différencier les thèmes dans l'UI. */
  color: string;
}

export type CategoryId =
  | 'general'
  | 'world'
  | 'sports'
  | 'health'
  | 'science'
  | 'discovery'
  | 'technology'
  | 'business'
  | 'entertainment'
  | 'geopolitics'
  | 'environment'
  | 'culture';

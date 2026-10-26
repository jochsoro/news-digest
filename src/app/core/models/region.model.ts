/**
 * Hiérarchie géographique : Monde → Continent → Pays → Ville.
 * Chaque niveau référence son parent, ce qui permet de "remonter" la chaîne
 * (une ville appartient à un pays, qui appartient à un continent, etc.)
 * et d'agréger les actus d'un niveau en combinant ses enfants.
 */
export type RegionLevel = 'world' | 'continent' | 'country' | 'city';

export interface Region {
  /** Identifiant stable, utilisé comme clé de cache des digests. Ex: 'fr', 'fr-paris', 'africa'. */
  id: string;
  /** Libellé affiché. */
  name: string;
  level: RegionLevel;
  /** id du parent dans la hiérarchie (null pour le niveau monde). */
  parentId: string | null;
  /** Code ISO pays (2 lettres) quand pertinent — sert aux APIs d'actus. */
  countryCode?: string;
  /** Emoji drapeau / pictogramme pour l'UI. */
  flag?: string;
}

/**
 * Chemin complet d'une région, du niveau monde jusqu'à la région sélectionnée.
 * Sert au fil d'Ariane de l'UI et à la clé de digest.
 */
export type RegionPath = Region[];

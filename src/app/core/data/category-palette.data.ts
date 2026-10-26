import { CategoryId } from '../models/category.model';

/**
 * Palette immersive par thème : deux teintes vives pour les formes de fond
 * du feed plein écran, et une teinte « chip » lisible sur fond sombre.
 * Les contrastes texte blanc / fond sont assurés par le voile sombre
 * appliqué par-dessus (voir news-card).
 */
export interface CategoryPalette {
  a: string;
  b: string;
  chip: string;
  chipInk: string;
}

export const CATEGORY_PALETTE: Record<CategoryId, CategoryPalette> = {
  general:       { a: '#f2f2f5', b: '#9aa0ad', chip: '#f2f2f5', chipInk: '#101217' },
  world:         { a: '#2f80ed', b: '#56ccf2', chip: '#56ccf2', chipInk: '#07202b' },
  geopolitics:   { a: '#7b61ff', b: '#b388ff', chip: '#b388ff', chipInk: '#1b0f3a' },
  business:      { a: '#12b886', b: '#63e6be', chip: '#63e6be', chipInk: '#06291e' },
  technology:    { a: '#2563eb', b: '#60a5fa', chip: '#60a5fa', chipInk: '#07193a' },
  science:       { a: '#0ea5b7', b: '#5eead4', chip: '#5eead4', chipInk: '#062a2a' },
  discovery:     { a: '#f08c00', b: '#ffd43b', chip: '#ffd43b', chipInk: '#2d1d00' },
  health:        { a: '#e8456b', b: '#ff8fa3', chip: '#ff8fa3', chipInk: '#3a0a16' },
  sports:        { a: '#ff5a3c', b: '#ff8f3c', chip: '#ff8f3c', chipInk: '#2a0d04' },
  environment:   { a: '#40c057', b: '#a9e34b', chip: '#a9e34b', chipInk: '#13300a' },
  culture:       { a: '#d6336c', b: '#f783ac', chip: '#f783ac', chipInk: '#3b0a1f' },
  entertainment: { a: '#f76707', b: '#ffa94d', chip: '#ffa94d', chipInk: '#2f1300' },
};

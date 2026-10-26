import { CategoryId } from './category.model';

export type DigestLength = 'short' | 'standard' | 'detailed';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type AccentId = 'electric' | 'forest' | 'magenta' | 'sun';
export type TextSize = 's' | 'm' | 'l';

/**
 * Choix explicites de l'utilisateur, persistés localement (Capacitor Preferences).
 */
export interface UserPreferences {
  /** id de la région active (celle dont on lit le digest). */
  activeRegionId: string;
  /** Thèmes cochés. Vide = tous. */
  selectedCategories: CategoryId[];
  /** Langue de lecture préférée (ISO 639-1). */
  language: string;
  /** Heure de réception du digest quotidien, format HH:mm (24h). */
  digestTime: string;
  /** Longueur de résumé voulue. */
  digestLength: DigestLength;
  /** Notification quotidienne activée. */
  notificationsEnabled: boolean;

  // ---- Apparence ----
  theme: ThemeMode;
  accent: AccentId;
  textSize: TextSize;
  /** Vibration légère sur les interactions (natif uniquement). */
  haptics: boolean;

  // ---- Profil ----
  /** Prénom ou pseudo affiché. Vide = « Lecteur ». */
  displayName: string;
}

/**
 * Signaux implicites accumulés par l'usage, pour la pondération.
 * Jamais envoyés tels quels à un tiers — restent sur l'appareil.
 */
export interface EngagementSignals {
  opensByCategory: Partial<Record<CategoryId, number>>;
  savesByCategory: Partial<Record<CategoryId, number>>;
  sharesByCategory: Partial<Record<CategoryId, number>>;
  dismissed: string[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  activeRegionId: 'world',
  selectedCategories: [],
  language: 'fr',
  digestTime: '07:30',
  digestLength: 'standard',
  notificationsEnabled: true,
  theme: 'auto',
  accent: 'electric',
  textSize: 'm',
  haptics: true,
  displayName: '',
};

export const EMPTY_SIGNALS: EngagementSignals = {
  opensByCategory: {},
  savesByCategory: {},
  sharesByCategory: {},
  dismissed: [],
};

/** Palette d'accents proposée. Les valeurs dark sont légèrement éclaircies. */
export const ACCENTS: { id: AccentId; label: string; light: string; dark: string }[] = [
  { id: 'electric', label: 'Électrique', light: '#2e5bff', dark: '#5b7fff' },
  { id: 'forest', label: 'Forêt', light: '#13835a', dark: '#2fb47f' },
  { id: 'magenta', label: 'Magenta', light: '#c6248f', dark: '#e34fb0' },
  { id: 'sun', label: 'Soleil', light: '#d4780b', dark: '#f2a135' },
];

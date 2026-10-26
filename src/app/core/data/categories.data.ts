import { Category } from '../models/category.model';

export const CATEGORIES: Category[] = [
  { id: 'general', label: 'À la une', icon: '📰', color: 'var(--cat-general)' },
  { id: 'world', label: 'International', icon: '🌐', color: 'var(--cat-world)' },
  { id: 'geopolitics', label: 'Géopolitique', icon: '⚖️', color: 'var(--cat-geopolitics)' },
  { id: 'business', label: 'Économie', icon: '📈', color: 'var(--cat-business)' },
  { id: 'technology', label: 'Tech', icon: '💻', color: 'var(--cat-technology)' },
  { id: 'science', label: 'Science', icon: '🔬', color: 'var(--cat-science)' },
  { id: 'discovery', label: 'Découvertes', icon: '🧭', color: 'var(--cat-discovery)' },
  { id: 'health', label: 'Santé', icon: '🩺', color: 'var(--cat-health)' },
  { id: 'sports', label: 'Sport', icon: '⚽', color: 'var(--cat-sports)' },
  { id: 'environment', label: 'Environnement', icon: '🌱', color: 'var(--cat-environment)' },
  { id: 'culture', label: 'Culture', icon: '🎭', color: 'var(--cat-culture)' },
  { id: 'entertainment', label: 'Divertissement', icon: '🎬', color: 'var(--cat-entertainment)' },
];

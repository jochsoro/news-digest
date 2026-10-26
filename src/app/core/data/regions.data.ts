import { Region } from '../models/region.model';

/**
 * Taxonomie géographique de démonstration. En production, cette arborescence
 * serait servie par le backend (ou un fichier statique versionné) et bien plus
 * fournie. On garde ici un échantillon représentatif par continent, avec
 * quelques villes, suffisant pour exercer toute la hiérarchie dans l'UI.
 */
export const REGIONS: Region[] = [
  // Niveau monde (racine)
  { id: 'world', name: 'Monde', level: 'world', parentId: null, flag: '🌍' },

  // Continents
  { id: 'africa', name: 'Afrique', level: 'continent', parentId: 'world', flag: '🌍' },
  { id: 'europe', name: 'Europe', level: 'continent', parentId: 'world', flag: '🌍' },
  { id: 'americas', name: 'Amériques', level: 'continent', parentId: 'world', flag: '🌎' },
  { id: 'asia', name: 'Asie', level: 'continent', parentId: 'world', flag: '🌏' },
  { id: 'oceania', name: 'Océanie', level: 'continent', parentId: 'world', flag: '🌏' },

  // Afrique — pays
  { id: 'ci', name: "Côte d'Ivoire", level: 'country', parentId: 'africa', countryCode: 'CI', flag: '🇨🇮' },
  { id: 'sn', name: 'Sénégal', level: 'country', parentId: 'africa', countryCode: 'SN', flag: '🇸🇳' },
  { id: 'ng', name: 'Nigéria', level: 'country', parentId: 'africa', countryCode: 'NG', flag: '🇳🇬' },
  { id: 'ma', name: 'Maroc', level: 'country', parentId: 'africa', countryCode: 'MA', flag: '🇲🇦' },
  // Côte d'Ivoire — villes
  { id: 'ci-abidjan', name: 'Abidjan', level: 'city', parentId: 'ci', countryCode: 'CI', flag: '🏙️' },
  { id: 'ci-yamoussoukro', name: 'Yamoussoukro', level: 'city', parentId: 'ci', countryCode: 'CI', flag: '🏙️' },
  { id: 'ci-bouake', name: 'Bouaké', level: 'city', parentId: 'ci', countryCode: 'CI', flag: '🏙️' },

  // Europe — pays
  { id: 'fr', name: 'France', level: 'country', parentId: 'europe', countryCode: 'FR', flag: '🇫🇷' },
  { id: 'gb', name: 'Royaume-Uni', level: 'country', parentId: 'europe', countryCode: 'GB', flag: '🇬🇧' },
  { id: 'de', name: 'Allemagne', level: 'country', parentId: 'europe', countryCode: 'DE', flag: '🇩🇪' },
  { id: 'es', name: 'Espagne', level: 'country', parentId: 'europe', countryCode: 'ES', flag: '🇪🇸' },
  // France — villes
  { id: 'fr-paris', name: 'Paris', level: 'city', parentId: 'fr', countryCode: 'FR', flag: '🏙️' },
  { id: 'fr-lyon', name: 'Lyon', level: 'city', parentId: 'fr', countryCode: 'FR', flag: '🏙️' },
  { id: 'fr-rennes', name: 'Rennes', level: 'city', parentId: 'fr', countryCode: 'FR', flag: '🏙️' },

  // Amériques — pays
  { id: 'us', name: 'États-Unis', level: 'country', parentId: 'americas', countryCode: 'US', flag: '🇺🇸' },
  { id: 'br', name: 'Brésil', level: 'country', parentId: 'americas', countryCode: 'BR', flag: '🇧🇷' },
  { id: 'ca', name: 'Canada', level: 'country', parentId: 'americas', countryCode: 'CA', flag: '🇨🇦' },

  // Asie — pays
  { id: 'cn', name: 'Chine', level: 'country', parentId: 'asia', countryCode: 'CN', flag: '🇨🇳' },
  { id: 'jp', name: 'Japon', level: 'country', parentId: 'asia', countryCode: 'JP', flag: '🇯🇵' },
  { id: 'in', name: 'Inde', level: 'country', parentId: 'asia', countryCode: 'IN', flag: '🇮🇳' },

  // Océanie — pays
  { id: 'au', name: 'Australie', level: 'country', parentId: 'oceania', countryCode: 'AU', flag: '🇦🇺' },
];

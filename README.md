# News Digest

Prototype d'app mobile de **digest quotidien d'actualités**, filtrable par
région (Monde → Continent → Pays → Ville) et par thème (sport, santé, science,
découvertes, tech, économie…), avec une couche de personnalisation par profil.

**Stack :** Angular 22 (standalone + signals) · Capacitor 8 · SCSS · TypeScript strict.

---

## Démarrer

```bash
npm install
npm start            # dev server web sur http://localhost:4200
```

## Build web

```bash
npm run build        # sortie dans dist/news-digest/browser
```

## Mobile (Capacitor)

Les dossiers natifs ne sont pas versionnés : on les génère sur sa machine
(Android Studio / Xcode requis).

```bash
npm run build
npx cap add android          # et/ou : npx cap add ios
npx cap sync
npx cap open android         # ouvre Android Studio (ou: open ios)
```

---

## Architecture

```
src/app/
├── core/
│   ├── models/              Region, Category, Article/SummaryBlock, Digest, UserPreferences
│   ├── data/                taxonomie régions + thèmes + générateur de digests mock
│   └── services/
│       ├── geo-taxonomy     navigation hiérarchie + agrégation codes pays
│       ├── news-gateway     abstraction source d'actus (MockNewsGateway ⇄ HttpNewsGateway)
│       ├── news             façade + cache en mémoire (1 digest par région+date)
│       ├── preferences      choix explicites + signaux d'engagement (Capacitor Preferences)
│       ├── personalization  filtrage thèmes + réordonnancement par profil
│       └── notification     rappel quotidien (Local Notifications)
├── features/
│   ├── digest/              écran principal
│   ├── region-select/       navigation Monde → Continent → Pays → Ville
│   └── settings/            langue, longueur, heure, notifications
└── shared/components/       summary-card, category-filter
```

### Principes de conception

- **Digest mutualisé.** On génère **un** digest par couple *région + date*, pas
  un par utilisateur. La personnalisation (`PersonalizationService`) ne fait que
  filtrer et réordonner ces blocs selon le profil → coût LLM marginal par
  utilisateur quasi nul.
- **Source d'actus abstraite.** L'app dépend de `NewsGateway`, pas d'une source
  concrète. Aujourd'hui `MockNewsGateway` ; en prod, un `HttpNewsGateway`
  (esquisse dans `news-gateway.ts`) frappe le backend — un seul changement de
  provider dans `app.config.ts`.
- **Hiérarchie géo.** Chaque région référence son parent. `getCountryCodes()`
  descend l'arbre pour agréger les codes pays d'un continent (utile pour câbler
  NewsAPI/GNews, qui filtrent par pays).
- **Tout local.** Préférences et signaux d'engagement restent sur l'appareil.
- **Droit d'auteur.** On stocke titre + chapô + lien, jamais l'article complet.
  Les cartes affichent le résumé et renvoient vers la source.

---

## Passer en production — ce qui reste à câbler

1. **Backend d'ingestion** : collecte (APIs d'actus et/ou flux RSS) → dédoublonnage
   → stockage, puis génération LLM quotidienne d'un `Digest` par région+date.
2. **`HttpNewsGateway`** côté app (déjà esquissé) sur `GET /digests/{regionId}?date=`.
3. **Taxonomie régions** servie par le backend plutôt que le fichier statique.
4. **Push serveur** (`@capacitor/push-notifications`) si on veut livrer le contenu
   et pas seulement un rappel d'ouverture.
5. **Longueur de résumé** : passer `digestLength` au backend pour que le LLM
   calibre (court / standard / détaillé).

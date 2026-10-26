# ingest — l'édition du jour, fabriquée gratuitement

Pipeline qui transforme des flux RSS en éditions quotidiennes pour l'app,
sans serveur : il tourne sur GitHub Actions et publie des JSON statiques
servis par un CDN gratuit.

```
flux RSS ──▶ articles ──▶ (région × thème) ──▶ résumés ──▶ out/digests/<regionId>/latest.json
             fetch-feeds      group            summarize      build
```

## Lancer en local

```bash
cd ingest
npm install
npm run check-feeds        # diagnostic : chaque flux répond-il ? combien d'articles ? images ?
npm run build              # fabrique out/ avec les vrais flux (résumé extractif sans clé)
GEMINI_API_KEY=… npm run build   # avec les résumés IA
npm run build:fixture      # hors ligne, flux de test dans fixtures/
```

## Fichiers

- `feeds.json` — **la liste des flux**, c'est le cœur éditorial. `{ regionId, categoryId, url, source, lang }`.
  Un flux de pays alimente aussi son continent et le monde. Les flux Google News
  (`news.google.com/rss/search?q=…`) servent de filet pour les villes.
- `regions.json` — miroir de la taxonomie de l'app (ids + parents). À synchroniser avec `src/app/core/data/regions.data.ts`.
- `src/fetch-feeds.mjs` — lecture RSS/Atom, nettoyage, URL canonique, image (`media:*`, `enclosure`, `<img>`), âge max 36 h.
- `src/group.mjs` — dédoublonnage (URL + titre normalisé), agrégation hiérarchique, score (fraîcheur, reprises, image), 6 articles max par bloc.
- `src/summarize.mjs` — **un appel Gemini par région** (JSON structuré), sinon repli extractif. L'édition sort toujours.
- `src/build.mjs` — orchestration, og:image des manchettes sans visuel (budget borné), écriture des JSON.

## Sortie

```
out/
├── index.json                      régions publiées, horodatage, flux en échec
├── _headers                        CORS * (Cloudflare Pages)
└── digests/<regionId>/
    ├── YYYY-MM-DD.json             l'édition du jour (modèle `Digest` de l'app)
    └── latest.json                 copie de la dernière
```

## Mise en route sur GitHub (une fois)

1. Pousser le dépôt. Le workflow `.github/workflows/digest.yml` se déclenche à 05:30 Paris
   (et 12:30), ou à la main depuis l'onglet Actions.
2. **Settings → Actions → General → Workflow permissions → Read and write** (le bot pousse sur la branche `digests`).
3. **Settings → Pages → Deploy from a branch → `digests` / root.**
   L'URL de base devient `https://<user>.github.io/<repo>` — à reporter dans `src/app/core/config.ts`.
4. Facultatif : **Settings → Secrets → `GEMINI_API_KEY`** (palier gratuit AI Studio). Sans clé, résumé extractif.

## Coût

0 €. GitHub Actions ≈ 3 min/jour (quota gratuit : 2 000 min/mois en privé, illimité en public).
Pages : gratuit, CDN mondial. Gemini : palier gratuit, ~30 appels/jour, repli automatique si quota dépassé.

## Règles

Résumé maison + lien vers la source, jamais le texte intégral. Images : URL d'origine, créditée.
Un flux qui ne répond pas est ignoré, jamais bloquant.

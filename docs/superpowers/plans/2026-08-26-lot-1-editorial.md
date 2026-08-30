# Lot 1 — Éditorial — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écrire, structurer, évaluer et faire circuler des articles de bout en bout, sans aucune IA — pour que le Lot 2 branche la génération sur un modèle éditorial déjà éprouvé.

**Architecture:** Un cœur de fonctions pures (`markdown/`, `seo/`, `articles/transitions.ts`) sans base ni réseau, testable en millisecondes ; des services NestJS qui l'entourent pour la persistance ; un éditeur CodeMirror 6 qui manipule le Markdown canonique sans conversion.

**Tech Stack:** unified/remark + rehype-sanitize · CodeMirror 6 · DataLoader · le socle du Lot 0 (NestJS 11, Apollo 5, Prisma 6, Next.js 16, Vitest, Playwright).

**Référence :** `docs/superpowers/specs/2026-08-26-lot-1-editorial-design.md`

---

## Note de méthode

Le plan du Lot 0 donnait le code complet de chaque étape. Treize de ses défauts n'ont été découverts qu'à l'exécution — du code écrit sans pouvoir être compilé.

Ce plan procède autrement :

- **Code complet** pour ce qui est nouveau ou piégeux : analyse d'AST, barème SEO, machine à états, DataLoader, intégration CodeMirror.
- **Contrat + renvoi au motif existant** pour ce qui est répétitif : un resolver de Topics suit exactement `apps/api/src/domains/domains.resolver.ts`, un module NestJS suit `domains.module.ts`. Ces motifs sont dans le dépôt, testés, et plus fiables que du code que je réécrirais de mémoire.
- **Contrats de test explicites** partout : ce qui doit être vérifié est spécifié même quand le code du test n'est pas donné.

Chaque tâche indique ce qu'il faut vérifier empiriquement plutôt que déduire.

---

## Structure de fichiers

```
packages/validation/
├── src/{index,auth,domain,article,topic}.ts
├── tsconfig.build.json          # émission JS + déclarations vers dist/
└── package.json                 # main/types -> dist/

apps/api/src/
├── markdown/                    # PUR — aucune dépendance NestJS
│   ├── parse.ts  render.ts  extract.ts  sections.ts  index.ts
│   └── *.spec.ts
├── seo/
│   ├── analyzer.ts              # PUR
│   ├── criteria/{title,meta,headings,keyword,length,links,readability,images}.ts
│   ├── readability.ts           # PUR, calibré par langue
│   ├── seo.service.ts           # persistance
│   ├── seo.resolver.ts  seo.types.ts  seo.module.ts
│   └── *.spec.ts
├── topics/                      # motif : domains/
├── articles/
│   ├── transitions.ts           # PUR — machine à états + matrice de rôles
│   ├── articles.service.ts      # CRUD, versions, transitions
│   ├── versions.service.ts
│   ├── search.ts                # $queryRaw sur searchVector
│   └── …
├── taxonomy/                    # Category + Tag
└── common/dataloader/

apps/web/src/
├── components/ui/{data-table,confirm-dialog,toast}.tsx
├── components/editor/{markdown-editor,preview,seo-panel,meta-panel,version-panel}.tsx
└── app/(dashboard)/dashboard/{topics,articles,articles/[id],categories}/
```

---

## Task 0 : Rendre `packages/validation` consommable par l'API

C'est un préalable, pas une amélioration : sans lui, chaque schéma de ce lot sera dupliqué comme le sont déjà ceux de l'authentification.

**Files:** `packages/validation/package.json`, `tsconfig.build.json`, `apps/api/package.json`, `apps/api/src/auth/auth.types.ts`

- [ ] **Step 1 : Constater le problème avant de le corriger**

Ajoute temporairement dans `apps/api/src/auth/auth.types.ts` un import depuis `@cancerweb/validation`, puis :
```bash
pnpm --filter @cancerweb/api build && node apps/api/dist/main.js
```
Attendu : échec. **Colle l'erreur exacte dans ton rapport** — c'est elle qui justifie tout le reste, et le `typecheck` ne la montre pas.

Retire l'import temporaire avant de continuer.

- [ ] **Step 2 : Donner un build au paquet**

`packages/validation/tsconfig.build.json` étendant `../../tsconfig.base.json`, `outDir: "dist"`, `declaration: true`, `noEmit: false`.

`package.json` : `main` et `types` vers `dist/index.js` et `dist/index.d.ts`, script `build`. Garde un export conditionnel vers la source si tu juges utile que Next continue de transpiler directement — mais **vérifie** que les deux chemins fonctionnent, ne le suppose pas.

- [ ] **Step 3 : Chaîner les builds**

Le build de l'API doit dépendre de celui de `packages/validation`. Vérifie que `pnpm --filter @cancerweb/api build` depuis un état propre (`rm -rf packages/validation/dist`) produit un résultat exécutable.

- [ ] **Step 4 : Prouver que ça marche vraiment**

Refais le Step 1 avec un import réel et utile (déplace une règle d'authentification dans le paquet et consomme-la depuis `auth.types.ts`). `nest build` puis `node dist/main` doivent aboutir, et l'API doit répondre sur `/health`.

**Le `typecheck` ne prouve rien ici.** C'est exactement ce qui avait masqué le problème au Lot 0.

- [ ] **Step 5 : Supprimer la duplication existante**

Les bornes de l'authentification (mot de passe ≥ 12, nom 2–80) sont aujourd'hui écrites deux fois. Fais-en une seule source, consommée par `class-validator` côté API et par `zodResolver` côté front.

Ajoute un test qui échouerait si les deux divergeaient à nouveau.

- [ ] **Step 6 : Reconstruire l'image Docker et vérifier**

Le Dockerfile de l'API a été affiné au lot précédent pour ne copier que `dist/`, `node_modules/`, `package.json` et `prisma/`. Un nouveau paquet dans la chaîne de build peut casser cette copie sélective. Reconstruis, démarre, vérifie `/health`.

- [ ] **Step 7 : Commit**

```
fix(validation): rendre le paquet consommable par l'API et le front
```

---

## Task 1 : Module `markdown/` — analyse et rendu

**Files:** `apps/api/src/markdown/{parse,render,index}.ts` + specs

- [ ] **Step 1 : Installer**

```bash
pnpm --filter @cancerweb/api add unified remark-parse remark-rehype remark-gfm rehype-sanitize rehype-stringify mdast-util-to-string unist-util-visit
```

Ces paquets sont en ESM pur. `apps/api` compile en CommonJS. **Vérifie ce point en premier** : si l'import échoue, les options sont un import dynamique (`await import()`), un changement de cible du module, ou un paquet alternatif. Rapporte ce que tu constates et ce que tu choisis — c'est le risque principal de cette tâche.

- [ ] **Step 2 : Écrire les tests de `parse` et `render` (ils doivent échouer)**

Contrat de `parse(md: string): Root` — délègue à remark, avec GFM (tableaux, listes de tâches, barré).

Contrat de `render(ast: Root): string` — produit du HTML **sanitizé**.

Cas à couvrir obligatoirement :
- Markdown nominal (titres, gras, liens, listes) → HTML correspondant.
- `<script>alert(1)</script>` dans le Markdown → **absent** du HTML produit.
- `<img src=x onerror=alert(1)>` → attribut `onerror` **absent**.
- `[lien](javascript:alert(1))` → le `href` ne doit pas porter le schéma `javascript:`.
- Un tableau GFM → `<table>`.
- Chaîne vide → chaîne vide, pas d'exception.

Les trois cas d'injection sont le cœur de ce test : le contenu Markdown vient de l'IA au Lot 2 et sera servi au public au Lot 3.

- [ ] **Step 3 : Implémenter, puis relancer**

- [ ] **Step 4 : Vérifier par mutation**

Retire temporairement `rehype-sanitize` de la chaîne et confirme que les trois tests d'injection échouent. **Remets-le immédiatement** et vérifie `git status`.

- [ ] **Step 5 : Commit** — `feat(markdown): analyse et rendu sanitizé du Markdown`

---

## Task 2 : Module `markdown/` — extraction structurelle

**Files:** `apps/api/src/markdown/{extract,sections}.ts` + specs

- [ ] **Step 1 : Tests (ils doivent échouer)**

```ts
extractHeadings(ast): Array<{ depth: number; text: string; line: number }>
extractLinks(ast): { internal: Link[]; external: Link[] }   // Link = { href, text, line }
extractImages(ast): Array<{ src: string; alt: string | null; line: number }>
countWords(ast): number
splitSections(ast): Array<{ heading: string | null; depth: number; startLine: number; endLine: number }>
```

**Cas qui cassent les analyses naïves — tous obligatoires :**

| Cas | Attendu |
|---|---|
| ` ```\n# pas un titre\n``` ` | `extractHeadings` renvoie `[]` |
| ` ```\n[a](b)\n``` ` | `extractLinks` renvoie vide |
| `` `# inline` `` | pas un titre |
| `![](img.png)` | image avec `alt: null` |
| `![ ](img.png)` | `alt` vide ou blanc → traité comme absent |
| `[interne](/articles/x)` | classé interne |
| `[externe](https://ailleurs.fr)` | classé externe |
| `[ancre](#section)` | ni interne ni externe (à trancher et documenter) |
| Document vide | toutes les fonctions renvoient vide ou 0, sans lever |
| Texte sans titre | `splitSections` renvoie une section unique `heading: null` |

`countWords` compte les mots du **texte rendu**, pas les caractères de balisage : `**gras**` vaut un mot, pas trois.

**Le classement interne/externe** dépend de ce qui est considéré comme le site : décide (chemin relatif = interne, schéma http(s) = externe) et documente-le dans le code.

- [ ] **Step 2 : Implémenter avec `unist-util-visit`**, jamais d'expression régulière sur le Markdown brut.

- [ ] **Step 3 : Relancer, viser une couverture réelle des cas ci-dessus**

- [ ] **Step 4 : Commit** — `feat(markdown): extraction des titres, liens, images et sections`

---

## Task 3 : Analyseur SEO — structure et barème

**Files:** `apps/api/src/seo/{analyzer,types}.ts`, `apps/api/src/seo/criteria/*.ts` + specs

- [ ] **Step 1 : Poser les types**

```ts
export interface SeoContext {
  seoTitle: string | null
  metaDescription: string | null
  focusKeyword: string | null
  slug: string
  language: string
}

export type Severity = 'BLOCKING' | 'WARNING' | 'INFO'

export interface SeoIssue {
  code: string          // stable, machine-lisible : 'META_DESCRIPTION_MISSING'
  severity: Severity
  message: string       // français, actionnable
  field?: string        // champ de l'interface concerné
}

export interface CriterionResult {
  code: string
  earned: number
  max: number
  issues: SeoIssue[]
  skipped?: boolean     // catégorie neutralisée (langue non couverte)
}

export interface SeoReportData {
  score: number
  cappedBy: string[]
  issues: SeoIssue[]
  metrics: Record<string, number>
}
```

Chaque critère est une fonction pure `(ast, ctx) => CriterionResult`, dans son propre fichier. L'analyseur les compose.

- [ ] **Step 2 : Tests du barème (ils doivent échouer)**

| Critère | Poids | Règles |
|---|---|---|
| `TITLE` | 20 | longueur 30–60 caractères ; mot-clé focus présent |
| `META_DESCRIPTION` | 15 | présente (**bloquant si absente**) ; 120–158 caractères ; mot-clé présent |
| `HEADINGS` | 15 | exactement un H1 (**bloquant si 0 ou > 1**) ; pas de saut de niveau (H2 → H4) |
| `KEYWORD` | 15 | mot-clé dans le H1, dans les 100 premiers mots, densité 0,5–2,5 % |
| `LENGTH` | 10 | **bloquant si < 300 mots** ; plein score ≥ 600 |
| `LINKS` | 10 | ≥ 1 lien interne, ≥ 1 lien externe |
| `READABILITY` | 10 | voir Task 4 |
| `IMAGES` | 5 | toutes les images ont un `alt` non vide |

Tests obligatoires :
- Article parfait → score ≥ 95, `cappedBy` vide.
- Article sans meta description → `cappedBy` contient `META_DESCRIPTION_MISSING`, **score exactement 60** même si le brut dépasse.
- Article avec deux fautes bloquantes → score 60 également, `cappedBy` de longueur 2.
- Article vide → score bas, aucune exception levée.
- Sans mot-clé focus (`null`) → le critère `KEYWORD` est neutralisé, pas noté 0 : on ne pénalise pas l'absence d'une donnée facultative.
- **Le total des poids vaut exactement 100** — teste-le, c'est le genre d'erreur qu'une relecture ne voit pas.
- Densité de mot-clé : `"seo"` ne doit pas compter dans `"seomanager"` (correspondance sur limites de mots).

- [ ] **Step 3 : Implémenter le plafonnement**

```ts
const blocking = results.flatMap(r => r.issues).filter(i => i.severity === 'BLOCKING')
const raw = Math.round((earned / max) * 100)
const score = blocking.length > 0 ? Math.min(raw, 60) : raw
```

`max` exclut les critères neutralisés (`skipped`), pour que le score reste sur 100 et reste comparable.

- [ ] **Step 4 : Commit** — `feat(seo): analyseur déterministe pondéré avec plafonnement`

---

## Task 4 : Lisibilité calibrée par langue

**Files:** `apps/api/src/seo/readability.ts`, `criteria/readability.ts` + specs

- [ ] **Step 1 : Test (il doit échouer)**

Contrat : `readabilityScore(text: string, language: string): { score: number; supported: boolean }`.

- `fr` → formule adaptée au français (variante Kandel-Moles de Flesch).
- `en` → Flesch Reading Ease standard.
- Toute autre langue → `supported: false`, et le critère renvoie `skipped: true`.

Tests :
- Un texte français simple (phrases courtes, mots courts) obtient un meilleur score qu'un texte administratif à longues phrases.
- Le même texte évalué en `fr` et en `en` donne des scores **différents** — c'est la preuve que la calibration par langue existe réellement et n'est pas un paramètre ignoré.
- Langue `de` → `supported: false`, et le rapport global contient une `issue` de sévérité `INFO` expliquant que la lisibilité n'a pas été mesurée.
- Le score global reste sur 100 quand la catégorie est neutralisée.

- [ ] **Step 2 : Implémenter.** Le comptage de syllabes diffère entre français et anglais : documente la règle retenue, elle sera fausse sur les cas limites et c'est acceptable tant que c'est explicite.

- [ ] **Step 3 : Commit** — `feat(seo): lisibilité calibrée par langue, neutralisée si non couverte`

---

## Task 5 : Topics

**Files:** `apps/api/src/topics/{topic.types,topics.service,topics.resolver,topics.module}.ts`, `packages/validation/src/topic.ts`, `apps/api/test/topics.int-spec.ts`

**Motif à suivre :** `apps/api/src/domains/` — mêmes conventions de types, service, resolver, module, guard.

- [ ] **Step 1 : Tests d'intégration (ils doivent échouer)**

- Création d'un topic sur un domaine dont on est membre.
- Un non-membre ne peut ni créer, ni lister, ni modifier — vérifie sur **chacune** des opérations, pas seulement la création.
- Filtrage par statut et pagination.
- `selectTopic` fait passer `IDEA → SELECTED`, `rejectTopic` fait passer à `REJECTED`.
- Une transition invalide (`REJECTED → SELECTED`) est refusée.
- `CONVERTED` n'est **pas** atteignable directement : seul le passage par `createArticle(topicId)` y mène (Task 6).

- [ ] **Step 2 : Implémenter.** `@RequireDomainRole(AUTHOR)` pour créer et modifier, `VIEWER` pour lire.

- [ ] **Step 3 : Commit** — `feat(topics): gestion manuelle des idées d'articles`

---

## Task 6 : Articles — CRUD

**Files:** `apps/api/src/articles/{article.types,articles.service}.ts`, `packages/validation/src/article.ts`, `apps/api/test/articles.int-spec.ts`

- [ ] **Step 1 : Tests (ils doivent échouer)**

- Création depuis un topic : l'article est lié, et le topic passe à `CONVERTED`, **dans une transaction**.
- Créer un second article depuis le même topic est refusé (`Article.topicId` est unique).
- Création sans topic : autorisée.
- Slug unique **par domaine** : deux articles homonymes dans le même domaine donnent `mon-article` et `mon-article-1` ; le même titre dans un **autre** domaine redonne `mon-article`.
- `wordCount` et `renderedHtml` sont recalculés à chaque écriture du contenu — vérifie-le, ce sont des valeurs dérivées qui se désynchronisent silencieusement.
- Un `AUTHOR` ne modifie pas l'article d'un autre auteur ; un `EDITOR` le peut.
- Suppression réservée à `OWNER`.

- [ ] **Step 2 : Implémenter.** À chaque écriture du contenu : `parse` → `render` → `countWords`, et persistance de `renderedHtml` et `wordCount`.

- [ ] **Step 3 : Commit** — `feat(articles): CRUD avec slug unique par domaine et dérivés recalculés`

---

## Task 7 : Machine à états des transitions

**Files:** `apps/api/src/articles/transitions.ts` + spec

Fonction **pure**, sans base : c'est ce qui permet de tester les 24 combinaisons en millisecondes.

- [ ] **Step 1 : Test (il doit échouer)**

```ts
canTransition(from: ArticleStatus, to: ArticleStatus, role: DomainRole): TransitionCheck
// TransitionCheck = { allowed: true } | { allowed: false; reason: string }
```

**Teste la matrice complète**, pas un échantillon : pour chaque couple de statuts et chaque rôle, le résultat attendu. Génère les cas plutôt que de les écrire un par un.

Cas explicites :
- `AUTHOR` : `DRAFT → REVIEW` autorisé ; `REVIEW → APPROVED` refusé ; `APPROVED → PUBLISHED` refusé.
- `EDITOR` : toutes les transitions du diagramme autorisées.
- Transitions absentes du diagramme (`DRAFT → PUBLISHED`, `ARCHIVED → DRAFT`) refusées **pour tous les rôles**, y compris `OWNER`.
- `VIEWER` : aucune transition.

- [ ] **Step 2 : Implémenter** sous forme de table de données, pas de cascade de `if`. Une table se lit, se teste et se modifie ; une cascade de conditions cache ses trous.

- [ ] **Step 3 : Commit** — `feat(articles): machine à états des transitions avec matrice de rôles`

---

## Task 8 : Transitions et versions dans le service

**Files:** `apps/api/src/articles/{articles.service,versions.service}.ts`, `apps/api/test/article-workflow.int-spec.ts`

- [ ] **Step 1 : Tests (ils doivent échouer)**

**Transitions :**
- Chaque case autorisée de la matrice fonctionne de bout en bout via GraphQL.
- Chaque case refusée renvoie `FORBIDDEN` — **et non `NOT_FOUND`** : l'article est visible, seule l'action est refusée.
- `publishArticle` positionne `publishedAt`.
- `scheduleArticle` avec une date passée est refusé.

**Versions :**
- `v1` est créée à la création de l'article.
- Chaque transition crée une version portant le libellé de la transition.
- Une simple modification de contenu **ne crée pas** de version.
- `createArticleVersion` crée un instantané à la demande, avec `changeNote`.
- Restaurer `v2` crée `v5` portant le contenu de `v2` — l'historique reste strictement croissant, et la restauration est elle-même réversible.
- Le numéro de version est unique par article et ne régresse jamais.

- [ ] **Step 2 : Implémenter.** Transition et création de version dans **une transaction** : un statut avancé sans instantané rendrait la restauration incohérente.

Écris `versionsService.snapshotBeforeAutomatedChange(articleId, reason)` — sans consommateur dans ce lot, mais testé. C'est le point d'entrée que le Lot 2 appellera avant chaque réécriture IA.

- [ ] **Step 3 : Commit** — `feat(articles): transitions et versionnement aux moments significatifs`

---

## Task 9 : Resolver des articles et SEO persisté

**Files:** `apps/api/src/articles/{articles.resolver,articles.module}.ts`, `apps/api/src/seo/{seo.service,seo.resolver,seo.types,seo.module}.ts`

- [ ] **Step 1 : Tests (ils doivent échouer)**

- `analyzeSeo(articleId)` est une **mutation** : elle persiste un `SeoReport` **et** met à jour `Article.latestSeoScore`.
- Deux analyses successives créent deux rapports ; `seoReports` les renvoie du plus récent au plus ancien.
- `latestSeoScore` reflète toujours le dernier rapport — vérifie-le après deux analyses successives donnant des scores différents.
- Un `VIEWER` peut lire un rapport, un `AUTHOR` peut en déclencher un.

- [ ] **Step 2 : Implémenter**

`SeoService.analyze(articleId)` : charge l'article, `parse` le contenu, appelle `analyzeSeo` (pur), persiste le rapport et met à jour `latestSeoScore` **dans une transaction** — un rapport enregistré sans mise à jour du score dénormalisé casserait le tri de `/dashboard/articles`.

Le service ajoute au rapport ce que l'analyseur pur ne peut pas savoir : la validité des liens internes (l'article ciblé existe-t-il dans le même domaine ?). C'est le seul enrichissement autorisé — tout le reste reste pur.

- [ ] **Step 3 : Commit** — `feat(seo): analyse persistée et score dénormalisé`

---

## Task 10 : Recherche full-text

**Files:** `apps/api/src/articles/search.ts` + spec d'intégration

La colonne `searchVector` et son index GIN existent depuis le Lot 0 et n'ont **jamais servi**.

- [ ] **Step 1 : Tests (ils doivent échouer)**

- Recherche d'un mot du titre → l'article remonte.
- Recherche d'un mot du corps → l'article remonte, avec un rang inférieur à une correspondance de titre (le titre est pondéré `A`, le corps `B`).
- Recherche sans correspondance → liste vide, pas d'erreur.
- **Recherche contenant `'`, `%`, `;`, `--`, ou `' OR 1=1 --`** → aucune erreur, aucun résultat aberrant, et surtout aucune injection. C'est le test le plus important de cette tâche.
- La recherche reste confinée aux domaines dont l'utilisateur est membre — un mot présent uniquement dans un article d'un autre domaine ne remonte rien.

- [ ] **Step 2 : Implémenter**

`$queryRaw` avec **paramètres liés** via le template tag Prisma, jamais `$queryRawUnsafe` ni interpolation de chaîne. Utilise `plainto_tsquery` ou `websearch_to_tsquery` plutôt que `to_tsquery` : ces fonctions acceptent du texte utilisateur brut sans exiger une syntaxe particulière ni lever sur un caractère inattendu.

Le filtre par appartenance de domaine doit être **dans la requête SQL**, pas appliqué après coup en JavaScript.

- [ ] **Step 3 : Vérifier par mutation** que le test d'injection échoue si l'on passe à une interpolation de chaîne. Révoque immédiatement.

- [ ] **Step 4 : Commit** — `feat(articles): recherche full-text PostgreSQL avec paramètres liés`

---

## Task 11 : DataLoader, anti-N+1, et le test de profondeur enfin possible

**Files:** `apps/api/src/common/dataloader/`, resolvers de champs, `apps/api/test/n-plus-one.int-spec.ts`, `apps/api/test/graphql-guards.int-spec.ts`

- [ ] **Step 1 : Exposer les champs imbriqués**

`Article.author`, `Article.domain`, `Article.category`, `Article.tags` en `@ResolveField`. Ce sont les premiers champs imbriqués du schéma.

- [ ] **Step 2 : Écrire le test anti-N+1 (il doit échouer)**

Compte les requêtes Prisma émises pendant une requête GraphQL listant 20 articles avec leurs quatre relations. Utilise le middleware `$on('query')` de Prisma ou `$extends` pour instrumenter.

Attendu **sans** DataLoader : plus de 60 requêtes. **Avec** : un nombre borné (une par relation, plus la liste).

Assert sur une borne haute explicite (par exemple `≤ 8`), pas sur un nombre exact — un test trop rigide casserait au moindre ajout de champ, et serait alors désactivé plutôt que corrigé.

- [ ] **Step 3 : Implémenter les loaders**

Un loader par relation, **instancié par requête** et non partagé entre requêtes : un loader global mettrait en cache des données entre utilisateurs différents, ce qui est une fuite de données, pas une optimisation.

Branche-les dans le contexte GraphQL (`context: ({ req, res }) => ({ req, res, loaders: createLoaders(prisma) })`).

- [ ] **Step 4 : Écrire enfin le test de profondeur GraphQL**

Différé deux fois faute de chemin imbriqué. Il existe maintenant : `articles → items → author → …` ou `articles → items → domain → articles → …`.

Construis une requête dépassant 8 niveaux sur des champs **non préfixés `__`** et vérifie qu'elle est rejetée avec un message mentionnant la profondeur. Inspecte le SDL généré pour choisir un chemin réellement valide — une requête invalide échouerait sur « champ inconnu » et donnerait un test vert qui ne teste rien.

Retire le commentaire de report devenu obsolète dans `graphql-guards.int-spec.ts`.

- [ ] **Step 5 : Commit** — `perf(api): DataLoader sur les champs imbriqués, et test de profondeur GraphQL`

---

## Task 12 : Catégories, tags, et la dette `country`

**Files:** `apps/api/src/taxonomy/`, `apps/api/src/domains/domain.types.ts`

- [ ] **Step 1 : Tests (ils doivent échouer)**

- CRUD de catégories et de tags, portés par un domaine, slug unique par domaine.
- Hiérarchie de catégories : une catégorie peut avoir un parent ; un cycle est refusé (A parent de B, B parent de A).
- Supprimer une catégorie utilisée met `Article.categoryId` à `null` (`onDelete: SetNull` du schéma) sans supprimer l'article — vérifie-le.
- Associer et dissocier des tags d'un article.
- Un non-membre du domaine n'accède à rien.

**Dette du Lot 0 :** `country` figure dans `CreateDomainInput` mais pas dans `UpdateDomainInput`. Ajoute-le, avec la même validation ISO 3166-1 alpha-2, et un test.

- [ ] **Step 2 : Implémenter** en suivant le motif de `domains/`.

- [ ] **Step 3 : Commit** — `feat(taxonomy): catégories hiérarchiques et tags` puis `fix(domains): autoriser la modification du pays`

---

## Task 13 : Primitives d'interface différées

**Files:** `apps/web/src/components/ui/{data-table,confirm-dialog,toast}.tsx` + tests

Différées au Lot 0 faute de consommateur ; elles en ont un maintenant.

- [ ] **Step 1 : `DataTable`**

Contrat : colonnes déclaratives, tri contrôlé (l'état vit dans l'URL, pas dans le composant — pour qu'un filtre soit partageable et survive au rechargement), pagination, état vide, état de chargement par `Skeleton`.

Tests : rendu des colonnes, changement de tri au clic sur un en-tête, affichage de l'état vide, accessibilité (`<th scope="col">`, tri annoncé par `aria-sort`).

- [ ] **Step 2 : `ConfirmDialog`** sur Radix Dialog. Focus piégé, `Échap` ferme, action destructive en variante `danger`, texte de confirmation paramétrable.

**N'utilise jamais `window.confirm`** : c'est une boîte modale native qui bloque l'exécution et se comporte mal en test comme en automatisation.

- [ ] **Step 3 : `Toast`** sur Radix Toast, fournisseur au niveau du layout du dashboard, variantes succès et erreur, disparition automatique, annonce ARIA (`role="status"`).

- [ ] **Step 4 : Commit** — `feat(web): DataTable, ConfirmDialog et Toast`

---

## Task 14 : Écrans Topics

**Files:** `apps/web/src/app/(dashboard)/dashboard/topics/`, opérations GraphQL, codegen

- [ ] **Step 1** : opérations dans `packages/graphql/src/operations/topics.graphql`, puis `pnpm codegen`.
- [ ] **Step 2** : liste avec `DataTable` (titre, statut, difficulté, intérêt, date), filtres par statut, création, sélection, rejet avec `ConfirmDialog`, retour par `Toast`.
- [ ] **Step 3** : depuis un topic `SELECTED`, une action « Rédiger l'article » crée l'article et redirige vers l'éditeur.
- [ ] **Step 4 : Commit** — `feat(web): gestion des idées d'articles`

---

## Task 15 : Liste des articles

**Files:** `apps/web/src/app/(dashboard)/dashboard/articles/page.tsx`

- [ ] **Step 1** : `DataTable` avec titre, statut (`StatusBadge`), auteur, catégorie, score SEO, date. Tri par date, titre et score SEO. Pagination.
- [ ] **Step 2** : filtres — recherche full-text, statut, auteur, catégorie, score minimum. **L'état des filtres vit dans l'URL** : une vue filtrée doit être partageable et survivre au rechargement.
- [ ] **Step 3** : état vide distinguant « aucun article » de « aucun résultat pour ces filtres » — deux situations qui appellent des actions différentes.
- [ ] **Step 4 : Commit** — `feat(web): liste des articles avec recherche et filtres`

---

## Task 16 : Éditeur — CodeMirror et aperçu

**Files:** `apps/web/src/components/editor/{markdown-editor,preview}.tsx`, `apps/web/src/app/(dashboard)/dashboard/articles/[id]/page.tsx`

- [ ] **Step 1 : Installer**

```bash
pnpm --filter @cancerweb/web add @uiw/react-codemirror @codemirror/lang-markdown @codemirror/theme-one-dark
```

Ou les paquets `@codemirror/*` seuls si tu préfères contrôler l'intégration React. **CodeMirror 6 ne fonctionne que côté navigateur** : le composant doit être `'use client'` et probablement chargé dynamiquement avec `ssr: false`. Vérifie le comportement réel au build, c'est le piège classique de cette intégration.

- [ ] **Step 2 : Éditeur**

Deux colonnes redimensionnables, coloration Markdown, numéros de ligne, retour à la ligne automatique.

**Sauvegarde temporisée** (1 à 2 secondes après la dernière frappe) avec indicateur d'état : « Modifications non enregistrées » → « Enregistrement… » → « Enregistré ». Un éditeur qui ne dit pas si le travail est sauvegardé est une source d'angoisse et de perte de contenu.

- [ ] **Step 3 : Aperçu**

Rendu du HTML sanitizé renvoyé par l'API — **ne réimplémente pas le rendu Markdown côté client**. Deux moteurs de rendu divergeraient, et l'aperçu mentirait sur le résultat publié.

Si cela impose un aller-retour réseau par aperçu, temporise-le comme la sauvegarde.

- [ ] **Step 4 : Tests** — temporisation (le composant n'appelle pas l'API à chaque frappe), transitions de l'indicateur d'état.

- [ ] **Step 5 : Commit** — `feat(web): éditeur Markdown CodeMirror avec aperçu`

---

## Task 17 : Panneaux SEO, métadonnées et versions

**Files:** `apps/web/src/components/editor/{seo-panel,meta-panel,version-panel}.tsx`

- [ ] **Step 1 : Panneau SEO**

Score en grand, avec bandeau explicite quand `cappedBy` n'est pas vide : « Score plafonné à 60 — 1 faute bloquante ». Sans cette mention, un utilisateur voyant 60 croira à un article médiocre plutôt qu'à un défaut précis et corrigeable.

Problèmes groupés par sévérité, chacun cliquable pour amener au champ concerné (`issue.field`).

**Recalcul temporisé**, jamais à chaque frappe. Tant que le calcul n'a pas convergé, marquer le score comme obsolète visuellement — un score qui clignote est inexploitable.

- [ ] **Step 2 : Panneau métadonnées**

Titre SEO, meta description, mot-clé focus, mots-clés secondaires, slug, canonique, `robotsIndex`, `robotsFollow`. Compteurs de caractères avec les seuils du barème (30–60, 120–158) : l'utilisateur doit voir la contrainte pendant qu'il écrit, pas après analyse.

- [ ] **Step 3 : Panneau versions**

Liste des versions avec libellé et auteur, diff textuel entre deux versions, restauration derrière `ConfirmDialog` expliquant qu'une nouvelle version sera créée.

- [ ] **Step 4 : Barre de transitions**

Actions disponibles selon le statut **et le rôle** de l'utilisateur. Une action indisponible est affichée désactivée avec sa raison, plutôt que masquée : un auteur doit comprendre que la publication existe et requiert un éditeur, pas croire qu'elle n'existe pas.

- [ ] **Step 5 : Commit** — `feat(web): panneaux SEO, métadonnées, versions et transitions`

---

## Task 18 : Catégories et fin de parcours

**Files:** `apps/web/src/app/(dashboard)/dashboard/categories/`

- [ ] **Step 1** : CRUD des catégories avec affichage hiérarchique, gestion des tags.
- [ ] **Step 2** : activer les entrées de navigation correspondantes dans la sidebar (elles sont aujourd'hui désactivées).
- [ ] **Step 3 : Commit** — `feat(web): gestion de la taxonomie`

---

## Task 19 : Parcours éditorial de bout en bout

**Files:** `apps/web/e2e/editorial-workflow.spec.ts`

- [ ] **Step 1 : Écrire le parcours**

Deux comptes dans le même domaine : un `AUTHOR`, un `EDITOR`.

1. L'auteur crée un topic, le sélectionne, lance la rédaction.
2. Il écrit un article dans l'éditeur, voit le score SEO apparaître, corrige une faute bloquante et voit le score franchir le plafond de 60.
3. Il soumet en revue. **Il ne voit aucune action de publication disponible.**
4. L'éditeur ouvre l'article, l'approuve, le publie.
5. L'article apparaît en `PUBLISHED` dans la liste, avec son score.

Le point 3 est le cœur du test : c'est la vérification, à travers l'interface réelle, que la séparation auteur/éditeur tient.

- [ ] **Step 2 : Vérifier par mutation** que le test échoue si l'on autorise `AUTHOR → APPROVED` dans la matrice de transitions. **Révoque immédiatement** et vérifie `git status`.

- [ ] **Step 3 : Commit** — `test(e2e): parcours éditorial complet avec séparation des rôles`

---

## Task 20 : CI et documentation

**Files:** `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1** : ajouter le build de `packages/validation` à la chaîne CI, et le test E2E du parcours éditorial au job `e2e`.
- [ ] **Step 2** : documenter dans le README le flux éditorial, le barème SEO et sa règle de plafonnement, et la matrice des rôles.
- [ ] **Step 3 : Commit** — `ci: intégrer le Lot 1` puis `docs: documenter le flux éditorial`

---

## Critères d'acceptation

- [ ] `packages/validation` est réellement consommé par l'API : `nest build` puis `node dist/main` fonctionnent, et aucune règle n'est dupliquée
- [ ] Un `<script>` dans le Markdown n'atteint jamais le HTML rendu
- [ ] Le total des poids du barème SEO vaut exactement 100, vérifié par un test
- [ ] Une faute bloquante plafonne le score à 60, quel que soit le total brut
- [ ] La lisibilité donne des scores différents en `fr` et en `en`, et se neutralise proprement sur une langue non couverte
- [ ] Les 24 combinaisons statut × rôle de la matrice de transitions sont testées
- [ ] Un `AUTHOR` ne peut ni approuver ni publier, vérifié en intégration **et** à travers l'interface
- [ ] Restaurer une version crée une nouvelle version ; l'historique ne régresse jamais
- [ ] La recherche full-text résiste à `' OR 1=1 --` et reste confinée aux domaines accessibles
- [ ] Lister 20 articles avec leurs relations tient dans un nombre borné de requêtes
- [ ] La limite de profondeur GraphQL est enfin vérifiée par un test qui échoue sans elle
- [ ] `pnpm lint && pnpm typecheck && pnpm test` passent ; CI verte

## Ce que ce lot ne fait pas

Génération IA (Lot 2), blog public et publication effective des articles programmés (Lot 3), fact-checking sourcé et automatisations (Lot 4).

Dette du Lot 0 restant ouverte après ce lot : le job E2E de la CI n'a toujours pas été validé sur un runner GitHub.

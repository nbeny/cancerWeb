# Plateforme éditoriale assistée par IA — Design

Date : 2026-08-25
Statut : validé, prêt pour rédaction du plan d'implémentation (Lot 0)

---

## 1. Objectif

Construire une plateforme éditoriale multi-domaines dans laquelle l'IA agit comme rédacteur, SEO manager et assistant de vérification, avec revue humaine obligatoire par défaut avant publication.

L'IA n'est pas une fonction `prompt → article` : chaque étape de production (recherche, plan, brouillon, SEO, fact-checking) est persistée, réutilisable et rejouable indépendamment.

### Décisions cadrantes prises avec l'utilisateur

| Sujet | Décision |
|---|---|
| Domaine éditorial | Plateforme générique multi-domaines. Aucune contrainte YMYL/santé structurelle. |
| Tenancy | Mono-organisation + membership par domaine (`DomainMember`). Pas de `Organization`. |
| Format de contenu | Markdown canonique, analysé via AST remark. |
| Dépôt / réseau | Monorepo pnpm, reverse proxy Caddy same-origin sur `:3000`. |
| Provider IA principal | Agent CLI local (type `opencode`) écrivant des fichiers Markdown/JSON. |

### Risque accepté : provider CLI

Le choix d'un agent CLI local a été fait en connaissance des limites suivantes, signalées et confirmées :

- pas de comptage de tokens ni de coût (`AIJob.promptTokens`, `costCents` restent `null`) ;
- non conteneurisable proprement : le worker doit tourner sur l'hôte pour l'utiliser ;
- sortie non structurée nativement, d'où un contrat par fichiers + validation zod ;
- l'interface d'un CLI n'est pas un contrat stable : elle peut changer entre deux versions.

Mitigation : le provider est isolé derrière `AIProvider`, et `HttpAIProvider` (compatible OpenAI : Ollama, Groq, OpenRouter) est écrit au Lot 2 comme solution de repli sans modification du code métier.

---

## 2. Architecture globale

### Processus

| Process | Rôle | Exécution |
|---|---|---|
| `web` | Next.js — dashboard authentifié + blog public | conteneur |
| `api` | NestJS — GraphQL, auth, CRUD ; produit les jobs | conteneur |
| `worker` | NestJS standalone — consomme les jobs, appelle l'IA | hôte en dev avec `AI_PROVIDER=cli` ; conteneur avec `AI_PROVIDER=fake` |
| `postgres` | données | conteneur |
| `redis` | queues BullMQ + rate limiting | conteneur |
| `proxy` | Caddy — entrée unique same-origin | conteneur |

**API et worker séparés** : un appel IA de plusieurs dizaines de secondes dans le process API bloquerait l'event loop Node et dégraderait toutes les requêtes GraphQL concurrentes. Même image Docker, deux commandes (`node dist/main` / `node dist/worker`), même code Prisma et mêmes services.

### Topologie réseau

```
http://localhost:3000
   ├─ /            → web (Next.js)
   ├─ /graphql     → api (NestJS)
   └─ /uploads/*   → api (médias)
```

Origine unique : le cookie de refresh est `httpOnly` `SameSite=Lax`, donc ni CORS ni CSRF cross-site à gérer, et l'environnement de développement est identique à la production.

### Flux d'une génération

1. `web` appelle une mutation IA ; l'API répond en moins de 100 ms.
2. L'API crée `PipelineRun` + premier `PipelineStep` (`PENDING`) et enfile un job BullMQ `{runId, stepId, correlationId}`.
3. Le `worker` consomme, crée un `AIJob`, appelle `AIProvider`, valide la sortie (zod), persiste `PipelineStep.output`, enfile l'étape suivante.
4. `web` interroge `pipelineRun(id)` toutes les 2 s pour afficher la progression.

**Polling plutôt que subscriptions GraphQL** : les websockets imposeraient l'authentification sur socket, la gestion de la reconnexion et des sessions persistantes derrière le proxy, pour afficher une barre de progression. Les subscriptions restent ajoutables ultérieurement sans changement du modèle de données.

### Frontière public / privé

Le blog public n'utilise pas le schéma GraphQL authentifié. Des resolvers `@Public()` exposent `publicArticles` et `publicArticle`, qui retournent un type GraphQL **distinct** `PublicArticle` ne contenant que des champs publiables et ne renvoyant que `status = PUBLISHED`. Un type séparé rend structurellement impossible la fuite d'un brouillon, d'un claim non vérifié ou d'un coût IA via un oubli de guard sur un champ.

---

## 3. Modèle de données (Prisma / PostgreSQL)

### Correction de nommage

La spec initiale utilisait `domain` pour deux concepts distincts : le domaine éditorial (`Domain`) et le nom d'hôte d'une source. Le second devient `Source.host`.

### Identité et accès

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  name         String
  slug         String     @unique      // requis par la page publique /author/[slug]
  bio          String?
  avatarUrl    String?
  globalRole   GlobalRole @default(USER)
  isActive     Boolean    @default(true)
  memberships  DomainMember[]
  articles     Article[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}

model DomainMember {
  id       String     @id @default(cuid())
  userId   String
  domainId String
  role     DomainRole
  createdAt DateTime  @default(now())
  @@unique([userId, domainId])
  @@index([domainId, role])
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  familyId  String
  expiresAt DateTime
  revokedAt DateTime?
  userAgent String?
  createdAt DateTime  @default(now())
  @@index([userId, expiresAt])
  @@index([familyId])
}
```

`tokenHash` : un refresh token stocké en clair transforme une fuite de base en fuite de comptes. `familyId` : rotation avec détection de rejeu — si un token déjà consommé est présenté, toute la famille est révoquée.

### Domaine éditorial

```prisma
model Domain {
  id             String   @id @default(cuid())
  name           String
  slug           String   @unique
  description    String?
  language       String   @default("fr")
  country        String?
  tone           Tone
  expertiseLevel ExpertiseLevel
  targetAudience String[]
  keywords       String[]
  excludedTopics String[]
  aiInstructions String?  @db.Text
  autoPublish    Boolean  @default(false)
  reviewOutline  Boolean  @default(true)
  members        DomainMember[]
  topics         Topic[]
  articles       Article[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([slug])
}
```

`language` est un code BCP-47 en `String` validé applicativement, pas un enum : ajouter une langue ne doit pas exiger une migration de base.

`autoPublish` est porté par le domaine et vaut `false` par défaut. Le worker de publication revérifie ce flag **juste avant de publier**, pas au moment de planifier, afin que sa désactivation stoppe aussi les jobs déjà en file.

### Idée et article

```prisma
model Topic {
  id                  String        @id @default(cuid())
  domainId            String
  title               String
  description         String?       @db.Text
  keywords            String[]
  searchIntent        SearchIntent?
  estimatedDifficulty Int?
  estimatedInterest   Int?
  suggestedAngle      String?       @db.Text
  status              TopicStatus   @default(IDEA)
  generatedByJobId    String?
  article             Article?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  @@index([domainId, status, createdAt])
}

model Article {
  id             String        @id @default(cuid())
  domainId       String
  topicId        String?       @unique
  authorId       String
  categoryId     String?
  title          String
  slug           String
  content        String        @db.Text     // Markdown, source de vérité
  renderedHtml   String?       @db.Text     // rendu sanitizé, calculé à l'écriture
  excerpt        String?
  coverImageUrl  String?
  status         ArticleStatus @default(DRAFT)
  currentVersion Int           @default(1)
  wordCount      Int           @default(0)
  latestSeoScore Int?                       // dénormalisé depuis le dernier SeoReport
  scheduledAt    DateTime?
  publishedAt    DateTime?

  seoTitle          String?
  metaDescription   String?
  canonicalUrl      String?
  focusKeyword      String?
  secondaryKeywords String[]
  robotsIndex       Boolean @default(true)
  robotsFollow      Boolean @default(true)

  versions      ArticleVersion[]
  seoReports    SeoReport[]
  claims        Claim[]
  sources       ArticleSource[]
  tags          ArticleTag[]
  publications  Publication[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([domainId, slug])
  @@index([domainId, status, publishedAt(sort: Desc)])
  @@index([status, scheduledAt])
  @@index([authorId])
  @@index([domainId, latestSeoScore])
}
```

`latestSeoScore` est dénormalisé sur `Article` et mis à jour à chaque calcul de `SeoReport` : `/articles` doit trier et filtrer par score SEO, ce qu'une jointure sur « le dernier rapport de chaque article » rendrait coûteux et non indexable. `SeoReport` conserve l'historique, `Article` porte la valeur courante.

`Topic.status` ne contient plus `IN_PROGRESS` ni `PUBLISHED` : c'étaient des doublons de `Article.status` et donc deux sources de vérité à synchroniser. Le cycle de l'idée se limite à `IDEA | SELECTED | REJECTED | CONVERTED`.

`renderedHtml` est calculé à l'écriture : le blog public sert des pages sans re-parser ni re-sanitizer à chaque requête, et le rendu ne dépend pas de la version de la librairie au moment de la lecture.

`slug` est unique par domaine, pas globalement : deux domaines éditoriaux peuvent légitimement publier `/zero-trust`.

```prisma
model ArticleVersion {
  id          String   @id @default(cuid())
  articleId   String
  version     Int
  title       String
  content     String   @db.Text
  seoSnapshot Json?
  changeNote  String?
  createdById String
  createdAt   DateTime @default(now())
  @@unique([articleId, version])
  @@index([articleId, createdAt(sort: Desc)])
}
```

Snapshot complet plutôt que diff : quelques dizaines de Ko par version sont négligeables face à la complexité d'un système de patchs, et restaurer devient un simple `INSERT`.

### Taxonomie

```prisma
model Category   { id, domainId, name, slug, description?, parentId?  @@unique([domainId, slug]) }
model Tag        { id, domainId, name, slug                            @@unique([domainId, slug]) }
model ArticleTag { articleId, tagId                                    @@id([articleId, tagId]) }
```

### SEO

```prisma
model SeoReport {
  id         String   @id @default(cuid())
  articleId  String
  score      Int
  issues     Json     // [{code, severity, message, field}]
  metrics    Json     // {wordCount, h1Count, h2Count, keywordDensity, internalLinks, ...}
  computedAt DateTime @default(now())
  @@index([articleId, computedAt(sort: Desc)])
}
```

Le score est produit par du **code déterministe** (`seo/analyzer.ts`, fonction pure sur l'AST Markdown), jamais par le modèle : un score généré par IA serait non reproductible et non testable. L'IA n'intervient que pour proposer des corrections à partir du rapport.

Les rapports sont historisés et non écrasés, car le dashboard demande le score moyen et son évolution dans le temps.

Critères analysés : longueur du titre SEO, longueur de la meta description, présence du mot-clé focus (titre, H1, intro, corps), unicité du H1, hiérarchie H2/H3, nombre de mots, liens internes, liens externes, lisibilité, sur-optimisation du mot-clé, format du slug, `alt` des images.

### Sources et fact-checking

```prisma
model Source {
  id          String   @id @default(cuid())
  url         String   @unique
  urlHash     String   @unique
  title       String?
  host        String?
  author      String?
  publishedAt DateTime?
  retrievedAt DateTime @default(now())
  content     String?  @db.Text
  providerKey String
  @@index([host])
}

model ArticleSource {
  articleId String
  sourceId  String
  quote     String? @db.Text
  relevance Int?
  @@id([articleId, sourceId])
}

model Claim {
  id           String      @id @default(cuid())
  articleId    String
  content      String      @db.Text
  excerptStart Int?
  excerptEnd   Int?
  status       ClaimStatus @default(UNVERIFIED)
  confidence   Float?
  verifiedById String?
  verifiedAt   DateTime?
  sources      ClaimSource[]
  createdAt    DateTime    @default(now())
  @@index([articleId, status])
}

model ClaimSource { claimId String; sourceId String; @@id([claimId, sourceId]) }
```

**Règle métier appliquée dans le service et couverte par des tests** : `Claim.status = VERIFIED` est refusé si le claim n'a aucune `Source` attachée. Un modèle ne peut donc pas s'auto-décerner une vérification, ce qui satisfait l'exigence « ne jamais présenter une information comme certaine sans source fiable ».

Au Lot 2, l'IA se limite à **extraire** les claims (`UNVERIFIED`) et à les ancrer dans le Markdown ; la vérification est humaine. Le fact-checking automatique sourcé arrive au Lot 4, une fois qu'un `ResearchProvider` réel fournit des sources.

### Pipeline et jobs

```prisma
model PipelineRun {
  id          String    @id @default(cuid())
  domainId    String
  topicId     String?
  articleId   String?
  triggeredBy String?              // userId, ou null si automatisation
  automationId String?
  status      RunStatus
  currentStep StepType?
  steps       PipelineStep[]
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  @@index([domainId, status, createdAt(sort: Desc)])
  @@index([articleId])
}

model PipelineStep {
  id        String     @id @default(cuid())
  runId     String
  type      StepType
  order     Int
  status    StepStatus
  attempt   Int        @default(0)
  input     Json?
  output    Json?
  error     String?    @db.Text
  heartbeatAt DateTime?
  jobs      AIJob[]
  startedAt DateTime?
  completedAt DateTime?
  @@unique([runId, type, attempt])
  @@index([status, heartbeatAt])
}

model AIJob {
  id               String    @id @default(cuid())
  stepId           String?
  type             String
  provider         String
  model            String
  promptVersion    String
  status           JobStatus
  input            Json
  output           Json?
  rawOutput        String?   @db.Text
  error            String?   @db.Text
  promptTokens     Int?
  completionTokens Int?
  costCents        Int?
  durationMs       Int?
  correlationId    String?
  startedAt        DateTime?
  completedAt      DateTime?
  createdAt        DateTime  @default(now())
  @@index([status, createdAt(sort: Desc)])
  @@index([stepId])
}
```

Trois niveaux, chacun avec un rôle distinct : `PipelineRun` porte l'intention éditoriale, `PipelineStep` est l'unité rejouable dont l'`output` est persisté et réutilisable, `AIJob` est l'exécution technique observable. Relancer l'étape `DRAFT` crée un `PipelineStep(attempt = 2)` qui lit l'`output` d'`OUTLINE` déjà en base : aucune étape antérieure n'est recalculée. Un `AIJob` seul ne permettrait pas cette reprise.

### Publication

```prisma
model PublicationTarget {
  id          String  @id @default(cuid())
  domainId    String
  providerKey String              // "internal" | "wordpress" | "ghost" | ...
  name        String
  config      Json                // secrets chiffrés au repos
  isActive    Boolean @default(true)
}

model Publication {
  id          String            @id @default(cuid())
  articleId   String
  targetId    String
  status      PublicationStatus
  externalId  String?
  externalUrl String?
  error       String?           @db.Text
  attempts    Int               @default(0)
  publishedAt DateTime?
  @@unique([articleId, targetId])
  @@index([status])
}
```

`Article` est la source de vérité éditoriale ; `Publication` est l'occurrence sur une cible. Un article diffusé sur le blog interne et sur WordPress produit deux `Publication` pour un seul `Article`. Le provider `internal` se contente de valider l'état et de dater `publishedAt`, ce qui lève la circularité de la formulation initiale.

### Automatisation

```prisma
model Automation {
  id            String    @id @default(cuid())
  domainId      String
  name          String
  cron          String
  timezone      String    @default("Europe/Paris")
  isEnabled     Boolean   @default(false)
  config        Json      // {topicCount, autoSelect, stopAtStep}
  lastRunAt     DateTime?
  nextRunAt     DateTime?
  lastRunStatus String?
  @@index([domainId, isEnabled])
}
```

`isEnabled = false` à la création et `stopAtStep = "REVIEW"` par défaut : une automatisation ne démarre jamais d'elle-même et ne publie pas sans revue humaine.

### Média

```prisma
model Media {
  id        String   @id @default(cuid())
  domainId  String
  url       String
  alt       String?
  width     Int?
  height    Int?
  mimeType  String
  sizeBytes Int
  createdAt DateTime @default(now())
}
```

### Recherche full-text

Prisma ne sait pas déclarer un `tsvector` ; migration SQL manuelle :

```sql
ALTER TABLE "Article" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX article_search_idx ON "Article" USING GIN ("searchVector");
```

Colonne générée (jamais désynchronisée, aucun trigger à maintenir). Dictionnaire `simple` car le contenu est multilingue : un dictionnaire `french` appliqué à un article anglais dégraderait les résultats.

### Enums

`GlobalRole(ADMIN, USER)` · `DomainRole(OWNER, EDITOR, AUTHOR, VIEWER)` · `Tone(PROFESSIONAL, EDUCATIONAL, JOURNALISTIC, TECHNICAL, ACCESSIBLE, PROVOCATIVE, NEUTRAL)` · `ExpertiseLevel(BEGINNER, INTERMEDIATE, EXPERT)` · `SearchIntent(INFORMATIONAL, NAVIGATIONAL, COMMERCIAL, TRANSACTIONAL)` · `TopicStatus(IDEA, SELECTED, REJECTED, CONVERTED)` · `ArticleStatus(DRAFT, REVIEW, APPROVED, SCHEDULED, PUBLISHED, ARCHIVED)` · `ClaimStatus(UNVERIFIED, VERIFIED, QUESTIONABLE, CONTRADICTED)` · `RunStatus(PENDING, RUNNING, WAITING_REVIEW, COMPLETED, FAILED, CANCELLED)` · `StepType(RESEARCH, ANALYSIS, OUTLINE, DRAFT, FACT_CHECK, SEO, QUALITY, REVIEW, PUBLISH)` · `StepStatus(PENDING, RUNNING, COMPLETED, FAILED, SKIPPED, CANCELLED)` · `JobStatus(PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)` · `PublicationStatus(PENDING, PUBLISHING, PUBLISHED, FAILED, UNPUBLISHED)`

---

## 4. Backend NestJS

### Arborescence

```
apps/api/src/
├── main.ts            # bootstrap HTTP
├── worker.ts          # bootstrap standalone, sans serveur HTTP
├── common/            # guards, decorators, filters, interceptors, dataloader, logger
├── prisma/            # PrismaService + PrismaModule (global)
├── auth/  users/  domains/  topics/  articles/
├── markdown/          # parse / render / sanitize / sections — pur, sans I/O
├── seo/               # analyzer pur + service de persistance
├── sources/  research/  fact-check/
├── ai/                # AIProvider registry, prompts, CliAgentProvider, FakeAIProvider
├── pipeline/          # PipelineRun/Step, StepHandlers, processors BullMQ
├── publication/  dashboard/  public/
```

### Règles de frontière

1. **Aucune logique métier dans les resolvers.** Un resolver lit le contexte utilisateur, appelle un service, retourne. C'est aussi ce qui permet au worker de réutiliser les mêmes services sans resolvers.
2. **Le cœur est pur.** `markdown/` et `seo/` sont des fonctions sans base ni réseau (`analyzeSeo(ast, opts) → SeoReportData`), testables en millisecondes. La persistance vit dans les services adjacents.
3. **`ai/` ignore le métier, `pipeline/` ignore les providers.** Changer de provider IA ne touche qu'un fichier de `ai/`.

Graphe de dépendances, sans cycle :

```
pipeline → ai, research, articles, topics, seo, fact-check, publication
articles → markdown, seo, prisma
seo      → markdown
public   → articles (lecture seule)
ai       → (aucun module métier)
```

### Transversal

- `GqlAuthGuard` global, `@Public()` en opt-out explicite : par défaut tout est protégé, un resolver oublié reste fermé.
- `@RequireDomainRole('EDITOR')` + `DomainRoleGuard` : résout le `domainId` depuis les arguments ou l'entité ciblée et vérifie le `DomainMember`.
- `AllExceptionsFilter` : codes GraphQL stables (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`), aucun message Prisma brut renvoyé au client.
- `CorrelationIdMiddleware` + `pino` : un `correlationId` par requête, propagé dans les données du job BullMQ et donc présent dans les logs du worker et sur `AIJob`.
- `DataLoaderInterceptor` : loaders par requête (users, domains, categories, tags) contre les N+1.
- Métriques exposées sur `/metrics` (format Prometheus), instrumentation prête pour OpenTelemetry.

---

## 5. Schéma GraphQL

Approche **code-first** (`@nestjs/graphql`) : une seule source de vérité TypeScript, SDL généré, inputs validés par `class-validator` sur les mêmes classes. Le schema-first imposerait de maintenir SDL et types en parallèle.

### Requêtes

```graphql
me: User!
domains(filter: DomainFilter, page: PageInput): DomainConnection!
domain(id: ID!): Domain
topics(filter: TopicFilter!, page: PageInput, sort: TopicSort): TopicConnection!
articles(filter: ArticleFilter!, page: PageInput, sort: ArticleSort): ArticleConnection!
article(id: ID!): Article
articleVersions(articleId: ID!): [ArticleVersion!]!
pipelineRun(id: ID!): PipelineRun
pipelineRuns(filter: PipelineRunFilter, page: PageInput): PipelineRunConnection!
aiJobs(filter: AIJobFilter, page: PageInput): AIJobConnection!
sources(filter: SourceFilter, page: PageInput): SourceConnection!
dashboard(domainId: ID, range: DateRange!): DashboardStats!   # domainId null = tous les domaines accessibles

publicArticles(domainSlug: String!, page: PageInput): PublicArticleConnection!
publicArticle(domainSlug: String!, slug: String!): PublicArticle
publicCategory(domainSlug: String!, slug: String!): PublicCategory
```

### Mutations

```graphql
register(input: RegisterInput!): AuthPayload!
login(input: LoginInput!): AuthPayload!
refresh: AuthPayload!
logout: Boolean!

createDomain / updateDomain / deleteDomain
addDomainMember / updateDomainMember / removeDomainMember

generateTopics(input: GenerateTopicsInput!): PipelineRun!
createTopic / updateTopic / selectTopic / rejectTopic

startArticlePipeline(topicId: ID!): PipelineRun!
regenerateStep(runId: ID!, step: StepType!): PipelineRun!
cancelPipelineRun(runId: ID!): PipelineRun!
updateOutline(runId: ID!, outline: OutlineInput!): PipelineStep!

updateArticle(id: ID!, input: UpdateArticleInput!): Article!
restoreArticleVersion(articleId: ID!, version: Int!): Article!

analyzeSeo(articleId: ID!): SeoReport!
suggestSeoFixes(articleId: ID!): PipelineRun!

runFactCheck(articleId: ID!): PipelineRun!
verifyClaim(claimId: ID!, sourceIds: [ID!]!): Claim!

submitForReview / approveArticle / publishArticle / scheduleArticle / unpublishArticle
createAutomation / updateAutomation / toggleAutomation
createUser / updateUser
```

Toute opération IA retourne un `PipelineRun`, jamais le résultat final : une mutation qui attendrait 90 secondes tomberait sur le timeout du proxy et ne serait pas rejouable.

`analyzeSeo` est l'exception synchrone assumée : c'est du calcul déterministe local de quelques millisecondes.

### Pagination, filtres, tri

Pagination par offset (`page: {limit, offset}`) avec `totalCount`, car `/articles` exige numéros de page, tris multiples (date, score SEO, mots) et filtres combinés. Le blog public n'utilise pas cette pagination : ses pages sont statiques (ISR).

`ArticleFilter` : `domainId`, `status[]`, `authorId`, `categoryId`, `tagIds`, `search` (full-text), `minSeoScore`, `publishedBetween`.

### Garde-fous

- `graphql-depth-limit` = 8 et `graphql-query-complexity` = 1000, appliqués avant exécution.
- Introspection et playground désactivés en production.
- `class-validator` sur chaque Input.
- Le `domainId` fourni par le client n'est jamais fait confiance : le service intersecte systématiquement avec les memberships de l'utilisateur.
- Rate limiting Redis global par IP, renforcé par utilisateur sur les mutations IA.

---

## 6. Frontend Next.js

### Structure

```
apps/web/src/
├── app/
│   ├── (public)/
│   │   ├── page.tsx
│   │   ├── articles/page.tsx
│   │   ├── articles/[slug]/page.tsx
│   │   ├── category/[slug]/page.tsx
│   │   ├── author/[slug]/page.tsx
│   │   ├── sitemap.ts   robots.ts   opengraph-image.tsx
│   ├── (dashboard)/dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── domains/  topics/  articles/  articles/[id]/  ai/  sources/  settings/
│   ├── auth/login/  auth/register/
│   └── api/revalidate/route.ts
├── components/{ui,dashboard,editor,public}/
├── lib/{graphql-client,auth,format}/
└── generated/
```

### Stratégies de rendu

| Zone | Stratégie | Motif |
|---|---|---|
| Blog public | Server Components + ISR | SEO et performance ; pages statiques entre deux publications |
| Dashboard | Server Components à l'entrée, Client Components pour l'interactif | évite un écran vide puis un spinner à chaque navigation |
| Suivi pipeline | Client Component, polling 2 s | seul besoin réellement temps réel |

À la publication, l'API appelle `/api/revalidate` (secret partagé) qui déclenche `revalidateTag`, sinon un article publié attendrait l'expiration de l'ISR pour apparaître.

### Données et types

`graphql-codegen` consomme le SDL généré par NestJS et produit types et documents typés dans `packages/graphql` : interroger un champ inexistant casse le build. C'est le bénéfice principal du monorepo.

- Client Components : TanStack Query + `graphql-request`.
- Server Components : helper `serverQuery()` relayant le cookie.
- Pas d'Apollo Client : son cache normalisé résout un problème que cette application n'a pas, à un coût de complexité réel.
- Formulaires : `react-hook-form` + `zod`, schémas partagés client/serveur via `packages/validation`.

### Authentification côté web

Deux cookies `httpOnly`, `Secure`, `SameSite=Lax` posés par l'API : `access` (15 min) et `refresh` (7 jours, rotation par famille). Les Server Components lisent le cookie via `cookies()` et le relaient. Sur `401`, un wrapper tente un refresh puis rejoue une fois.

Aucun token en `localStorage` : un XSS y deviendrait un vol de session durable. En same-origin, `SameSite=Lax` combiné à l'exigence `Content-Type: application/json` couvre le CSRF, un formulaire HTML cross-site ne pouvant pas émettre ce content-type.

### UI

Tailwind + composants locaux construits sur Radix UI (dialog, dropdown, tabs, toast, popover) : accessibilité clavier et ARIA acquises, aucun style imposé. Pas de librairie de composants lourde, qui dicterait l'esthétique et serait combattue à chaque écran.

Primitives posées dès le Lot 0, car les ajouter après coup se fait mal : `Skeleton`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `Toast`, `StatusBadge`, `DataTable`, `PipelineProgress`.

`PipelineProgress` affiche les étapes, l'étape courante, les échecs, et porte l'action « relancer cette étape ».

### Éditeur d'article

Édition Markdown avec aperçu, panneau latéral SEO (score en direct, liste des problèmes, suggestions IA), panneau Sources, panneau Claims, historique des versions avec diff textuel et restauration. Les sections sont dérivées de l'AST : ajouter, supprimer ou réordonner une section manipule le Markdown, pas un format parallèle.

---

## 7. Système IA

### Séparation des niveaux

L'interface d'origine mélangeait mécanique de modèle et tâches métier : y placer `generateArticle` obligerait chaque nouveau provider à réimplémenter les prompts.

```ts
// Bas niveau : ce qu'un fournisseur sait faire. Seul point à réimplémenter.
interface AIProvider {
  readonly key: string
  complete(req: CompletionRequest): Promise<CompletionResult>
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
  health(): Promise<ProviderHealth>
}

// Haut niveau : le métier, écrit une seule fois au-dessus de l'interface.
class AITaskService {
  generateTopics(domain, opts): Promise<TopicDraft[]>
  generateOutline(domain, topic, research): Promise<Outline>
  generateDraft(domain, topic, outline, sources): Promise<string>   // Markdown
  improveSection(domain, article, sectionRange, instruction): Promise<string>
  extractClaims(article): Promise<ClaimDraft[]>
  suggestSeoFixes(article, seoReport): Promise<SeoSuggestion[]>
  summarize(text): Promise<string>
}
```

`completeStructured` reçoit un schéma zod, valide la sortie et relance **une fois** en renvoyant l'erreur de validation au modèle. Indispensable avec un agent CLI ou un petit modèle local, dont le JSON est régulièrement approximatif.

### CliAgentProvider

Contrat par fichiers, jamais par parsing de stdout :

```
<AI_WORKSPACE>/<jobId>/
  ├── prompt.md
  ├── output.md      # tâches textuelles
  ├── output.json    # tâches structurées
  └── stderr.log
```

```env
AI_PROVIDER=cli
AI_CLI_COMMAND=opencode
AI_CLI_ARGS=["run","--prompt-file","{promptFile}","--output","{outputFile}"]
AI_CLI_TIMEOUT_MS=300000
AI_CLI_MAX_CONCURRENCY=1
AI_WORKSPACE_DIR=./.ai-workspace
```

Décisions :

- `spawn` avec tableau d'arguments, jamais `shell: true` : le prompt contient du contenu utilisateur, une interpolation dans une chaîne de shell serait une injection de commande.
- Prompt transmis par fichier et non en argument : Windows limite la ligne de commande à environ 8 Ko, un contexte d'article la dépasse.
- Répertoire de travail isolé par job, supprimé après succès, conservé après échec pour investigation.
- Timeout dur avec `kill` de l'arbre de processus : un CLI attendant une entrée interactive est le mode de panne le plus probable de cette option.
- `concurrency: 1` sur la file `pipeline` avec ce provider : un agent CLI local n'est pas conçu pour des instances parallèles.
- `rawOutput` conserve stdout et stderr tronqués ; `promptTokens`, `completionTokens` et `costCents` restent `null`.
- Le CLI doit fonctionner en mode non interactif. Le plan d'implémentation commence par un test de fumée sur la machine de l'utilisateur avant toute construction par-dessus.

### Autres implémentations

- `FakeAIProvider` — fixtures Markdown déterministes, latence simulée, échecs déclenchables (`AI_FAKE_FAIL_STEP=DRAFT`). Utilisé par la CI et les tests E2E ; sans lui, la suite E2E serait non déterministe et lente.
- `HttpAIProvider` — compatible OpenAI (Ollama, Groq, OpenRouter, OpenAI), écrit au Lot 2 comme repli.

Le registre sélectionne l'implémentation via `AI_PROVIDER` ; `AIProvider` est injecté par token Nest, donc aucun code métier ne change lors d'une bascule.

### Prompts

Un fichier par tâche dans `ai/prompts/`, versionné (`OUTLINE_V1`), avec injection systématique du contexte du domaine : ton, niveau d'expertise, audience, langue, `aiInstructions`, sujets exclus. `AIJob.promptVersion` enregistre la version utilisée, sans quoi une variation de qualité serait inexplicable a posteriori.

---

## 8. Pipeline, jobs et automatisation

### Machine à états

```
RESEARCH → ANALYSIS → OUTLINE → [pause si domain.reviewOutline]
        → DRAFT → FACT_CHECK → SEO → QUALITY
        → WAITING_REVIEW → (validation humaine) → PUBLISH
```

Machine à états persistée plutôt qu'enchaînement d'`await` : un enchaînement meurt avec le process, tandis qu'ici l'état survit au redémarrage du worker et « relancer DRAFT sans refaire RESEARCH » devient une opération naturelle.

```ts
interface StepHandler<I, O> {
  readonly type: StepType
  readonly inputSchema: ZodSchema<I>
  readonly outputSchema: ZodSchema<O>
  buildInput(run: PipelineRun, previous: StepOutputs): I
  execute(input: I, ctx: StepContext): Promise<O>
}
```

`buildInput` porte la réutilisation du contexte : `DraftStepHandler` lit l'`Outline` et les `Source[]` déjà persistés au lieu de les recalculer.

### Files BullMQ

| File | Concurrence | Contenu |
|---|---|---|
| `pipeline` | 1 avec provider CLI | étapes IA |
| `publication` | 5 | appels aux `PublicationProvider` |
| `scheduled` | 1 | scan des articles `SCHEDULED` échus |
| `automation` | 1 | déclencheurs cron par domaine |

- **Idempotence** : `jobId = ${stepId}:${attempt}`. BullMQ refuse un `jobId` déjà présent, donc un double-clic sur « Générer » ne produit pas deux articles.
- **Reprise après crash** : au démarrage, le worker repasse en `PENDING` tout `PipelineStep` resté `RUNNING` sans job actif et dont le `heartbeatAt` est périmé, sinon un arrêt brutal fige des pipelines en `RUNNING` définitivement.
- **Retry** : 3 tentatives avec backoff exponentiel, uniquement sur erreurs transitoires (timeout, réseau, 5xx). Une sortie invalide après le retry de validation est une erreur terminale ; réessayer un modèle qui produit un JSON malformé consommerait des minutes pour rien.
- **Annulation** : `cancelPipelineRun` marque le run `CANCELLED` ; le handler vérifie le drapeau entre les étapes et tue le processus CLI en cours.

### Automatisation

Les jobs répétables BullMQ portent le cron, un verrou Redis garantit un déclencheur unique même avec plusieurs workers.

Deux garde-fous non négociables :

1. `stopAtStep = REVIEW` par défaut, et le worker de publication revérifie `domain.autoPublish` immédiatement avant de publier.
2. Une automatisation est créée désactivée.

---

## 9. Tests

| Niveau | Outil | Périmètre |
|---|---|---|
| Unitaire | Vitest | `markdown/`, `seo/` (fonctions pures), services avec Prisma mocké, `StepHandler.buildInput`, validation zod des sorties IA |
| Intégration | Jest + PostgreSQL jetable (Testcontainers) + `FakeAIProvider` | resolvers GraphQL de bout en bout : auth, RBAC par domaine, pipeline complet, transitions de statut, publication |
| E2E | Playwright | login → dashboard → création de domaine → génération de topics → sélection → outline → article → review → publication |

Deux règles fermes :

- PostgreSQL réel en intégration, jamais SQLite : index, `tsvector`, `String[]`, contraintes et transactions sont spécifiques à PostgreSQL.
- `FakeAIProvider` en CI : la suite doit être déterministe et rapide, sans dépendre d'un agent CLI installé localement.

Tests d'autorisation obligatoires par ressource : un `AUTHOR` du domaine A accédant à un article du domaine B doit recevoir `FORBIDDEN`. C'est la faille la plus fréquente sur ce type d'application.

---

## 10. Sécurité

- Argon2id pour les mots de passe.
- JWT d'accès 15 minutes, refresh rotatif haché avec détection de rejeu par famille.
- Guards en opt-out (`@Public()`), autorisation vérifiée dans les services et pas seulement dans les guards.
- `class-validator` sur tous les Inputs ; aucune donnée client atteignant un service sans validation.
- Profondeur GraphQL 8, complexité 1000, introspection désactivée en production.
- Rate limiting Redis, renforcé sur les mutations IA.
- Sanitization HTML à l'écriture : le Markdown produit par l'IA peut contenir du HTML brut.
- Secrets côté serveur uniquement, `.env` non committé, aucune variable `NEXT_PUBLIC_*` sensible, `config` des `PublicationTarget` chiffrée au repos.
- `helmet` et CSP sur le blog public.
- Logs structurés sans mot de passe ni token, avec `correlationId`.

---

## 11. Docker et environnements

```yaml
services:
  proxy:    # caddy   :3000   entrée unique
  web:      # next    :3001   healthcheck /api/health
  api:      # nest    :4000   healthcheck /health, depends_on postgres+redis healthy
  worker:   # nest worker, AI_PROVIDER=fake par défaut
  postgres: # postgres:17, healthcheck pg_isready, volume nommé
  redis:    # redis:7, healthcheck ping, appendonly
```

Fichiers : `docker-compose.yml` (développement, hot-reload), `docker-compose.prod.yml` (build multi-stage, utilisateur non-root, sans volume de code), `.env.example` exhaustif.

Conséquence du provider CLI : pour générer avec l'agent local, le worker se lance sur l'hôte (`pnpm worker`, `AI_PROVIDER=cli`) et le worker conteneurisé est arrêté. Documenté explicitement dans le README.

Trois environnements : `development` (compose, seed de démonstration), `test` (base jetable, `FakeAIProvider`, aucun appel réseau), `production` (images buildées, migrations appliquées au déploiement, introspection désactivée).

---

## 12. Découpage en lots

Le périmètre demandé représente plusieurs projets ; il est livré par lots, chacun avec son plan d'implémentation.

**Lot 0 — Socle exécutable**
Monorepo pnpm, Docker complet, schéma Prisma **intégral** et migrations, authentification complète, RBAC par domaine, CRUD Domains, shell du dashboard (sidebar, header, breadcrumbs, primitives UI), codegen GraphQL, CI, tests d'authentification et d'autorisation.

Le schéma Prisma est écrit en entier dès le Lot 0 même si les modules arrivent plus tard : les migrations rétroactives sur un modèle central coûtent bien plus cher qu'un schéma complet posé d'emblée.

**Lot 1 — Éditorial** : Topics manuels, Articles, éditeur Markdown, versions, transitions de statut, `SeoAnalyzer` déterministe, panneau SEO, catégories et tags.

**Lot 2 — IA** : `AIProvider`, `CliAgentProvider`, `FakeAIProvider`, `HttpAIProvider`, `AITaskService`, `PipelineRun`/`PipelineStep`/`AIJob`, BullMQ, enchaînement topics → outline → draft, Sources, écran de suivi du pipeline.

**Lot 3 — Public** : blog public, sitemap, robots, Open Graph, Twitter cards, Schema.org, ISR et revalidation, `PublicationProvider` (interne), planification.

**Lot 4 — Avancé** : fact-checking sourcé via `ResearchProvider` réel, automatisations cron, dashboard analytique complet, providers de publication externes (WordPress, Ghost), génération d'images, optimisation des anciens articles.

---

## 13. Problèmes de la spec initiale et corrections retenues

| Problème signalé | Correction |
|---|---|
| RBAC global incompatible avec le multi-domaines | `DomainMember(userId, domainId, role)` + `DomainRoleGuard` |
| `Topic.status` dupliquait `Article.status` | Topic limité à `IDEA/SELECTED/REJECTED/CONVERTED` |
| `AIJob` seul ne permet pas de rejouer une étape | `PipelineRun` → `PipelineStep` (output persisté) → `AIJob` |
| `PublicationProvider` « blog interne » circulaire | `Article` = état éditorial, `Publication` = occurrence sur une cible |
| Fact-checking IA sans sources = fausse confiance | Claims extraits en `UNVERIFIED`, `VERIFIED` impossible sans `Source` |
| Score SEO généré par IA = non reproductible | Analyseur déterministe pur ; l'IA ne fait que proposer des corrections |
| Format de contenu non tranché | Markdown canonique + AST remark, `renderedHtml` calculé à l'écriture |
| Mutations IA longues sur HTTP | Toute opération IA retourne un `PipelineRun`, suivi par polling |
| Jobs IA dans le process API | Process `worker` séparé |
| Full-text PostgreSQL avec Prisma | Colonne `tsvector` générée + index GIN via migration SQL manuelle |
| Cookies et CORS | Reverse proxy same-origin, cookies `httpOnly` `SameSite=Lax` |
| Tests E2E non déterministes avec IA réelle | `FakeAIProvider` à fixtures, utilisé en CI |
| Collision de nommage `domain` | `Source.host` |
| Page `/author/[slug]` sans champ correspondant | `User.slug` unique, plus `bio` et `avatarUrl` |
| Tri/filtre par score SEO impossible à indexer | `Article.latestSeoScore` dénormalisé, historique conservé dans `SeoReport` |

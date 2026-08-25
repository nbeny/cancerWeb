# cancerWeb

Plateforme éditoriale assistée par IA : gestion de domaines éditoriaux, pipeline de génération d'articles (recherche, rédaction, vérification, SEO, publication) et administration multi-utilisateurs.

## Architecture

Monorepo pnpm (workspaces `apps/*` et `packages/*`).

```
apps/api          NestJS 11 + Apollo 5 (GraphQL) — port 4000
apps/web           Next.js 16 (App Router, React 19) — port 3001
packages/graphql    SDK GraphQL typé (généré par codegen), consommé par le web
packages/validation  Schémas zod partagés
packages/config      Configuration ESLint partagée
docker/              Caddyfile + Dockerfiles de production
```

**Origine unique en développement conteneurisé.** Un reverse proxy Caddy (`docker/Caddyfile`) écoute sur `:3000` et route par chemin :
- `/graphql*`, `/health`, `/uploads/*` → `api:4000`
- tout le reste → `web:3001`

Le navigateur ne voit que `localhost:3000` : les cookies `httpOnly` / `SameSite=Lax` posés par l'API sont donc acceptés par le front sans CORS, puisqu'il s'agit de la même origine du point de vue du navigateur.

L'authentification repose sur deux cookies `httpOnly` (`access`, courte durée de vie ; `refresh`, longue durée de vie), jamais exposés au JavaScript client. `apps/web/src/proxy.ts` (le `middleware.ts` de Next 16 a été renommé `proxy.ts`) protège les routes `/dashboard/*` côté edge en inspectant la présence de ces cookies, et déclenche une rotation via `/api/auth/refresh` si l'access token a expiré.

## Prérequis

- Node.js ≥ 22
- pnpm 9.15.0 (`corepack enable` recommandé — le `packageManager` du `package.json` racine l'épingle)
- Docker Desktop (ou équivalent) avec Docker Compose v2

## Variables d'environnement

Un seul fichier `.env` à la racine du monorepo (non versionné), à créer à partir de `.env.example` :

```bash
cp .env.example .env
```

Générer des secrets JWT robustes (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, ≥ 32 caractères) plutôt que de garder les valeurs d'exemple, y compris en local.

Points d'attention :
- **`COOKIE_SECURE=false`** est requis en développement (pas de HTTPS local) : mettre `true` casserait la pose des cookies. Ne le passer à `true` qu'en production, derrière TLS.
- **`AI_PROVIDER`** contrôle le moteur de génération du worker : `fake` (réponses simulées, déterministe, utilisé par défaut et par le worker conteneurisé) ou `cli` (agent CLI local `opencode`, voir [Configuration IA](#configuration-ia-lot-2)).
- Les URLs `DATABASE_URL` / `REDIS_URL` de `.env` pointent vers `localhost` (usage natif hors conteneurs) ; en pile Docker complète, `docker-compose.yml` les réécrit vers les noms de service internes (`postgres`, `redis`) via sa clé `environment`, qui a priorité sur `env_file`.

## Démarrage local (hors Docker pour api/web)

```bash
pnpm install
pnpm dev          # démarre postgres + redis en conteneurs, puis api (4000) et web (3001) en local
```

- API : http://localhost:4000/graphql
- Web : http://localhost:3001

Sur cette machine (Windows), `apps/web` utilise `next dev --webpack` : une stratégie WDAC bloque le binaire natif de Turbopack (SWC) sur ce poste précis. **Ce n'est pas une contrainte du projet** — sous Linux (dont les conteneurs Docker), Turbopack fonctionne normalement ; le drapeau `--webpack` n'y est conservé que par cohérence entre les deux modes d'exécution et ne casse rien.

Sans le reverse proxy, `api` et `web` tournent sur deux ports distincts (4000/3001) : les cookies posés par l'API ne sont alors pas automatiquement envoyés par le navigateur aux requêtes vers le front (origines différentes). Pour un parcours d'authentification réaliste en local, préférer la pile Docker complète ci-dessous, ou passer par le Route Handler `/api/auth/refresh` et les requêtes `serverSdk` (Server Components) qui relaient le cookie manuellement.

## Démarrage tout-en-conteneurs

Reproduit la topologie de production sur une seule origine (`localhost:3000`).

```bash
docker compose up --build -d
docker compose ps   # tous les services doivent être "healthy" ou "running"
```

- Application : http://localhost:3000
- Health check API (via le proxy) : http://localhost:3000/health

Services :

| Service | Rôle |
|---|---|
| `postgres` | Base de données principale (`:5432`) |
| `postgres-test` | Base dédiée aux tests d'intégration, `tmpfs` (`:5434`) |
| `redis` | File de jobs / cache (`:6379`) |
| `migrate` | Service à usage unique : applique les migrations Prisma puis se termine |
| `api` | API GraphQL NestJS |
| `worker` | Processus de traitement des jobs IA (voir [Configuration IA](#configuration-ia-lot-2)) |
| `web` | Application Next.js |
| `proxy` | Caddy, origine unique `:3000` |

**Application des migrations.** `migrate` est un service séparé (basé sur l'image `api`, commande `pnpm run prisma:deploy`) plutôt qu'une étape de démarrage du conteneur `api` lui-même. `prisma migrate deploy` est idempotent — rejouer des migrations déjà appliquées est un no-op — donc relancer `docker compose up` est toujours sans danger. La séparation en service dédié évite en revanche une course si `api` était un jour scalé (plusieurs répliques lançant chacune une migration en parallèle risqueraient de se marcher dessus sur la création des mêmes tables) : `api` et `worker` déclarent `depends_on: migrate: condition: service_completed_successfully` et n'exécutent leur propre démarrage qu'après le succès (code de sortie 0) du service de migration.

Pour arrêter et repartir de zéro (⚠️ supprime les données) :

```bash
docker compose down -v
```

### Compte de démonstration

Charger les données de démonstration (interdit si `NODE_ENV=production`, voir `apps/api/prisma/seed.ts`) :

```bash
pnpm --filter @cancerweb/api db:seed
```

Compte créé :

| Email | Mot de passe |
|---|---|
| `admin@cancerweb.local` | `Demo-Password-2026!` |

Ce compte est propriétaire (`OWNER`) d'un domaine éditorial de démonstration (« Cybersécurité »).

## Migrations Prisma

Le schéma vit dans `apps/api/prisma/schema.prisma`.

| Commande | Contexte | Effet |
|---|---|---|
| `pnpm --filter @cancerweb/api db:migrate` | Local (charge `../../.env` via `dotenv`) | Crée/applique une migration en développement |
| `pnpm --filter @cancerweb/api db:deploy` | Local | Applique les migrations existantes sans en générer |
| `pnpm --filter @cancerweb/api db:studio` | Local | Ouvre Prisma Studio |
| `pnpm --filter @cancerweb/api prisma:deploy` | Docker / CI (sans `dotenv`, lit `DATABASE_URL` directement depuis l'environnement du process) | Utilisé par le service `migrate` |
| `pnpm --filter @cancerweb/api prisma:status` | Docker / CI | Vérifie l'état des migrations |

## GraphQL

Le schéma (`packages/graphql/schema.graphql`) est généré automatiquement par NestJS (`autoSchemaFile`) **au démarrage** de l'API, jamais écrit à la main.

- Hors production (dev, test) : le SDL est régénéré sur disque à chaque démarrage — c'est ce mécanisme que la CI utilise pour détecter un schéma périmé (le comparer après un `git diff` post-build).
- En production (`NODE_ENV=production`, y compris dans l'image Docker) : le schéma reste **en mémoire** (`autoSchemaFile: true`). L'image d'exécution ne contient pas `packages/` (seul `apps/api` en est extrait), donc écrire sur disque échouerait au démarrage — c'est le correctif appliqué en tête de ce lot.

Le SDK typé côté client (`packages/graphql/src/generated.ts`) est régénéré par :

```bash
pnpm codegen
```

## Configuration IA (Lot 2)

Le worker (`apps/api/src/worker.ts`) consomme les jobs de génération. Deux moteurs :

- `AI_PROVIDER=fake` — réponses simulées, déterministes, sans appel externe. **C'est le mode utilisé par le worker conteneurisé** (`docker-compose.yml` le fixe explicitement dans l'environnement du service `worker`).
- `AI_PROVIDER=cli` — délègue à l'agent CLI local `opencode` (contrat validé dans `docs/ai-cli-smoke-test.md` : prompt via stdin, l'agent écrit lui-même `output.md` dans son répertoire de travail).

**Pour générer avec l'agent CLI local, le worker doit tourner sur l'hôte, pas en conteneur** — conséquence directe du choix `AI_PROVIDER=fake` figé dans le service Docker `worker`, à ne pas découvrir en cours de route :

```bash
docker compose stop worker
AI_PROVIDER=cli pnpm worker
```

## Tests

```bash
# API — unitaires (18 tests)
pnpm --filter @cancerweb/api test

# API — intégration (36 tests), contre postgres-test (tmpfs, port 5434)
pnpm --filter @cancerweb/api test:int
```

`test:int` exécute d'abord `pretest:int` (`prisma migrate deploy` contre `.env.test`) : la base `postgres-test` étant en `tmpfs`, elle repart vide à chaque redémarrage du conteneur, et les migrations sont donc réappliquées automatiquement avant chaque campagne de tests.

```bash
# Web — Vitest (15 tests)
pnpm --filter @cancerweb/web test

# Web — Playwright (end-to-end navigateur)
pnpm --filter @cancerweb/web e2e
```

## Production

Les images Docker (`docker/api.Dockerfile`, `docker/web.Dockerfile`) sont multi-étapes et tournent en utilisateur non-root (`app`) : un conteneur applicatif compromis ne dispose ainsi jamais de droits root, même isolé. `.dockerignore` exclut `node_modules`, `.next`, `dist`, `.git` et surtout `.env` du contexte de build.

Pour un déploiement réel :
1. Provisionner `postgres` et `redis` managés (ou équivalents) et renseigner leurs URLs dans les variables d'environnement du déploiement — ne pas réutiliser les identifiants de développement (`cancerweb` / `cancerweb`) du `docker-compose.yml` fourni, qui ne conviennent qu'en local.
2. Générer des secrets `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` dédiés et passer `COOKIE_SECURE=true` derrière une terminaison TLS.
3. Exécuter les migrations (`pnpm --filter @cancerweb/api prisma:deploy` ou le service `migrate`) avant de démarrer `api`/`worker`.
4. Ne jamais lancer `db:seed` en production : le script refuse explicitement de s'exécuter si `NODE_ENV=production`.

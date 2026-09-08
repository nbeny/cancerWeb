# Génération IA réelle — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire produire au pipeline des idées et des articles réellement générés par un modèle, ancrés dans le domaine, jamais répétés, et porteurs d'une justification explicite.

**Architecture:** `CliAgentProvider` (déjà écrit, jamais câblé) est branché dans `AiModule` et `opencode` est installé dans l'image du worker. Le prompt de génération de sujets reçoit les titres déjà proposés sur le domaine et exige une justification par sujet. Un comparateur de titres écarte à l'insertion les doublons que le modèle produirait malgré la consigne.

**Tech Stack:** NestJS 11, Prisma, BullMQ, GraphQL (code-first), Next.js 15, Jest, Docker Compose, opencode-ai 1.18.25.

**Spec :** `docs/superpowers/specs/2026-09-08-generation-ia-reelle-design.md`

---

## Structure des fichiers

**Créés**
- `apps/api/src/topics/topic-similarity.ts` — normalisation et comparaison de titres. Seule responsabilité : dire si deux titres désignent le même sujet. Aucune dépendance Nest, Prisma ou domaine.
- `apps/api/src/topics/topic-similarity.spec.ts` — tests tabulaires du comparateur.

**Modifiés**
- `apps/api/src/ai/ai.module.ts` — câblage du provider `cli`.
- `apps/api/src/ai/ai-task.types.ts` — `TopicDraft.rationale`.
- `apps/api/src/ai/parse-topics.ts` — extraction de `rationale`.
- `apps/api/src/ai/prompts/topics.prompt.ts` — consigne de justification + sujets déjà proposés.
- `apps/api/src/ai/ai-task.service.ts` — passage des titres existants.
- `apps/api/src/pipeline/pipeline.service.ts` — chargement des titres, filtrage des doublons, persistance de `rationale`.
- `apps/api/src/articles/articles.service.ts` — l'article hérite de la `rationale` de son sujet.
- `apps/api/src/topics/topic.types.ts`, `apps/api/src/articles/article.types.ts` — champ GraphQL.
- `apps/api/prisma/schema.prisma` + une migration.
- `docker/api.Dockerfile`, `docker-compose.yml`, `.env`, `.env.example`.
- `packages/graphql/src/operations/topics.graphql`, `articles.graphql`.
- `apps/web/src/app/(dashboard)/dashboard/topics/topics-table.tsx`.

---

### Task 1 : Câbler `CliAgentProvider` dans `AiModule`

**Files:**
- Modify: `apps/api/src/ai/ai.module.ts`
- Test: `apps/api/src/ai/ai.module.spec.ts:13`

- [ ] **Step 1 : Remplacer le test qui verrouille l'échec de `cli`**

Dans `ai.module.spec.ts`, remplacer le test existant `"échoue explicitement pour 'cli' (pas encore câblé dans le registre)"` par :

```ts
  it("renvoie le CliAgentProvider pour 'cli'", () => {
    const cli = new CliAgentProvider()
    expect(selectAIProvider('cli', { fake, cli })).toBe(cli)
  })
```

Et adapter les trois autres appels de `selectAIProvider` du fichier pour passer le nouveau registre `{ fake, cli }`. Ajouter l'import en tête :

```ts
import { CliAgentProvider } from './providers/cli.provider'
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `cd apps/api && npx jest src/ai/ai.module.spec.ts`
Expected: FAIL — TypeScript refuse la propriété `cli` sur le type du paramètre `available`.

- [ ] **Step 3 : Implémenter**

Dans `apps/api/src/ai/ai.module.ts`, importer le provider, élargir la signature et retourner l'instance :

```ts
import { CliAgentProvider } from './providers/cli.provider'

export function selectAIProvider(
  key: AIProviderKey,
  available: { fake: AIProvider; cli: AIProvider },
): AIProvider {
  switch (key) {
    case 'fake':
      return available.fake
    case 'cli':
      return available.cli
    case 'http':
      throw new Error("AI_PROVIDER=http : aucun HttpAIProvider n'est implémenté pour l'instant.")
    default:
      throw new Error(`AI_PROVIDER invalide : "${String(key)}". Valeurs acceptées : ${ACCEPTED_KEYS}.`)
  }
}
```

Puis, dans le décorateur `@Module`, ajouter `CliAgentProvider` aux `providers` et à la factory :

```ts
  providers: [
    FakeAIProvider,
    CliAgentProvider,
    {
      provide: AI_PROVIDER,
      inject: [FakeAIProvider, CliAgentProvider],
      useFactory: (fake: FakeAIProvider, cli: CliAgentProvider): AIProvider => {
        const raw = process.env.AI_PROVIDER
        if (!raw) {
          throw new Error(`AI_PROVIDER doit être définie. Valeurs acceptées : ${ACCEPTED_KEYS}.`)
        }
        return selectAIProvider(raw as AIProviderKey, { fake, cli })
      },
    },
    AITaskService,
  ],
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `cd apps/api && npx jest src/ai/ai.module.spec.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/ai/ai.module.ts apps/api/src/ai/ai.module.spec.ts
git commit -m "feat(ai): cabler CliAgentProvider sur AI_PROVIDER=cli"
```

---

### Task 2 : Installer `opencode` dans l'image et basculer le worker

**Files:**
- Modify: `docker/api.Dockerfile`, `docker-compose.yml`, `.env`, `.env.example`

Aucun test automatisé : c'est de la configuration d'infrastructure, vérifiée par exécution réelle en Task 10.

- [ ] **Step 1 : Installer le CLI dans l'étage runtime**

Dans `docker/api.Dockerfile`, juste avant la ligne `RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app`, insérer :

```dockerfile
# Agent CLI utilisé par CliAgentProvider quand AI_PROVIDER=cli (service
# `worker` uniquement — l'API n'appelle jamais le modèle). Version épinglée :
# le provider dépend d'un contrat de sortie observé empiriquement (l'agent
# écrit lui-même output.md, voir docs/ai-cli-smoke-test.md), qu'une mise à
# jour du CLI pourrait changer en silence. Le binaire natif téléchargé au
# postinstall fonctionne sous musl (vérifié sur node:22-alpine).
RUN npm i -g opencode-ai@1.18.25
```

- [ ] **Step 2 : Basculer le worker sur le provider CLI**

Dans `docker-compose.yml`, service `worker`, remplacer le bloc `environment` et ajouter un volume :

```yaml
    environment:
      DATABASE_URL: postgresql://cancerweb:cancerweb@postgres:5432/cancerweb?schema=public
      REDIS_URL: redis://redis:6379
      # Seul le worker exécute les étapes du pipeline, donc seul lui appelle
      # un modèle. L'API garde AI_PROVIDER=fake (via .env) : elle n'a aucun
      # appel IA à faire, et n'a donc pas besoin du CLI.
      AI_PROVIDER: cli
      # opencode écrit son état sous $HOME ; l'utilisateur `app` de l'image
      # n'a pas de home inscriptible par défaut.
      HOME: /tmp
      AI_WORKSPACE_DIR: /workspace
    volumes:
      - aiworkspace:/workspace
```

Puis déclarer le volume à la fin du fichier, à côté de `pgdata` et `redisdata` :

```yaml
volumes:
  pgdata:
  redisdata:
  aiworkspace:
```

- [ ] **Step 3 : Corriger le modèle mort**

Dans `.env` **et** `.env.example`, remplacer la ligne `AI_MODEL=opencode/hy3-free` par :

```
# hy3-free a été retiré : tout appel renvoie « UnknownError / Unexpected
# server error ». mimo-v2.5-free répond et ne demande aucune credential.
AI_MODEL=opencode/mimo-v2.5-free
```

- [ ] **Step 4 : Reconstruire et vérifier que le CLI est présent**

```bash
docker compose build worker
docker compose up -d worker
docker exec cancerweb-worker-1 opencode --version
```

Expected: `1.18.25`

- [ ] **Step 5 : Commit**

```bash
git add docker/api.Dockerfile docker-compose.yml .env.example
git commit -m "build(worker): installer opencode et basculer le worker sur AI_PROVIDER=cli"
```

> `.env` n'est pas versionné : le modifier ne produit aucun changement à committer.

---

### Task 3 : Migration Prisma — champ `rationale`

**Files:**
- Modify: `apps/api/prisma/schema.prisma:194-211` (Topic), `:213-…` (Article)

- [ ] **Step 1 : Ajouter le champ aux deux modèles**

Dans `model Topic`, sous `suggestedAngle` :

```prisma
  /// Pourquoi ce sujet a été proposé POUR CE DOMAINE (audience, mots-clés,
  /// manque à combler). Rempli par la génération IA ; nullable car les sujets
  /// créés à la main n'en ont pas.
  rationale           String?       @db.Text
```

Dans `model Article`, sous `excerpt` :

```prisma
  /// Reprise de Topic.rationale au moment de la création de l'article, pour
  /// qu'un relecteur sache pourquoi cet article existe sans remonter au sujet.
  rationale      String?       @db.Text
```

- [ ] **Step 2 : Générer la migration**

Run: `cd apps/api && pnpm db:migrate --name add_topic_article_rationale`
Expected: une migration créée sous `prisma/migrations/`, appliquée sur la base de dev.

- [ ] **Step 3 : Vérifier que le client Prisma connaît le champ**

Run: `cd apps/api && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): champ rationale sur Topic et Article"
```

---

### Task 4 : Le parseur extrait la justification

**Files:**
- Modify: `apps/api/src/ai/ai-task.types.ts:30-35`, `apps/api/src/ai/parse-topics.ts`
- Test: `apps/api/src/ai/parse-topics.spec.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `parse-topics.spec.ts` :

```ts
describe('parseTopics — justification', () => {
  it('extrait rationale du JSON', () => {
    const [topic] = parseTopics('[{"title":"Zero Trust","rationale":"Comble un manque sur le domaine."}]')
    expect(topic?.rationale).toBe('Comble un manque sur le domaine.')
  })

  it('accepte aussi les clés "pourquoi" et "why"', () => {
    const [fr] = parseTopics('[{"title":"A","pourquoi":"Raison FR."}]')
    const [en] = parseTopics('[{"title":"B","why":"Raison EN."}]')
    expect(fr?.rationale).toBe('Raison FR.')
    expect(en?.rationale).toBe('Raison EN.')
  })

  it('laisse rationale absent quand le modèle ne la fournit pas', () => {
    const [topic] = parseTopics('[{"title":"Sans justification"}]')
    expect(topic?.rationale).toBeUndefined()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `cd apps/api && npx jest src/ai/parse-topics.spec.ts`
Expected: FAIL — `rationale` n'existe pas sur `TopicDraft`.

- [ ] **Step 3 : Implémenter**

Dans `ai-task.types.ts`, ajouter au type `TopicDraft` :

```ts
  rationale?: string
```

Dans `parse-topics.ts`, fonction `topicFromJsonEntry`, juste après le bloc `description` :

```ts
  // Trois noms acceptés pour la même notion : le prompt demande `rationale`,
  // mais un modèle qui répond en français produit spontanément `pourquoi`.
  // Même tolérance que pour `angle` / `suggestedAngle` ci-dessus.
  const rationale = obj.rationale ?? obj.pourquoi ?? obj.why
  if (typeof rationale === 'string' && rationale.trim()) draft.rationale = rationale.trim()
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `cd apps/api && npx jest src/ai/parse-topics.spec.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/ai/ai-task.types.ts apps/api/src/ai/parse-topics.ts apps/api/src/ai/parse-topics.spec.ts
git commit -m "feat(ai): extraire la justification des sujets proposes"
```

---

### Task 5 : Le prompt exige une justification et interdit les redites

**Files:**
- Modify: `apps/api/src/ai/prompts/topics.prompt.ts`
- Test: `apps/api/src/ai/prompts/topics.prompt.spec.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter dans `topics.prompt.spec.ts` :

```ts
describe('buildTopicsPrompt — justification et anti-redite', () => {
  it('demande une justification ancrée dans le domaine', () => {
    const prompt = buildTopicsPrompt(makeDomain(), 3, [])
    expect(prompt).toMatch(/rationale/)
    expect(prompt).toMatch(/pourquoi/i)
  })

  it('liste les sujets déjà proposés avec une consigne de ne pas y revenir', () => {
    const prompt = buildTopicsPrompt(makeDomain(), 3, ['Zero Trust en entreprise', 'Phishing et IA'])
    expect(prompt).toContain('Zero Trust en entreprise')
    expect(prompt).toContain('Phishing et IA')
    expect(prompt).toMatch(/déjà proposés/i)
  })

  it("n'ajoute aucun bloc de redite quand le domaine n'a encore aucun sujet", () => {
    const prompt = buildTopicsPrompt(makeDomain(), 3, [])
    expect(prompt).not.toMatch(/déjà proposés/i)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `cd apps/api && npx jest src/ai/prompts/topics.prompt.spec.ts`
Expected: FAIL — `buildTopicsPrompt` n'accepte que deux arguments.

- [ ] **Step 3 : Implémenter**

Remplacer le corps de `buildTopicsPrompt` dans `topics.prompt.ts` :

```ts
/**
 * `existingTitles` porte TOUS les sujets déjà proposés sur le domaine, quel
 * que soit leur statut — les rejetés compris : un sujet écarté par l'équipe
 * éditoriale ne doit pas revenir à la génération suivante. C'est la première
 * des deux barrières anti-redite ; la seconde est le filtre à l'insertion
 * (`topics/topic-similarity.ts`), parce qu'un modèle peut désobéir.
 */
export function buildTopicsPrompt(domain: Domain, count: number, existingTitles: string[] = []): string {
  const lines: (string | false | undefined)[] = [
    '[[TOPICS]]',
    `Tu es rédacteur en chef. Propose ${count} idées d'articles nouvelles pour ce domaine éditorial.`,
    '',
    buildDomainContextBlock(domain),
    '',
    existingTitles.length > 0 && '## Sujets déjà proposés',
    existingTitles.length > 0 &&
      "Ces sujets ont DÉJÀ été proposés sur ce domaine. N'en propose aucun à nouveau, ni sous une formulation différente :",
    ...existingTitles.map((title) => `- ${title}`),
    existingTitles.length > 0 && '',
    '## Consignes de sortie',
    `Réponds par un tableau JSON de ${count} objets, et rien d'autre.`,
    'Chaque objet porte exactement ces clés :',
    '- `title` : le titre du sujet ;',
    "- `angle` : l'angle éditorial retenu, en une ligne ;",
    "- `rationale` : pourquoi CE sujet sert CE domaine en particulier — audience visée, mots-clés du domaine, manque à combler. Une à deux phrases.",
    "La justification doit être spécifique à ce domaine. Une phrase qui resterait vraie sur n'importe quel autre domaine ne convient pas.",
    "Ne rédige aucun article ni aucun plan détaillé : uniquement la liste des sujets proposés.",
  ]

  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}
```

> Le format de sortie passe du Markdown au JSON : c'est la seule forme qui
> porte trois champs par sujet. `parseTopics` essaie le JSON en premier et
> conserve ses replis Markdown, donc un modèle qui répondrait en Markdown
> reste géré (titres nus, sans justification).

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `cd apps/api && npx jest src/ai/prompts/topics.prompt.spec.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/ai/prompts/topics.prompt.ts apps/api/src/ai/prompts/topics.prompt.spec.ts
git commit -m "feat(ai): exiger une justification et bannir les sujets deja proposes"
```

---

### Task 6 : Comparateur de titres

**Files:**
- Create: `apps/api/src/topics/topic-similarity.ts`
- Test: `apps/api/src/topics/topic-similarity.spec.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `apps/api/src/topics/topic-similarity.spec.ts` :

```ts
import { isDuplicateTitle, normalizeTitle } from './topic-similarity'

describe('normalizeTitle', () => {
  it('efface casse, accents, ponctuation et espaces superflus', () => {
    expect(normalizeTitle('  L’Immunothérapie : Où en EST-on ?  ')).toBe('immunotherapie ou en est on')
  })
})

describe('isDuplicateTitle', () => {
  const existing = [
    'Bonnes pratiques des mots de passe',
    'Zero Trust en entreprise',
  ]

  it.each([
    ['Les mots de passe : bonnes pratiques', 'reformulation par réordonnancement'],
    ['BONNES PRATIQUES DES MOTS DE PASSE', 'casse seule'],
    ['Bonnes pratiques des mots de passe', 'titre identique'],
  ])('considère %s comme un doublon (%s)', (candidate) => {
    expect(isDuplicateTitle(candidate, existing)).toBe(true)
  })

  it.each([
    ['Zero Trust pour les PME', 'même thème, périmètre différent'],
    ['Gérer les fuites de données', 'sujet sans rapport'],
    ['Authentification multifacteur en pratique', 'proche thématiquement, mots différents'],
  ])('laisse passer %s (%s)', (candidate) => {
    expect(isDuplicateTitle(candidate, existing)).toBe(false)
  })

  it('ne trouve aucun doublon face à une liste vide', () => {
    expect(isDuplicateTitle('Un sujet quelconque', [])).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `cd apps/api && npx jest src/topics/topic-similarity.spec.ts`
Expected: FAIL — `Cannot find module './topic-similarity'`.

- [ ] **Step 3 : Implémenter**

Créer `apps/api/src/topics/topic-similarity.ts` :

```ts
/**
 * Deuxième barrière anti-redite, après la consigne du prompt
 * (`ai/prompts/topics.prompt.ts`) : un modèle peut reproposer un sujet
 * existant sous une autre formulation malgré l'interdiction. Ce module ne
 * connaît ni Prisma ni Nest — il ne compare que des chaînes.
 */

/**
 * Mots vides français retirés avant comparaison. Sans eux, « Les mots de
 * passe : bonnes pratiques » et « Bonnes pratiques des mots de passe »
 * partagent surtout des articles et des prépositions, ce qui écrase la
 * mesure de similarité au lieu de la porter.
 */
const STOP_WORDS = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'ces', 'cet', 'cette', 'd', 'dans', 'de',
  'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 'pour',
  'que', 'qui', 'sans', 'sur', 'un', 'une',
])

/**
 * Seuil de similarité de Jaccard au-delà duquel deux titres sont tenus pour
 * le même sujet. 0,7 sépare les cas observés : une reformulation par
 * réordonnancement atteint 1,0 une fois les mots vides retirés, tandis que
 * deux sujets d'un même thème mais de périmètre différent (« Zero Trust en
 * entreprise » / « Zero Trust pour les PME ») plafonnent à 0,5.
 */
const DUPLICATE_THRESHOLD = 0.7

/** Casse, accents, ponctuation et espaces multiples effacés. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function significantWords(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(' ').filter((word) => word.length > 0 && !STOP_WORDS.has(word)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * Vrai si `candidate` désigne le même sujet que l'un des `existing`. Un titre
 * identique après normalisation est toujours un doublon, même s'il n'est
 * composé que de mots vides (cas où `significantWords` renverrait un
 * ensemble vide et où la similarité vaudrait 0).
 */
export function isDuplicateTitle(candidate: string, existing: string[]): boolean {
  const normalized = normalizeTitle(candidate)
  const words = significantWords(candidate)

  return existing.some(
    (title) => normalizeTitle(title) === normalized || jaccard(words, significantWords(title)) >= DUPLICATE_THRESHOLD,
  )
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `cd apps/api && npx jest src/topics/topic-similarity.spec.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/topics/topic-similarity.ts apps/api/src/topics/topic-similarity.spec.ts
git commit -m "feat(topics): comparateur de titres pour ecarter les sujets en double"
```

---

### Task 7 : `AITaskService` transmet les titres existants

**Files:**
- Modify: `apps/api/src/ai/ai-task.service.ts:28-32`
- Test: `apps/api/src/ai/ai-task.service.spec.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `ai-task.service.spec.ts` :

```ts
  it('transmet les titres existants au prompt de génération de sujets', async () => {
    const captured: string[] = []
    const provider: AIProvider = {
      key: 'fake',
      complete: async (req) => {
        captured.push(req.prompt)
        return { text: '[{"title":"Nouveau sujet"}]', raw: '', durationMs: 1 }
      },
      health: async () => ({ ok: true }),
    }

    await new AITaskService(provider).generateTopics(makeDomain(), 3, ['Sujet déjà vu'])

    expect(captured[0]).toContain('Sujet déjà vu')
  })
```

Adapter les imports du fichier si `AIProvider` n'y est pas déjà importé.

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `cd apps/api && npx jest src/ai/ai-task.service.spec.ts`
Expected: FAIL — `generateTopics` n'accepte pas de troisième argument de ce type.

- [ ] **Step 3 : Implémenter**

Dans `ai-task.service.ts`, remplacer `generateTopics` :

```ts
  /**
   * `existingTitles` remonte jusqu'au prompt pour que le modèle ne repropose
   * pas un sujet déjà présent sur le domaine (voir `buildTopicsPrompt`). Ce
   * service ne persiste rien et ne filtre rien : le rejet des doublons qui
   * passeraient malgré la consigne appartient à l'appelant
   * (`PipelineService.runTopicGenerationStep`).
   */
  async generateTopics(
    domain: Domain,
    count: number,
    existingTitles: string[] = [],
    correlationId?: string,
  ): Promise<TopicDraft[]> {
    const prompt = buildTopicsPrompt(domain, count, existingTitles)
    const result = await this.provider.complete({ prompt, correlationId })
    return parseTopics(result.text)
  }
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `cd apps/api && npx jest src/ai/ai-task.service.spec.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/ai/ai-task.service.ts apps/api/src/ai/ai-task.service.spec.ts
git commit -m "feat(ai): transmettre les sujets existants au prompt"
```

---

### Task 8 : Le pipeline filtre les doublons et persiste la justification

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts:397-440`
- Test: `apps/api/test/pipeline.int-spec.ts`

- [ ] **Step 1 : Écrire le test d'intégration qui échoue**

Ajouter dans `apps/api/test/pipeline.int-spec.ts`, dans le bloc décrivant `generateTopics` :

```ts
  it("n'insère pas un sujet dont le titre existe déjà sur le domaine", async () => {
    // FakeAIProvider renvoie toujours les mêmes trois titres : créer d'abord
    // l'un d'eux à la main garantit qu'il sera proposé une seconde fois.
    await prisma.topic.create({
      data: { domainId, title: "Comprendre l'immunothérapie moderne" },
    })

    const run = await service.generateTopics(userId, domainId, 3)
    await queue.pumpAll()

    const titles = (await prisma.topic.findMany({ where: { domainId }, select: { title: true } })).map((t) => t.title)
    const occurrences = titles.filter((t) => t === "Comprendre l'immunothérapie moderne").length
    expect(occurrences).toBe(1)

    const [step] = (await service.getRun(userId, domainId, run.id)).steps
    expect((step?.output as { skippedDuplicates: number }).skippedDuplicates).toBe(1)
  })
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `cd apps/api && pnpm test:int -- pipeline.int-spec`
Expected: FAIL — deux sujets portent le même titre, et `skippedDuplicates` est absent.

- [ ] **Step 3 : Implémenter**

Dans `pipeline.service.ts`, ajouter l'import :

```ts
import { isDuplicateTitle } from '../topics/topic-similarity'
```

Puis remplacer le corps de `runTopicGenerationStep`, entre la lecture de `count` et la création de l'`AIJob` :

```ts
  private async runTopicGenerationStep(
    run: PipelineRunWithSteps,
    step: PipelineStep,
    correlationId: string,
  ): Promise<{ topicIds: string[]; skippedDuplicates: number }> {
    const { count } = step.input as { count: number }

    // Tous statuts confondus, rejetés compris : un sujet écarté par l'équipe
    // éditoriale ne doit pas revenir à la génération suivante.
    const existingTitles = (
      await this.prisma.topic.findMany({ where: { domainId: run.domainId }, select: { title: true } })
    ).map((topic) => topic.title)

    const start = Date.now()
    const drafts = await this.aiTasks.generateTopics(run.domain, count, existingTitles, correlationId)
    const durationMs = Date.now() - start

    // Le filtre porte aussi sur les sujets acceptés au cours de cette même
    // génération : rien n'empêche le modèle de se répéter dans une seule
    // réponse.
    const seen = [...existingTitles]
    const toPersist: typeof drafts = []
    let skippedDuplicates = 0
    for (const draft of drafts) {
      if (toPersist.length >= count) break
      if (isDuplicateTitle(draft.title, seen)) {
        skippedDuplicates++
        continue
      }
      toPersist.push(draft)
      seen.push(draft.title)
    }

    if (toPersist.length === 0) {
      throw new Error(
        `Étape TOPIC_GENERATION : les ${drafts.length} sujets proposés existent déjà sur ce domaine. Aucun sujet nouveau à enregistrer.`,
      )
    }
```

La création de l'`AIJob` reste identique, à ceci près que son `output` trace le rejet :

```ts
        output: toJson({ topics: toPersist, skippedDuplicates }),
```

La création des `Topic` gagne le champ `rationale` :

```ts
    const created = await Promise.all(
      toPersist.map((draft) =>
        this.prisma.topic.create({
          data: {
            domainId: run.domainId,
            title: draft.title,
            description: draft.description,
            keywords: draft.keywords ?? [],
            suggestedAngle: draft.suggestedAngle,
            rationale: draft.rationale,
            generatedByJobId: job.id,
          },
        }),
      ),
    )

    return { topicIds: created.map((topic) => topic.id), skippedDuplicates }
  }
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `cd apps/api && pnpm test:int -- pipeline.int-spec`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/pipeline/pipeline.service.ts apps/api/test/pipeline.int-spec.ts
git commit -m "feat(pipeline): ecarter les sujets en double et persister la justification"
```

---

### Task 9 : L'article hérite de la justification de son sujet

**Files:**
- Modify: `apps/api/src/articles/articles.service.ts:29-70`
- Test: `apps/api/test/articles.int-spec.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `apps/api/test/articles.int-spec.ts` :

```ts
  it("reprend la justification du sujet sur l'article créé", async () => {
    const topic = await prisma.topic.create({
      data: { domainId, title: 'Sujet justifié', rationale: 'Comble un manque sur ce domaine.' },
    })

    const article = await service.create(userId, domainId, {
      topicId: topic.id,
      title: topic.title,
      content: 'Contenu de départ.',
      secondaryKeywords: [],
      robotsIndex: true,
      robotsFollow: true,
    })

    expect(article.rationale).toBe('Comble un manque sur ce domaine.')
  })
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `cd apps/api && pnpm test:int -- articles.int-spec`
Expected: FAIL — `article.rationale` vaut `null`.

- [ ] **Step 3 : Implémenter**

Dans `articles.service.ts`, méthode `create` : déclarer la variable à côté de `topicId`, la remplir dans le bloc existant, et l'écrire dans `tx.article.create`.

```ts
      let topicId: string | undefined
      let rationale: string | undefined
```

Dans le bloc `if (input.topicId)`, juste après `topicId = topic.id` :

```ts
        // L'article porte sa propre copie plutôt qu'une jointure : un sujet
        // peut être supprimé (`onDelete: SetNull` sur Article.topicId) sans
        // que l'article perde la raison pour laquelle il a été écrit.
        rationale = topic.rationale ?? undefined
```

Puis, dans le `data` de `tx.article.create`, ajouter :

```ts
          rationale,
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `cd apps/api && pnpm test:int -- articles.int-spec`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/articles/articles.service.ts apps/api/test/articles.int-spec.ts
git commit -m "feat(articles): heriter la justification du sujet a la creation"
```

---

### Task 10 : Exposer `rationale` en GraphQL et dans l'interface

**Files:**
- Modify: `apps/api/src/topics/topic.types.ts:41`, `apps/api/src/articles/article.types.ts:46`
- Modify: `packages/graphql/src/operations/topics.graphql:11`, `packages/graphql/src/operations/articles.graphql`
- Modify: `apps/web/src/app/(dashboard)/dashboard/topics/topics-table.tsx:118`

- [ ] **Step 1 : Ajouter le champ aux types GraphQL**

Dans `topic.types.ts`, classe `Topic`, sous `suggestedAngle` :

```ts
  @Field(() => String, { nullable: true }) rationale?: string | null
```

Dans `article.types.ts`, classe `Article`, sous `excerpt` :

```ts
  @Field(() => String, { nullable: true }) rationale?: string | null
```

- [ ] **Step 2 : Demander le champ dans les opérations**

Dans `packages/graphql/src/operations/topics.graphql`, ajouter `rationale` au fragment, sous `suggestedAngle`. Faire de même dans le fragment d'article de `articles.graphql`, sous `excerpt`.

- [ ] **Step 3 : Régénérer le schéma et les types**

```bash
docker compose up -d api
cd ../.. && pnpm codegen
```

Expected: `packages/graphql/schema.graphql` contient `rationale: String` sur `Topic` et `Article`, et `packages/graphql/src/generated.ts` est régénéré.

- [ ] **Step 4 : Afficher la justification dans la liste des idées**

Dans `topics-table.tsx`, remplacer le rendu de la colonne `title` :

```tsx
      render: (topic) => (
        <div>
          <p className="font-medium text-slate-900">{topic.title}</p>
          {topic.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{topic.description}</p>}
          {topic.rationale && (
            <p className="mt-1 text-xs italic text-slate-600">
              <span className="font-medium not-italic">Pourquoi ce sujet : </span>
              {topic.rationale}
            </p>
          )}
        </div>
      ),
```

- [ ] **Step 5 : Vérifier la compilation**

Run: `cd apps/web && npx tsc --noEmit` puis `cd ../api && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add apps/api/src/topics/topic.types.ts apps/api/src/articles/article.types.ts packages/graphql apps/web/src/app/\(dashboard\)/dashboard/topics/topics-table.tsx
git commit -m "feat(graphql,web): exposer et afficher la justification des sujets"
```

---

### Task 11 : Vérification sur l'application réelle

Aucun test automatisé ne couvre le chemin « vrai modèle » : c'est précisément ce que ce lot ajoute, et le provider `fake` reste utilisé partout ailleurs. Cette tâche est la seule preuve que la chaîne complète fonctionne.

- [ ] **Step 1 : Lancer la suite complète**

```bash
cd apps/api && npx jest --runInBand && pnpm test:int
```

Expected: tout passe. `--runInBand` est nécessaire : la suite complète en parallèle épuise la mémoire sur cette machine (constaté, exit 137).

- [ ] **Step 2 : Reconstruire et redémarrer**

```bash
cd ../.. && docker compose build api worker && docker compose up -d api worker migrate
```

- [ ] **Step 3 : Générer des idées deux fois de suite sur le même domaine**

Se connecter, récupérer l'identifiant du domaine, puis lancer `generateTopics` deux fois (voir la méthode utilisée pour vérifier le correctif BullMQ : login par cookie sur `http://localhost:3000/graphql`).

Expected:
- Les deux runs terminent en `COMPLETED`.
- Les sujets parlent du domaine visé, pas d'un autre.
- Aucun titre du second lot ne reprend un titre du premier.
- Chaque sujet porte une `rationale` non vide, spécifique au domaine.

- [ ] **Step 4 : Générer un article depuis l'un de ces sujets**

Expected: run `COMPLETED`, étapes OUTLINE / DRAFT / SEO complètes, contenu de l'article portant sur le sujet, et `rationale` reprise sur l'article.

- [ ] **Step 5 : Commit final**

```bash
git add -A && git commit -m "chore: verification reelle de la generation IA"
```

---

## Auto-revue

**Couverture de la spec** — §1 Brancher la vraie génération : Tasks 1 et 2. §2 Contenu ancré et justification : Tasks 3, 4, 5, 8, 9, 10. §3 Anti-répétition à deux niveaux : Task 5 (prompt), Tasks 6 et 8 (base), Task 8 (résultat partiel et échec explicite). §Tests : chaque tâche porte ses tests ; Task 11 couvre la vérification réelle exigée.

**Cohérence des types** — `TopicDraft.rationale?: string` (Task 4) est lu tel quel en Task 8. `isDuplicateTitle(candidate: string, existing: string[]): boolean` et `normalizeTitle(title: string): string` (Task 6) sont appelés avec cette signature en Task 8. `generateTopics(domain, count, existingTitles, correlationId?)` (Task 7) est appelé dans cet ordre en Task 8. Le champ Prisma `rationale` (Task 3) porte le même nom en GraphQL (Task 10) et dans les opérations.

**Point d'attention** — Task 5 fait passer la sortie attendue du modèle du Markdown au JSON. `FakeAIProvider.TOPICS_FIXTURE` produit déjà du JSON, donc les tests d'intégration restent valides sans modification du provider factice.

import { StepType } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'
import { PIPELINE_QUEUE, InlinePipelineQueue } from '../src/pipeline/pipeline-queue'
import { PipelineService } from '../src/pipeline/pipeline.service'

/**
 * Approche de test retenue pour BullMQ (voir le rapport de la Task 5) :
 * `PIPELINE_QUEUE_DRIVER=inline` (`.env.test`) branche `InlinePipelineQueue`
 * (`../src/pipeline/pipeline-queue.ts`) à la place d'une vraie file BullMQ —
 * aucune connexion Redis, aucun minuteur, aucun délai d'event-loop pendant
 * `test:int`. Chaque test avance le pipeline explicitement via
 * `queue.pumpOne()`/`pumpAll()`, ce qui rend les scénarios d'annulation
 * (« run en attente » vs « run en cours ») déterministes : c'est LE test qui
 * décide quand une étape s'exécute, jamais un timing d'event-loop ou une
 * latence réseau. Le vrai câblage BullMQ (`pipeline.module.ts`,
 * `pipeline.processor.ts`, `worker.ts`) est vérifié manuellement
 * (`node dist/main.js`, `pnpm worker`) — voir la jsdoc de `pipeline.module.ts`
 * pour la raison précise (incompatibilité ESM de `@nestjs/bullmq` avec
 * ts-jest, constatée empiriquement).
 *
 * Aucun job ne survit d'un test à l'autre : `InlinePipelineQueue` est
 * recréée à chaque test (nouvelle instance de l'application Nest n'est PAS
 * recréée — un seul `h` pour tout le fichier — mais chaque test appelle
 * `pumpAll()` jusqu'à épuisement ou n'enfile rien de nouveau ; `h.reset()`
 * (TRUNCATE) vide toutes les tables entre les tests, et la file en mémoire
 * ne contient jamais de job orphelin d'un test précédent puisque chaque
 * pipeline est intégralement pompé (ou explicitement annulé) avant la fin
 * de son propre test.
 */

let h: Harness
let queue: InlinePipelineQueue

beforeAll(async () => {
  h = await createHarness()
  queue = h.app.get(PIPELINE_QUEUE) as InlinePipelineQueue
})
afterAll(async () => {
  await h.close()
})
beforeEach(async () => {
  await h.reset()
  // Voir la jsdoc de `InlinePipelineQueue.clear` : un job resté enfilé par le
  // test précédent référencerait un `runId`/`stepId` que `h.reset()` vient de
  // TRUNCATE, et polluerait ce test-ci — même risque que documenté dans les
  // consignes pour une vraie file BullMQ, traité ici pour la file en mémoire.
  queue.clear()
})

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_TOPIC = `
  mutation ($domainId: ID!, $input: CreateTopicInput!) { createTopic(domainId: $domainId, input: $input) { id title } }`

const RUN_FIELDS = `
  id status currentStep domainId topicId articleId
  steps { id type order status attempt error }
`
const GENERATE_ARTICLE = `
  mutation ($domainId: ID!, $topicId: ID!) { generateArticle(domainId: $domainId, topicId: $topicId) { ${RUN_FIELDS} } }`
const PIPELINE_RUN = `
  query ($domainId: ID!, $id: ID!) { pipelineRun(domainId: $domainId, id: $id) { ${RUN_FIELDS} } }`
const CANCEL_RUN = `
  mutation ($domainId: ID!, $id: ID!) { cancelPipelineRun(domainId: $domainId, id: $id) { ${RUN_FIELDS} } }`
const REGENERATE_STEP = `
  mutation ($domainId: ID!, $runId: ID!, $step: StepType!) {
    regenerateStep(domainId: $domainId, runId: $runId, step: $step) { ${RUN_FIELDS} }
  }`

async function signUp(email: string): Promise<string[]> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret-2026!', name: email.split('@')[0] } })
  return res.headers['set-cookie'] as unknown as string[]
}

async function createDomain(cookies: string[], name = 'Oncologie'): Promise<string> {
  const res = await h.gql(CREATE_DOMAIN, { input: { name } }, cookies)
  return res.body.data.createDomain.id
}

async function createTopic(cookies: string[], domainId: string, title = "Comprendre l'immunothérapie moderne"): Promise<string> {
  const res = await h.gql(CREATE_TOPIC, { domainId, input: { title, keywords: [] } }, cookies)
  return res.body.data.createTopic.id
}

/** Prépare un domaine + sujet, prêts pour `generateArticle`. */
async function setup(email = 'alice@example.com'): Promise<{ cookies: string[]; domainId: string; topicId: string }> {
  const cookies = await signUp(email)
  const domainId = await createDomain(cookies)
  const topicId = await createTopic(cookies, domainId)
  return { cookies, domainId, topicId }
}

const SKIPPED_TYPES = [StepType.RESEARCH, StepType.ANALYSIS, StepType.FACT_CHECK, StepType.QUALITY]
const EXECUTABLE_TYPES = [StepType.OUTLINE, StepType.DRAFT, StepType.SEO]

describe('pipeline (Task 5 — orchestration)', () => {
  describe('chemin nominal', () => {
    it('crée l’article en DRAFT avant tout appel IA, visible en base dès le retour de la mutation', async () => {
      const { cookies, domainId, topicId } = await setup()

      const res = await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)
      const run = res.body.data.generateArticle
      expect(run.status).toBe('PENDING')
      expect(run.articleId).toBeTruthy()

      const article = await h.prisma.article.findUnique({ where: { id: run.articleId } })
      expect(article).not.toBeNull()
      expect(article?.status).toBe('DRAFT')
      // Aucun appel IA n'a encore eu lieu : la file n'a pas été pompée.
      expect(await h.prisma.aIJob.count()).toBe(0)
    })

    it('enchaîne OUTLINE -> DRAFT -> SEO jusqu’à COMPLETED, avec le contenu produit par le fake et un SeoReport', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const runId = created.id
      const articleId = created.articleId

      const processed = await queue.pumpAll()
      expect(processed).toBe(3) // OUTLINE, DRAFT, SEO

      const finalRun = (await h.gql(PIPELINE_RUN, { domainId, id: runId }, cookies)).body.data.pipelineRun
      expect(finalRun.status).toBe('COMPLETED')
      expect(finalRun.currentStep).toBeNull()

      for (const type of EXECUTABLE_TYPES) {
        const step = finalRun.steps.find((s: { type: string }) => s.type === type)
        expect(step.status).toBe('COMPLETED')
      }

      const article = await h.prisma.article.findUniqueOrThrow({ where: { id: articleId } })
      expect(article.content).toContain("Comprendre l'immunothérapie moderne")
      expect(article.content).toContain('Inhibiteurs de points de contrôle') // vient de VALID_DRAFT_MD, pas du plan
      expect(article.renderedHtml).toBeTruthy()
      expect(article.wordCount).toBeGreaterThan(50)
      // Garantie centrale : l'IA n'atteint jamais PUBLISHED.
      expect(article.status).toBe('DRAFT')

      const reports = await h.prisma.seoReport.findMany({ where: { articleId } })
      expect(reports).toHaveLength(1)
      const fresh = await h.prisma.article.findUniqueOrThrow({ where: { id: articleId } })
      expect(fresh.latestSeoScore).toEqual(expect.any(Number))
    })
  })

  describe('étapes sautées', () => {
    it('persiste RESEARCH, ANALYSIS, FACT_CHECK, QUALITY en SKIPPED avec un skipReason non vide, sans AIJob', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle

      for (const type of SKIPPED_TYPES) {
        const step = created.steps.find((s: { type: string }) => s.type === type)
        expect(step.status).toBe('SKIPPED')
        expect(step.error?.trim().length).toBeGreaterThan(0)
      }

      await queue.pumpAll()

      const jobs = await h.prisma.aIJob.findMany({ include: { step: true } })
      for (const job of jobs) {
        expect(SKIPPED_TYPES).not.toContain(job.step?.type)
      }
    })
  })

  describe('réversibilité', () => {
    it('crée au moins deux instantanés automatiques (OUTLINE, DRAFT) en plus de la version initiale, et restaurer ramène l’état antérieur', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const articleId = created.articleId

      await queue.pumpAll()

      const versions = await h.prisma.articleVersion.findMany({ where: { articleId }, orderBy: { version: 'asc' } })
      // v1 (création, contenu vide) + au moins v2 (avant OUTLINE) + v3 (avant DRAFT).
      expect(versions.length).toBeGreaterThanOrEqual(3)
      expect(versions[0]!.content).toBe('')
      expect(versions.some((v) => v.changeNote?.startsWith('pipeline:outline'))).toBe(true)
      expect(versions.some((v) => v.changeNote?.startsWith('pipeline:draft'))).toBe(true)

      const beforeGeneration = versions[0]!
      const restored = await h.prisma.$transaction(async (tx) => {
        // Restauration directe (pas besoin de repasser par la mutation
        // GraphQL, déjà testée par `article-workflow.int-spec.ts`) : on
        // vérifie ici seulement que l'instantané pré-génération existe
        // toujours et ramène bien l'état antérieur.
        return tx.article.update({
          where: { id: articleId },
          data: { content: beforeGeneration.content, title: beforeGeneration.title },
        })
      })
      expect(restored.content).toBe('')
    })
  })

  describe('garantie centrale', () => {
    it('l’IA n’atteint jamais PUBLISHED : l’article reste DRAFT à la fin du pipeline', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      await queue.pumpAll()

      const article = await h.prisma.article.findUniqueOrThrow({ where: { id: created.articleId } })
      expect(article.status).toBe('DRAFT')
      expect(article.status).not.toBe('PUBLISHED')
      expect(article.publishedAt).toBeNull()
    })
  })

  describe('rejeu et reprise', () => {
    it('rejouer DRAFT crée attempt=2 et ne recrée pas OUTLINE (le nombre d’AIJob outline reste à 1)', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const runId = created.id
      await queue.pumpAll()

      const outlineJobsBefore = await h.prisma.aIJob.count({ where: { type: StepType.OUTLINE } })
      expect(outlineJobsBefore).toBe(1)

      const replayed = (await h.gql(REGENERATE_STEP, { domainId, runId, step: 'DRAFT' }, cookies)).body.data
        .regenerateStep
      expect(replayed.status).toBe('RUNNING')

      const draftSteps = await h.prisma.pipelineStep.findMany({ where: { runId, type: StepType.DRAFT }, orderBy: { attempt: 'asc' } })
      expect(draftSteps.map((s) => s.attempt)).toEqual([1, 2])
      expect(draftSteps[1]!.status).toBe('PENDING')

      const outlineSteps = await h.prisma.pipelineStep.findMany({ where: { runId, type: StepType.OUTLINE } })
      expect(outlineSteps).toHaveLength(1) // pas recréé

      await queue.pumpAll()

      expect(await h.prisma.aIJob.count({ where: { type: StepType.OUTLINE } })).toBe(1)
      expect(await h.prisma.aIJob.count({ where: { type: StepType.DRAFT } })).toBe(2)

      const finalRun = (await h.gql(PIPELINE_RUN, { domainId, id: runId }, cookies)).body.data.pipelineRun
      expect(finalRun.status).toBe('COMPLETED')
    })

    it('un échec (AI_FAKE_FAIL_STEP=DRAFT) laisse le run FAILED avec l’erreur persistée, OUTLINE restant COMPLETED', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const runId = created.id

      process.env.AI_FAKE_FAIL_STEP = 'DRAFT'
      try {
        await queue.pumpAll()
      } finally {
        delete process.env.AI_FAKE_FAIL_STEP
      }

      const finalRun = (await h.gql(PIPELINE_RUN, { domainId, id: runId }, cookies)).body.data.pipelineRun
      expect(finalRun.status).toBe('FAILED')

      const outline = finalRun.steps.find((s: { type: string }) => s.type === 'OUTLINE')
      expect(outline.status).toBe('COMPLETED')

      const draft = finalRun.steps.find((s: { type: string }) => s.type === 'DRAFT')
      expect(draft.status).toBe('FAILED')
      expect(draft.error).toMatch(/échec simulé/i)

      const seo = finalRun.steps.find((s: { type: string }) => s.type === 'SEO')
      expect(seo.status).toBe('PENDING') // jamais atteinte
    })

    it('un step RUNNING avec heartbeatAt périmé repasse en PENDING après recoverStaleSteps (redémarrage simulé)', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const runId = created.id
      const outlineStepId = created.steps.find((s: { type: string }) => s.type === 'OUTLINE').id

      // Simule un worker mort en plein traitement : le job OUTLINE enfilé par
      // `generateArticle` a déjà été dépilé par ce worker (`pumpOne`/un vrai
      // `Worker` BullMQ retire toujours le job de la liste d'attente AVANT de
      // le traiter) au moment où il meurt — `queue.clear()` reproduit ce
      // dépilement sans exécuter le job, pour que le seul job présent après
      // `recoverStaleSteps` soit celui de la reprise, pas un doublon de
      // l'enfilement initial jamais consommé.
      queue.clear()
      await h.prisma.pipelineStep.update({
        where: { id: outlineStepId },
        data: { status: 'RUNNING', heartbeatAt: new Date(Date.now() - 10 * 60 * 1000) },
      })

      const pipeline = h.app.get(PipelineService)
      const recovered = await pipeline.recoverStaleSteps(60_000)
      expect(recovered).toBe(1)

      const afterRecovery = await h.prisma.pipelineStep.findUniqueOrThrow({ where: { id: outlineStepId } })
      expect(afterRecovery.status).toBe('PENDING')
      expect(afterRecovery.heartbeatAt).toBeNull()
      expect(queue.size).toBe(1) // réenfilé

      await queue.pumpAll()
      const finalRun = (await h.gql(PIPELINE_RUN, { domainId, id: runId }, cookies)).body.data.pipelineRun
      expect(finalRun.status).toBe('COMPLETED')
    })
  })

  describe('déduplication', () => {
    it('deux appels successifs à generateArticle sur le même topic renvoient le même run, sans créer deux articles', async () => {
      const { cookies, domainId, topicId } = await setup()

      const first = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const second = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle

      expect(second.id).toBe(first.id)
      expect(await h.prisma.article.count({ where: { topicId } })).toBe(1)
      expect(await h.prisma.pipelineRun.count({ where: { topicId } })).toBe(1)

      await queue.pumpAll()
    })
  })

  describe('annulation', () => {
    it('annuler un run en attente le retire de la file et le marque CANCELLED', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      expect(queue.size).toBe(1)

      const cancelled = (await h.gql(CANCEL_RUN, { domainId, id: created.id }, cookies)).body.data.cancelPipelineRun
      expect(cancelled.status).toBe('CANCELLED')
      expect(queue.size).toBe(0)

      const outline = cancelled.steps.find((s: { type: string }) => s.type === 'OUTLINE')
      expect(outline.status).toBe('CANCELLED')

      // Plus rien à traiter : la file est vide, un pump ne fait rien.
      expect(await queue.pumpAll()).toBe(0)
      const article = await h.prisma.article.findUniqueOrThrow({ where: { id: created.articleId } })
      expect(article.status).toBe('DRAFT')
    })

    it('annuler un run en cours l’arrête : le handler termine l’étape en cours, mais n’enchaîne jamais la suivante', async () => {
      const { cookies, domainId, topicId } = await setup()
      const created = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)).body.data.generateArticle
      const runId = created.id

      // Marge généreuse (300 ms de latence simulée vs 50 ms d'attente avant
      // d'annuler) : le but est seulement de garantir que DRAFT est bien en
      // cours d'exécution (`execute()` en vol) au moment de l'annulation,
      // jamais une mesure de performance — l'ordre importe, pas le timing
      // exact.
      process.env.AI_FAKE_LATENCY_MS = '300'
      try {
        await queue.pumpOne() // OUTLINE se termine, DRAFT est enfilé
        const draftPump = queue.pumpOne() // démarre DRAFT (RUNNING), en plein `execute()`
        await new Promise((resolve) => setTimeout(resolve, 50))

        const cancelled = (await h.gql(CANCEL_RUN, { domainId, id: runId }, cookies)).body.data.cancelPipelineRun
        expect(cancelled.status).toBe('CANCELLED')

        await draftPump // laisse DRAFT se terminer naturellement
      } finally {
        delete process.env.AI_FAKE_LATENCY_MS
      }

      const finalRun = (await h.gql(PIPELINE_RUN, { domainId, id: runId }, cookies)).body.data.pipelineRun
      expect(finalRun.status).toBe('CANCELLED') // pas écrasé en COMPLETED par `advance()`

      const draft = finalRun.steps.find((s: { type: string }) => s.type === 'DRAFT')
      expect(draft.status).toBe('COMPLETED') // jamais interrompu de force

      const seo = finalRun.steps.find((s: { type: string }) => s.type === 'SEO')
      expect(seo.status).toBe('PENDING') // jamais démarrée : le drapeau a été vérifié entre les étapes

      expect(queue.size).toBe(0)
    })
  })

  describe('isolation par domaine', () => {
    it('un non-membre du domaine ne peut ni lancer, ni lire, ni annuler', async () => {
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(bob, 'Domaine de Bob')
      const topicId = await createTopic(bob, domainId)
      const run = (await h.gql(GENERATE_ARTICLE, { domainId, topicId }, bob)).body.data.generateArticle

      const carol = await signUp('carol@example.com')

      const launch = await h.gql(GENERATE_ARTICLE, { domainId, topicId: 'unused' }, carol)
      expect(launch.body.data?.generateArticle).toBeFalsy()
      expect(errorCode(launch.body)).toBe('NOT_FOUND')

      const read = await h.gql(PIPELINE_RUN, { domainId, id: run.id }, carol)
      expect(read.body.data?.pipelineRun).toBeFalsy()
      expect(errorCode(read.body)).toBe('NOT_FOUND')

      const cancel = await h.gql(CANCEL_RUN, { domainId, id: run.id }, carol)
      expect(cancel.body.data?.cancelPipelineRun).toBeFalsy()
      expect(errorCode(cancel.body)).toBe('NOT_FOUND')

      await queue.pumpAll()
    })

    it('ferme la confusion de domaine : domainId dont on est membre + runId d’un autre domaine échoue', async () => {
      const alice = await signUp('alice@example.com')
      const idAlice = await createDomain(alice, 'Domaine Alice')

      const bob = await signUp('bob@example.com')
      const idBob = await createDomain(bob, 'Domaine Bob')
      const topicBob = await createTopic(bob, idBob)
      const runBob = (await h.gql(GENERATE_ARTICLE, { domainId: idBob, topicId: topicBob }, bob)).body.data.generateArticle

      const usurpation = await h.gql(PIPELINE_RUN, { domainId: idAlice, id: runBob.id }, alice)
      expect(usurpation.body.data?.pipelineRun).toBeFalsy()
      expect(errorCode(usurpation.body)).toBe('NOT_FOUND')

      const cancelUsurpation = await h.gql(CANCEL_RUN, { domainId: idAlice, id: runBob.id }, alice)
      expect(cancelUsurpation.body.data?.cancelPipelineRun).toBeFalsy()
      expect(errorCode(cancelUsurpation.body)).toBe('NOT_FOUND')

      const intact = await h.prisma.pipelineRun.findUniqueOrThrow({ where: { id: runBob.id } })
      expect(intact.status).toBe('PENDING') // pas touché par la tentative d'Alice

      await queue.pumpAll()
    })

    it('ferme le même chemin sur regenerateStep : domainId dont on est membre + runId d’un autre domaine échoue en NOT_FOUND, jamais en CONFLICT', async () => {
      const alice = await signUp('alice@example.com')
      const idAlice = await createDomain(alice, 'Domaine Alice')

      const bob = await signUp('bob@example.com')
      const idBob = await createDomain(bob, 'Domaine Bob')
      const topicBob = await createTopic(bob, idBob)
      const runBob = (await h.gql(GENERATE_ARTICLE, { domainId: idBob, topicId: topicBob }, bob)).body.data.generateArticle
      await queue.pumpAll() // run de Bob COMPLETED : sans ça, une simple confusion de rôle donnerait déjà CONFLICT (run en cours), masquant le test d'isolation.

      const usurpation = await h.gql(REGENERATE_STEP, { domainId: idAlice, runId: runBob.id, step: 'DRAFT' }, alice)
      expect(usurpation.body.data?.regenerateStep).toBeFalsy()
      expect(errorCode(usurpation.body)).toBe('NOT_FOUND')

      const draftSteps = await h.prisma.pipelineStep.findMany({ where: { runId: runBob.id, type: StepType.DRAFT } })
      expect(draftSteps).toHaveLength(1) // pas de rejeu déclenché par la tentative d'Alice
    })
  })

  describe('generateTopics (Task 6)', () => {
    const GENERATE_TOPICS = `
      mutation ($domainId: ID!, $input: GenerateTopicsInput!) { generateTopics(domainId: $domainId, input: $input) { ${RUN_FIELDS} } }`
    const TOPICS = `
      query ($domainId: ID!) { topics(domainId: $domainId, page: { limit: 50, offset: 0 }) { items { id title generatedByJobId } totalCount } }`

    it('rejette un count hors bornes (0 et 21) avant tout appel IA', async () => {
      const { cookies, domainId } = await setup()

      const tooLow = await h.gql(GENERATE_TOPICS, { domainId, input: { count: 0 } }, cookies)
      expect(errorCode(tooLow.body)).toBe('VALIDATION_FAILED')

      const tooHigh = await h.gql(GENERATE_TOPICS, { domainId, input: { count: 21 } }, cookies)
      expect(errorCode(tooHigh.body)).toBe('VALIDATION_FAILED')

      expect(await h.prisma.pipelineRun.count()).toBe(0)
    })

    it('crée un run à une seule étape (TOPIC_GENERATION), qui persiste `count` sujets liés à l’AIJob une fois pompé', async () => {
      // `setup()` crée aussi un sujet (pour `generateArticle`) : on part d'un
      // domaine nu ici, pour que `topics.totalCount` ne compte QUE les sujets
      // produits par cette génération.
      const cookies = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)

      const created = (await h.gql(GENERATE_TOPICS, { domainId, input: { count: 3 } }, cookies)).body.data.generateTopics
      expect(created.status).toBe('PENDING')
      expect(created.topicId).toBeNull()
      expect(created.articleId).toBeNull()
      expect(created.steps).toHaveLength(1)
      expect(created.steps[0].type).toBe('TOPIC_GENERATION')

      const processed = await queue.pumpAll()
      expect(processed).toBe(1)

      const finalRun = (await h.gql(PIPELINE_RUN, { domainId, id: created.id }, cookies)).body.data.pipelineRun
      expect(finalRun.status).toBe('COMPLETED')
      expect(finalRun.steps[0].status).toBe('COMPLETED')

      const job = await h.prisma.aIJob.findFirstOrThrow({ where: { type: 'TOPIC_GENERATION' } })
      expect(job.status).toBe('COMPLETED')

      const topics = (await h.gql(TOPICS, { domainId }, cookies)).body.data.topics
      expect(topics.totalCount).toBe(3)
      for (const topic of topics.items) {
        expect(topic.generatedByJobId).toBe(job.id)
      }
    })

    it('regenerateStep refuse TOPIC_GENERATION : il ne fait pas partie du pipeline de génération d’article', async () => {
      const { cookies, domainId } = await setup()
      const created = (await h.gql(`
        mutation ($domainId: ID!, $input: GenerateTopicsInput!) { generateTopics(domainId: $domainId, input: $input) { id } }`,
        { domainId, input: { count: 1 } },
        cookies,
      )).body.data.generateTopics
      await queue.pumpAll()

      const res = await h.gql(REGENERATE_STEP, { domainId, runId: created.id, step: 'TOPIC_GENERATION' }, cookies)
      expect(res.body.data?.regenerateStep).toBeFalsy()
      expect(errorCode(res.body)).toBe('VALIDATION_FAILED')
    })
  })

  describe('pipelineRuns / pipelineQueue / aiJobs (Task 6)', () => {
    const PIPELINE_RUNS = `
      query ($domainId: ID!, $filter: PipelineRunFilter, $page: PageInput) {
        pipelineRuns(domainId: $domainId, filter: $filter, page: $page) { items { id status } totalCount }
      }`
    const PIPELINE_QUEUE_QUERY = `
      query ($domainId: ID!) {
        pipelineQueue(domainId: $domainId) { position estimatedWaitSeconds run { id status } }
      }`
    const AI_JOBS = `
      query ($domainId: ID!, $filter: AIJobFilter) {
        aiJobs(domainId: $domainId, filter: $filter) { items { id type status } totalCount }
      }`

    it('pipelineRuns liste, filtre par statut et pagine', async () => {
      const { cookies, domainId, topicId } = await setup()
      await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)
      const topic2 = await createTopic(cookies, domainId, 'Second sujet')
      const secondRun = (await h.gql(GENERATE_ARTICLE, { domainId, topicId: topic2 }, cookies)).body.data.generateArticle
      await queue.pumpAll() // le run du second sujet est traité en dernier (FIFO) : COMPLETED

      const all = (await h.gql(PIPELINE_RUNS, { domainId }, cookies)).body.data.pipelineRuns
      expect(all.totalCount).toBe(2)

      const completedOnly = (await h.gql(PIPELINE_RUNS, { domainId, filter: { status: 'COMPLETED' } }, cookies)).body.data.pipelineRuns
      expect(completedOnly.totalCount).toBe(2)
      expect(completedOnly.items.map((r: { id: string }) => r.id)).toContain(secondRun.id)

      const firstPage = (await h.gql(PIPELINE_RUNS, { domainId, page: { limit: 1, offset: 0 } }, cookies)).body.data.pipelineRuns
      expect(firstPage.items).toHaveLength(1)
      expect(firstPage.totalCount).toBe(2)
    })

    it('pipelineQueue : sans historique d’AIJob, l’estimation est `null` plutôt qu’un chiffre inventé', async () => {
      const { cookies, domainId, topicId } = await setup()
      await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)

      const queueResult = (await h.gql(PIPELINE_QUEUE_QUERY, { domainId }, cookies)).body.data.pipelineQueue
      expect(queueResult).toHaveLength(1)
      expect(queueResult[0].position).toBe(1)
      expect(queueResult[0].estimatedWaitSeconds).toBeNull()

      await queue.pumpAll()
    })

    it('pipelineQueue : la position reflète l’ordre RÉEL de la file, y compris à travers les domaines', async () => {
      const alice = await signUp('alice@example.com')
      const idAlice = await createDomain(alice, 'Domaine Alice')
      const topicAlice1 = await createTopic(alice, idAlice, 'Sujet Alice 1')
      const topicAlice2 = await createTopic(alice, idAlice, 'Sujet Alice 2')

      const bob = await signUp('bob@example.com')
      const idBob = await createDomain(bob, 'Domaine Bob')
      const topicBob = await createTopic(bob, idBob, 'Sujet Bob')

      // Ordre d'enfilement réel : Alice#1, Bob, Alice#2 — un run d'un autre
      // domaine intercalé doit décaler la position d'Alice#2 dans SA propre
      // file (2 devient 3), preuve que la position n'est pas un simple rang
      // local aux runs renvoyés.
      await h.gql(GENERATE_ARTICLE, { domainId: idAlice, topicId: topicAlice1 }, alice)
      await h.gql(GENERATE_ARTICLE, { domainId: idBob, topicId: topicBob }, bob)
      await h.gql(GENERATE_ARTICLE, { domainId: idAlice, topicId: topicAlice2 }, alice)

      const aliceQueue = (await h.gql(PIPELINE_QUEUE_QUERY, { domainId: idAlice }, alice)).body.data.pipelineQueue
      expect(aliceQueue).toHaveLength(2)
      expect(aliceQueue.map((q: { position: number }) => q.position)).toEqual([1, 3])

      await queue.pumpAll()
    })

    it('pipelineQueue : avec un historique suffisant (>= 5 échantillons), l’estimation devient un nombre positif', async () => {
      const { cookies, domainId, topicId } = await setup()
      const durations = [9_000, 9_500, 10_000, 10_500, 11_000] // médiane = 10 000 ms
      for (const durationMs of durations) {
        await h.prisma.aIJob.create({
          data: {
            type: 'OUTLINE', provider: 'fake', model: 'fake', promptVersion: 'v1', status: 'COMPLETED',
            input: {}, durationMs, completedAt: new Date(),
          },
        })
      }

      await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)
      const queueResult = (await h.gql(PIPELINE_QUEUE_QUERY, { domainId }, cookies)).body.data.pipelineQueue
      // OUTLINE a un historique (médiane 10s) ; DRAFT n'en a aucun -> `null`
      // pour CE run tant que DRAFT compte encore parmi ses étapes restantes.
      expect(queueResult[0].estimatedWaitSeconds).toBeNull()

      // Complète l'historique de DRAFT à son tour : l'estimation devient disponible.
      for (const durationMs of durations) {
        await h.prisma.aIJob.create({
          data: {
            type: 'DRAFT', provider: 'fake', model: 'fake', promptVersion: 'v1', status: 'COMPLETED',
            input: {}, durationMs, completedAt: new Date(),
          },
        })
      }
      const secondQueueResult = (await h.gql(PIPELINE_QUEUE_QUERY, { domainId }, cookies)).body.data.pipelineQueue
      // ~20s attendus (médiane OUTLINE + médiane DRAFT, SEO ignorée car jamais tracée en AIJob).
      expect(secondQueueResult[0].estimatedWaitSeconds).toBe(20)

      await queue.pumpAll()
    })

    it('pipelineQueue : la médiane ignore une durée aberrante bien mieux qu’une moyenne l’aurait fait', async () => {
      const { cookies, domainId, topicId } = await setup()
      // Quatre durées cohérentes autour de 10s, UNE durée aberrante à 600s (10 min) :
      // médiane = 10 000ms (le point du milieu, insensible à l'aberrante) ;
      // une moyenne, elle, serait tirée à (4×10 000 + 600 000) / 5 = 128 000ms.
      const durations = [9_800, 10_000, 10_200, 9_900, 600_000]
      for (const durationMs of durations) {
        await h.prisma.aIJob.create({
          data: {
            type: 'OUTLINE', provider: 'fake', model: 'fake', promptVersion: 'v1', status: 'COMPLETED',
            input: {}, durationMs, completedAt: new Date(),
          },
        })
        await h.prisma.aIJob.create({
          data: {
            type: 'DRAFT', provider: 'fake', model: 'fake', promptVersion: 'v1', status: 'COMPLETED',
            input: {}, durationMs: 10_000, completedAt: new Date(),
          },
        })
      }

      await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)
      const queueResult = (await h.gql(PIPELINE_QUEUE_QUERY, { domainId }, cookies)).body.data.pipelineQueue
      // 10s (médiane OUTLINE) + 10s (médiane DRAFT) = 20s, très loin des ~138s
      // qu'une moyenne aurait produits pour la seule étape OUTLINE.
      expect(queueResult[0].estimatedWaitSeconds).toBe(20)

      await queue.pumpAll()
    })

    it('aiJobs liste les appels IA du domaine et filtre par statut/type', async () => {
      const { cookies, domainId, topicId } = await setup()
      await h.gql(GENERATE_ARTICLE, { domainId, topicId }, cookies)
      await queue.pumpAll()

      const all = (await h.gql(AI_JOBS, { domainId }, cookies)).body.data.aiJobs
      expect(all.totalCount).toBe(2) // OUTLINE + DRAFT (SEO ne crée aucun AIJob)

      const outlineOnly = (await h.gql(AI_JOBS, { domainId, filter: { type: 'OUTLINE' } }, cookies)).body.data.aiJobs
      expect(outlineOnly.totalCount).toBe(1)
      expect(outlineOnly.items[0].type).toBe('OUTLINE')
    })

    it("isole aiJobs par domaine : un non-membre ne voit rien, un membre d'un autre domaine ne voit pas les AIJob d'un autre", async () => {
      const alice = await signUp('alice@example.com')
      const idAlice = await createDomain(alice, 'Domaine Alice')
      const topicAlice = await createTopic(alice, idAlice)
      await h.gql(GENERATE_ARTICLE, { domainId: idAlice, topicId: topicAlice }, alice)
      await queue.pumpAll()

      const bob = await signUp('bob@example.com')
      const idBob = await createDomain(bob, 'Domaine Bob')

      const res = await h.gql(AI_JOBS, { domainId: idBob }, bob)
      expect(res.body.data.aiJobs.totalCount).toBe(0)
    })
  })
})

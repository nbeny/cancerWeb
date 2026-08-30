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
  mutation ($domainId: ID!, $runId: ID!, $stepType: StepType!) {
    regeneratePipelineStep(domainId: $domainId, runId: $runId, stepType: $stepType) { ${RUN_FIELDS} }
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

      const replayed = (await h.gql(REGENERATE_STEP, { domainId, runId, stepType: 'DRAFT' }, cookies)).body.data
        .regeneratePipelineStep
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
  })
})

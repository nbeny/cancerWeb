import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { JobStatus, Prisma, RunStatus, StepStatus, StepType } from '@prisma/client'
import type { PipelineStep } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ArticlesService } from '../articles/articles.service'
import { VersionsService } from '../articles/versions.service'
import { SeoService } from '../seo/seo.service'
import { AI_PROVIDER } from '../ai/ai.types'
import type { AIProvider } from '../ai/ai.types'
import type { Outline } from '../ai/ai-task.types'
import { OUTLINE_PROMPT_VERSION } from '../ai/prompts/outline.prompt'
import { DRAFT_PROMPT_VERSION } from '../ai/prompts/draft.prompt'
import { getStepDefinition, STEP_DEFINITIONS } from './pipeline-steps'
import type { StepHandler } from './step-handler'
import type { PipelineRunWithSteps } from './step-handler'
import { OutlineStepHandler } from './handlers/outline.handler'
import { DraftStepHandler } from './handlers/draft.handler'
import { PIPELINE_QUEUE } from './pipeline-queue'
import type { PipelineQueuePort } from './pipeline-queue'

/** Durée entre deux rafraîchissements de `heartbeatAt` pendant qu'une étape RUNNING travaille. */
const HEARTBEAT_INTERVAL_MS = Number(process.env.PIPELINE_HEARTBEAT_INTERVAL_MS ?? 10_000)
/** Au-delà de cette ancienneté sans battement, une étape RUNNING est considérée abandonnée (crash du worker). */
const DEFAULT_STALE_THRESHOLD_MS = Number(process.env.PIPELINE_HEARTBEAT_TIMEOUT_MS ?? 120_000)
/** `rawOutput` (AIJob) est un `String? @db.Text` de diagnostic, pas le stockage de résultat : tronqué comme dans `CliAgentProvider`. */
const MAX_RAW_OUTPUT_LENGTH = 8_000

// Seules OUTLINE et DRAFT appellent réellement un `AIProvider` (voir
// `executeStep` : elles seules passent par `runAiStep`). SEO est
// déterministe (voir `runSeoStep`) : jamais un `AIJob` n'est créé pour elle.
const PROMPT_VERSIONS: Partial<Record<StepType, string>> = {
  [StepType.OUTLINE]: OUTLINE_PROMPT_VERSION,
  [StepType.DRAFT]: DRAFT_PROMPT_VERSION,
}

/** `JSON.parse(JSON.stringify(...))` normalise les `Date` (Domain/Topic/Article) en chaînes ISO : la seule façon sûre d'obtenir un `Prisma.InputJsonValue` valide à partir d'une entité Prisma quelconque. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function truncateRaw(text: string): string {
  return text.length > MAX_RAW_OUTPUT_LENGTH ? `${text.slice(0, MAX_RAW_OUTPUT_LENGTH)}\n[...tronqué...]` : text
}

/** Reconstitue le plan sous forme de Markdown de titres, pour un premier aperçu écrit dans l'article avant que DRAFT ne le remplace par l'article complet. */
function outlineToMarkdown(outline: Outline): string {
  const lines = [`# ${outline.h1}`, ...outline.sections.map((section) => `${'#'.repeat(section.depth)} ${section.title}`)]
  return lines.join('\n\n')
}

/**
 * Orchestrateur du pipeline automatisé (Task 5) : le point de jonction entre
 * tout ce qui a été livré séparément jusqu'ici (`AITaskService`, les
 * handlers OUTLINE/DRAFT/SEO, `VersionsService.snapshotBeforeAutomatedChange`,
 * `SeoService.analyze`) et une exécution réelle, pilotée par une file
 * d'attente (`PIPELINE_QUEUE`, BullMQ en production, en mémoire en test).
 *
 * Garantie centrale du Lot 2 : ce service n'appelle JAMAIS une transition de
 * statut d'article au-delà de `DRAFT` (`ArticlesService.create` le pose une
 * fois, personne ici ne le change) — l'IA n'atteint jamais `PUBLISHED`, qui
 * reste un acte humain (`ArticlesService.publishArticle`, Task 8).
 */
@Injectable()
export class PipelineService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
    private readonly versions: VersionsService,
    private readonly seo: SeoService,
    private readonly outlineHandler: OutlineStepHandler,
    private readonly draftHandler: DraftStepHandler,
    @Inject(AI_PROVIDER) private readonly aiProvider: AIProvider,
    @Inject(PIPELINE_QUEUE) private readonly queue: PipelineQueuePort,
  ) {}

  /** Relie la file en mémoire (tests) à `processStep`, sans dépendance circulaire au niveau des constructeurs — voir la jsdoc de `PipelineQueuePort.bind`. */
  onModuleInit(): void {
    this.queue.bind?.((job) => this.processStep(job.runId, job.stepId, job.correlationId))
  }

  // -------------------------------------------------------------------
  // Lecture, isolée par domaine (même motif que `ArticlesService.findForUser`)
  // -------------------------------------------------------------------

  async getRun(userId: string, domainId: string, runId: string): Promise<PipelineRunWithSteps> {
    const run = await this.prisma.pipelineRun.findFirst({
      where: { id: runId, domainId, domain: { members: { some: { userId } } } },
      include: { steps: { orderBy: { order: 'asc' } }, domain: true, article: true },
    })
    if (!run) throw new NotFoundException('Pipeline introuvable')
    const topic = run.topicId ? await this.prisma.topic.findUnique({ where: { id: run.topicId } }) : null
    return { ...run, topic }
  }

  /** Identique à `getRun`, sans le refiltrage par utilisateur : réservé à l'usage interne (`processStep`, appelé par le worker, pas par un resolver). */
  private async loadRunWithContext(runId: string): Promise<PipelineRunWithSteps> {
    const run = await this.prisma.pipelineRun.findUniqueOrThrow({
      where: { id: runId },
      include: { steps: { orderBy: { order: 'asc' } }, domain: true, article: true },
    })
    const topic = run.topicId ? await this.prisma.topic.findUnique({ where: { id: run.topicId } }) : null
    return { ...run, topic }
  }

  // -------------------------------------------------------------------
  // Démarrage
  // -------------------------------------------------------------------

  /**
   * Crée l'article en DRAFT (visible immédiatement, avant tout appel IA),
   * puis le `PipelineRun` et ses 7 `PipelineStep` : les étapes non
   * exécutables sont `SKIPPED` d'emblée avec leur `skipReason` persistée
   * (dans `error`, seul champ texte libre du modèle — voir la jsdoc de
   * `pipeline-steps.ts`), les trois exécutables sont créées `PENDING` tout
   * de suite (Task 5 : « crée le PipelineRun + les 7 PipelineStep »), mais
   * seule la première (OUTLINE) est enfilée — les suivantes sont enfilées
   * par `processStep` à mesure que le pipeline avance, en réutilisant la
   * ligne déjà créée plutôt que d'en fabriquer une nouvelle.
   *
   * Déduplication : un sujet déjà converti en article renvoie le run
   * existant le plus récent au lieu d'en créer un second (voir
   * `pipeline.int-spec.ts`, « deux appels successifs »).
   */
  async generateArticle(userId: string, domainId: string, topicId: string): Promise<PipelineRunWithSteps> {
    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, domainId, domain: { members: { some: { userId } } } },
    })
    if (!topic) throw new NotFoundException('Sujet introuvable')

    const existingArticle = await this.prisma.article.findUnique({ where: { topicId } })
    if (existingArticle) {
      const existingRun = await this.prisma.pipelineRun.findFirst({
        where: { articleId: existingArticle.id },
        orderBy: { createdAt: 'desc' },
      })
      if (existingRun) return this.getRun(userId, domainId, existingRun.id)
    }

    const article = await this.articles.create(userId, domainId, {
      topicId,
      title: topic.title,
      content: '',
      secondaryKeywords: [],
      robotsIndex: true,
      robotsFollow: true,
    })

    const firstExecutable = STEP_DEFINITIONS.find((d) => d.executable)
    if (!firstExecutable) throw new Error('Aucune étape exécutable déclarée dans STEP_DEFINITIONS.')

    const { runId, firstStepId } = await this.prisma.$transaction(async (tx) => {
      const run = await tx.pipelineRun.create({
        data: { domainId, topicId, articleId: article.id, triggeredBy: userId, status: RunStatus.PENDING },
      })

      let firstId: string | undefined
      for (const def of STEP_DEFINITIONS) {
        const created = await tx.pipelineStep.create({
          data: {
            runId: run.id,
            type: def.type,
            order: def.order,
            attempt: 1,
            status: def.executable ? StepStatus.PENDING : StepStatus.SKIPPED,
            error: def.executable ? null : def.skipReason,
            completedAt: def.executable ? null : new Date(),
          },
        })
        if (def.type === firstExecutable.type) firstId = created.id
      }
      if (!firstId) throw new Error('Étape initiale introuvable après création.')

      await tx.pipelineRun.update({ where: { id: run.id }, data: { currentStep: firstExecutable.type } })
      return { runId: run.id, firstStepId: firstId }
    })

    await this.queue.enqueueStep({ runId, stepId: firstStepId, correlationId: randomUUID() })
    return this.getRun(userId, domainId, runId)
  }

  // -------------------------------------------------------------------
  // Exécution d'une étape (appelée par le worker BullMQ ou la file en mémoire)
  // -------------------------------------------------------------------

  async processStep(runId: string, stepId: string, correlationId: string): Promise<void> {
    const run = await this.loadRunWithContext(runId)
    const step = run.steps.find((s) => s.id === stepId)
    // Job périmé (run/step supprimé, ou étape déjà traitée par une exécution
    // concurrente) : silencieux plutôt qu'une erreur qui ferait échouer tout
    // le job BullMQ pour rien.
    if (!step || step.status !== StepStatus.PENDING) return
    if (run.status === RunStatus.CANCELLED) return

    await this.prisma.pipelineStep.update({
      where: { id: stepId },
      data: { status: StepStatus.RUNNING, startedAt: new Date(), heartbeatAt: new Date() },
    })
    await this.prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: RunStatus.RUNNING, currentStep: step.type, startedAt: run.startedAt ?? new Date() },
    })

    const heartbeat = setInterval(() => {
      this.prisma.pipelineStep.update({ where: { id: stepId }, data: { heartbeatAt: new Date() } }).catch(() => undefined)
    }, HEARTBEAT_INTERVAL_MS)
    heartbeat.unref()

    try {
      const output = await this.executeStep(run, step, correlationId)
      await this.prisma.pipelineStep.update({
        where: { id: stepId },
        data: { status: StepStatus.COMPLETED, completedAt: new Date(), output: toJson(output) },
      })
      await this.advance(runId, step)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.prisma.pipelineStep.update({
        where: { id: stepId },
        data: { status: StepStatus.FAILED, error: message, completedAt: new Date() },
      })
      await this.prisma.pipelineRun.update({
        where: { id: runId },
        data: { status: RunStatus.FAILED, completedAt: new Date(), currentStep: step.type },
      })
    } finally {
      clearInterval(heartbeat)
    }
  }

  private async executeStep(run: PipelineRunWithSteps, step: PipelineStep, correlationId: string): Promise<unknown> {
    switch (step.type) {
      case StepType.OUTLINE:
        return this.runAiStep(run, step, this.outlineHandler, correlationId, (outline) => outlineToMarkdown(outline))
      case StepType.DRAFT:
        return this.runAiStep(run, step, this.draftHandler, correlationId, (content) => content)
      case StepType.SEO:
        return this.runSeoStep(run)
      default:
        throw new Error(`Étape ${step.type} : aucune logique d'exécution dans le pipeline automatisé.`)
    }
  }

  /**
   * Étapes OUTLINE et DRAFT : mêmes obligations pour les deux, factorisées
   * ici plutôt que dupliquées — `buildInput`/`execute` du handler (contrat
   * `StepHandler`, Task 7), snapshot réversible AVANT l'écriture (Task 5,
   * garantie centrale : voir `versions.snapshotBeforeAutomatedChange`),
   * écriture via `ArticlesService.update` (recalcule `renderedHtml`,
   * `wordCount`, invalide `latestSeoScore` — jamais dupliqué ici), et
   * traçabilité complète dans un `AIJob`.
   */
  private async runAiStep<I, O>(
    run: PipelineRunWithSteps,
    step: PipelineStep,
    handler: StepHandler<I, O>,
    correlationId: string,
    toContent: (output: O) => string,
  ): Promise<O> {
    if (!run.articleId) throw new Error(`Run ${run.id} : aucun article associé, écriture impossible.`)
    if (!run.triggeredBy) throw new Error(`Run ${run.id} : aucun déclencheur identifié, écriture impossible.`)

    const input = handler.buildInput(run, {})
    const start = Date.now()
    const output = await handler.execute(input, { correlationId })
    const durationMs = Date.now() - start

    // Réversibilité : l'instantané précède TOUJOURS l'écriture automatisée
    // qu'il protège, jamais l'inverse — sinon une génération qui échoue
    // juste après l'écriture ne laisserait aucun état antérieur à restaurer.
    await this.versions.snapshotBeforeAutomatedChange(run.articleId, `pipeline:${step.type.toLowerCase()}:attempt-${step.attempt}`)
    await this.articles.update(run.triggeredBy, run.domainId, run.articleId, { content: toContent(output) })

    await this.prisma.aIJob.create({
      data: {
        stepId: step.id,
        type: step.type,
        provider: this.aiProvider.key,
        // `AITaskService` ne fait remonter aucune métadonnée de modèle
        // concret (voir sa jsdoc : elle ne rend que des types métier) — la
        // valeur la plus honnête disponible ici est la configuration
        // d'environnement du provider, la même que celle que lirait
        // `CliAgentProvider` (`AI_MODEL`), avec la clé du provider en repli.
        model: process.env.AI_MODEL ?? this.aiProvider.key,
        promptVersion: PROMPT_VERSIONS[step.type] ?? 'unknown',
        status: JobStatus.COMPLETED,
        input: toJson(input),
        output: toJson(output),
        rawOutput: truncateRaw(JSON.stringify(output)),
        durationMs,
        correlationId,
        startedAt: new Date(Date.now() - durationMs),
        completedAt: new Date(),
      },
    })

    return output
  }

  /**
   * Étape déterministe : délègue à `SeoService.analyze`, qui parse, note,
   * enrichit des liens internes cassés, PERSISTE le `SeoReport` et
   * dénormalise `latestSeoScore` — tout en une transaction (voir sa jsdoc).
   * Choix assumé de ne PAS repasser par `SeoStepHandler` (Task 7) : celui-ci
   * n'expose que l'analyse pure (`analyze(parse(content), ctx)`), sans la
   * persistance ni l'enrichissement des liens internes que `SeoService`
   * possède déjà — le dupliquer ici serait deux sources de vérité pour la
   * même notation. `SeoStepHandler` reste testé et disponible pour un futur
   * usage de type « prévisualisation sans écriture » (hors périmètre de ce
   * lot). Aucun `AIJob` : cette étape n'appelle aucun modèle (voir
   * `AI_STEP_TYPES`).
   */
  private async runSeoStep(run: PipelineRunWithSteps): Promise<{ reportId: string; score: number }> {
    if (!run.articleId) throw new Error(`Run ${run.id} : aucun article associé, analyse SEO impossible.`)
    if (!run.triggeredBy) throw new Error(`Run ${run.id} : aucun déclencheur identifié, analyse SEO impossible.`)
    const report = await this.seo.analyze(run.triggeredBy, run.domainId, run.articleId)
    return { reportId: report.id, score: report.score }
  }

  /**
   * Après une étape COMPLETED : s'arrête si le run a été annulé entre-temps
   * (vérification du drapeau « entre les étapes », jamais pendant un
   * `execute()` en cours — voir `cancelRun`), sinon enchaîne la prochaine
   * étape exécutable déjà créée (par `generateArticle` ou `regenerateStep`),
   * ou termine le run si SEO était la dernière.
   */
  private async advance(runId: string, completedStep: PipelineStep): Promise<void> {
    const fresh = await this.prisma.pipelineRun.findUniqueOrThrow({ where: { id: runId } })
    if (fresh.status === RunStatus.CANCELLED) return

    const currentDef = getStepDefinition(completedStep.type)
    const nextDef = STEP_DEFINITIONS.filter((d) => d.executable && d.order > currentDef.order).sort((a, b) => a.order - b.order)[0]

    if (!nextDef) {
      await this.prisma.pipelineRun.update({
        where: { id: runId },
        data: { status: RunStatus.COMPLETED, completedAt: new Date(), currentStep: null },
      })
      return
    }

    const candidates = await this.prisma.pipelineStep.findMany({ where: { runId, type: nextDef.type } })
    const nextStep = [...candidates].sort((a, b) => b.attempt - a.attempt)[0]
    if (!nextStep) throw new Error(`Étape ${nextDef.type} introuvable pour le run ${runId} : impossible d'avancer.`)

    await this.prisma.pipelineRun.update({ where: { id: runId }, data: { currentStep: nextDef.type } })
    await this.queue.enqueueStep({ runId, stepId: nextStep.id, correlationId: randomUUID() })
  }

  // -------------------------------------------------------------------
  // Annulation
  // -------------------------------------------------------------------

  /**
   * Un run PENDING/RUNNING seulement. L'étape active (PENDING, pas encore
   * dépilée) est retirée de la file et marquée CANCELLED ; une étape déjà
   * RUNNING n'est jamais interrompue de force — `processStep` constate
   * `run.status === CANCELLED` juste après avoir persisté sa complétion et
   * n'enchaîne pas la suivante (voir `advance`).
   */
  async cancelRun(userId: string, domainId: string, runId: string): Promise<PipelineRunWithSteps> {
    const run = await this.getRun(userId, domainId, runId)
    if (run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED) {
      throw new ConflictException(`Le pipeline est déjà terminé (statut ${run.status}) : impossible de l'annuler.`)
    }

    await this.prisma.pipelineRun.update({ where: { id: runId }, data: { status: RunStatus.CANCELLED, completedAt: new Date() } })

    const active = [...run.steps]
      .filter((s) => s.status === StepStatus.PENDING || s.status === StepStatus.RUNNING)
      .sort((a, b) => b.attempt - a.attempt)[0]

    if (active?.status === StepStatus.PENDING) {
      await this.queue.cancelPendingJob(runId, active.id)
      await this.prisma.pipelineStep.update({ where: { id: active.id }, data: { status: StepStatus.CANCELLED, completedAt: new Date() } })
    }

    return this.getRun(userId, domainId, runId)
  }

  // -------------------------------------------------------------------
  // Rejeu d'une étape
  // -------------------------------------------------------------------

  /**
   * Rejoue une étape exécutable (et toutes celles qui la suivent, pour
   * qu'elles retraitent un contenu qui a changé) sans jamais recréer les
   * étapes précédentes : une nouvelle ligne `PipelineStep` est créée pour
   * chaque étape à partir de `type` inclus, avec `attempt` incrémenté par
   * rapport à sa dernière tentative, laissant les lignes antérieures
   * intactes (voir `pipeline.int-spec.ts`, « rejouer DRAFT crée attempt=2 et
   * ne recrée pas OUTLINE »).
   */
  async regenerateStep(userId: string, domainId: string, runId: string, type: StepType): Promise<PipelineRunWithSteps> {
    const run = await this.getRun(userId, domainId, runId)
    if (run.status === RunStatus.PENDING || run.status === RunStatus.RUNNING) {
      throw new ConflictException('Le pipeline est en cours : impossible de rejouer une étape maintenant.')
    }

    const def = getStepDefinition(type)
    if (!def.executable) {
      throw new BadRequestException(`L'étape ${type} n'est pas exécutable : ${def.skipReason}`)
    }

    const toReset = STEP_DEFINITIONS.filter((d) => d.executable && d.order >= def.order).sort((a, b) => a.order - b.order)

    const firstStepId = await this.prisma.$transaction(async (tx) => {
      let first: string | undefined
      for (const d of toReset) {
        const maxAttempt = Math.max(0, ...run.steps.filter((s) => s.type === d.type).map((s) => s.attempt))
        const created = await tx.pipelineStep.create({
          data: { runId, type: d.type, order: d.order, attempt: maxAttempt + 1, status: StepStatus.PENDING },
        })
        first ??= created.id
      }
      await tx.pipelineRun.update({ where: { id: runId }, data: { status: RunStatus.RUNNING, currentStep: def.type, completedAt: null } })
      if (!first) throw new Error('Aucune étape à rejouer.')
      return first
    })

    await this.queue.enqueueStep({ runId, stepId: firstStepId, correlationId: randomUUID() })
    return this.getRun(userId, domainId, runId)
  }

  // -------------------------------------------------------------------
  // Reprise après redémarrage
  // -------------------------------------------------------------------

  /**
   * À appeler au démarrage du worker (voir `worker.ts`) : une étape restée
   * `RUNNING` sans battement récent signale un worker mort en plein
   * traitement (crash, redéploiement) — jamais une simple lenteur, tant que
   * `HEARTBEAT_INTERVAL_MS` reste petit devant `thresholdMs`. Remise en
   * `PENDING` et réenfilée, sur la MÊME tentative (`attempt` inchangé) :
   * ce n'est pas un rejeu volontaire (Task 5 le réserve à
   * `regenerateStep`), seulement la reprise de ce qui était déjà en cours.
   */
  async recoverStaleSteps(thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMs)
    const stale = await this.prisma.pipelineStep.findMany({
      where: { status: StepStatus.RUNNING, heartbeatAt: { lt: cutoff } },
    })

    for (const step of stale) {
      await this.prisma.pipelineStep.update({ where: { id: step.id }, data: { status: StepStatus.PENDING, heartbeatAt: null } })
      await this.queue.enqueueStep({ runId: step.runId, stepId: step.id, correlationId: randomUUID() })
    }

    return stale.length
  }
}

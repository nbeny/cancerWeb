import { Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'

/**
 * Donnée portée par chaque job de la file : suffisante pour retrouver le
 * `PipelineStep` à traiter (`PipelineService.processStep` recharge tout le
 * reste depuis la base — jamais l'inverse, pour que le worker survive à un
 * redémarrage sans perdre de contexte en mémoire).
 */
export interface PipelineJobData {
  runId: string
  stepId: string
  correlationId: string
}

export const PIPELINE_QUEUE = Symbol('PIPELINE_QUEUE')
export const PIPELINE_QUEUE_NAME = 'pipeline'

/**
 * Port au-dessus de la file d'attente, indépendant de BullMQ : c'est ce qui
 * permet à `PipelineModule` de brancher soit une vraie file BullMQ/Redis
 * (production, `PIPELINE_QUEUE_DRIVER=bullmq`), soit une file en mémoire
 * (tests d'intégration, `PIPELINE_QUEUE_DRIVER=inline` — voir
 * `pipeline.int-spec.ts` pour la justification de ce choix).
 */
export interface PipelineQueuePort {
  enqueueStep(job: PipelineJobData): Promise<void>
  /** Retire un job pas encore traité de la file. No-op silencieux s'il a déjà démarré ou n'existe plus. */
  cancelPendingJob(runId: string, stepId: string): Promise<void>
  /**
   * Relie le traitement d'un job à `PipelineService.processStep`. Uniquement
   * significatif pour une file en mémoire : une file BullMQ réelle l'ignore,
   * le traitement y étant fait par un worker séparé qui consomme Redis
   * indépendamment (voir `pipeline.processor.ts`), jamais par ce process
   * producteur. Optionnel plutôt que présent sur toute implémentation :
   * évite une dépendance circulaire au niveau du constructeur entre
   * `PipelineService` (qui enfile) et la file (qui devrait, pour rejouer les
   * jobs, connaître `PipelineService.processStep`) — voir
   * `PipelineService.onModuleInit`.
   */
  bind?(handler: (job: PipelineJobData) => Promise<void>): void
}

/**
 * Séparateur `-` et non `:` : BullMQ refuse au `add` tout id personnalisé
 * contenant `:` (séparateur de ses clés Redis ; seule la forme héritée à
 * trois segments des jobs répétables y échappe encore), et l'exception
 * « Custom Id cannot contain : » remonte jusqu'à la mutation GraphQL. Sans
 * ambiguïté : `PipelineRun.id` et `PipelineStep.id` sont des cuid, donc
 * strictement alphanumériques.
 */
function jobId(runId: string, stepId: string): string {
  return `${runId}-${stepId}`
}

/**
 * Adaptateur de production : un `Queue` BullMQ réel, construit par
 * `PipelineModule` à partir de `REDIS_URL`. Le job est identifié par
 * `runId-stepId` (jamais un id aléatoire) : `cancelPendingJob` peut donc
 * retrouver puis retirer le job exact sans registre supplémentaire, et
 * enfiler deux fois le même step est idempotent côté BullMQ (le second
 * `add` avec le même `jobId` est un no-op si le premier existe encore).
 */
@Injectable()
export class BullPipelineQueue implements PipelineQueuePort {
  constructor(private readonly queue: Queue<PipelineJobData>) {}

  async enqueueStep(job: PipelineJobData): Promise<void> {
    await this.queue.add('run-step', job, {
      jobId: jobId(job.runId, job.stepId),
      removeOnComplete: true,
      removeOnFail: false,
    })
  }

  async cancelPendingJob(runId: string, stepId: string): Promise<void> {
    const existing = await this.queue.getJob(jobId(runId, stepId))
    if (!existing) return
    // `remove()` échoue (lève) sur un job déjà actif/traité par un worker :
    // c'est exactement le cas qu'on ne veut PAS traiter en erreur ici
    // (annuler un run dont l'étape a déjà démarré emprunte un autre chemin,
    // voir `PipelineService.cancelRun`) — silencieux par conception.
    await existing.remove().catch(() => undefined)
  }
}

/**
 * Adaptateur de test : aucune connexion réseau, aucun minuteur, aucun délai
 * d'event-loop. Les jobs sont mis en attente dans un tableau en mémoire et
 * ne sont exécutés que lorsque le test appelle explicitement `pumpOne` /
 * `pumpAll` (voir `pipeline.int-spec.ts`). C'est ce qui rend les scénarios
 * d'annulation (« run en attente » vs « run en cours ») déterministes :
 * le test décide exactement quand une étape s'exécute, sans dépendre d'un
 * timing d'event-loop ou d'une latence Redis.
 */
@Injectable()
export class InlinePipelineQueue implements PipelineQueuePort {
  private jobs: PipelineJobData[] = []
  private handler?: (job: PipelineJobData) => Promise<void>

  bind(handler: (job: PipelineJobData) => Promise<void>): void {
    this.handler = handler
  }

  async enqueueStep(job: PipelineJobData): Promise<void> {
    this.jobs.push(job)
  }

  async cancelPendingJob(runId: string, stepId: string): Promise<void> {
    this.jobs = this.jobs.filter((j) => !(j.runId === runId && j.stepId === stepId))
  }

  /** Nombre de jobs en attente, jamais encore traités. Utilisé par les tests pour vérifier un retrait. */
  get size(): number {
    return this.jobs.length
  }

  /**
   * Vide la file sans la traiter. À appeler entre deux tests (voir
   * `pipeline.int-spec.ts`, `beforeEach`) : `app-harness.ts#reset()` vide les
   * tables SQL mais ne connaît rien de cette file en mémoire — sans cet
   * appel, un job resté enfilé par un test qui ne l'a pas entièrement pompé
   * (ex. un scénario d'annulation) tenterait, au test suivant, de traiter un
   * `runId`/`stepId` déjà TRUNCATE, provoquant un échec sans rapport avec ce
   * second test. Même préoccupation que le job Redis qui « survit entre les
   * tests » pour une vraie file BullMQ — seule l'implémentation diffère.
   */
  clear(): void {
    this.jobs = []
  }

  /** Traite le prochain job en attente, s'il y en a un. Renvoie `false` file vide. */
  async pumpOne(): Promise<boolean> {
    const job = this.jobs.shift()
    if (!job) return false
    if (!this.handler) throw new Error('InlinePipelineQueue.bind doit être appelé avant pumpOne().')
    await this.handler(job)
    return true
  }

  /**
   * Traite les jobs jusqu'à ce que la file soit vide (chaque étape peut en
   * enfiler une nouvelle : c'est ainsi que le pipeline avance). `maxSteps`
   * est un filet de sécurité contre une boucle infinie en cas de bug
   * d'enchaînement, jamais atteint par un pipeline correct (7 étapes max).
   */
  async pumpAll(maxSteps = 25): Promise<number> {
    let processed = 0
    while (processed < maxSteps && (await this.pumpOne())) processed++
    return processed
  }
}

import { Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { PIPELINE_QUEUE_NAME } from './pipeline-queue'
import type { PipelineJobData } from './pipeline-queue'
import { PipelineService } from './pipeline.service'

/**
 * Adaptateur BullMQ réel : le SEUL endroit du dépôt qui consomme
 * effectivement la file `pipeline` (production/dev, `PIPELINE_QUEUE_DRIVER
 * = bullmq`). Délibérément absent de `PipelineModule`/`AppModule` : ce
 * fichier n'est provisionné que par `worker.ts`, jamais par le process API
 * (`main.ts`) ni par les tests (`app-harness.ts`) — sinon l'API et le worker
 * consommeraient CHACUN la file avec `concurrency: 1`, pour une concurrence
 * globale de 2, ce qui violerait la contrainte « un seul agent CLI IA à la
 * fois » (voir la découverte de processeurs de `@nestjs/bullmq`, globale à
 * l'application Nest qui les déclare — `BullExplorer.registerWorkers`,
 * indépendante du module où vit la classe `@Processor`).
 *
 * Import statique de `@nestjs/bullmq` assumé ici (contrairement à
 * `pipeline.module.ts`) : aucun test Jest ne charge jamais ce fichier (ni
 * directement, ni via `AppModule`), donc son incompatibilité ESM avec
 * ts-jest ne s'applique pas — seul `node dist/worker.js` (Node réel) le
 * charge.
 */
@Injectable()
@Processor(PIPELINE_QUEUE_NAME, { concurrency: 1 })
export class PipelineProcessor extends WorkerHost {
  constructor(private readonly pipeline: PipelineService) {
    super()
  }

  async process(job: Job<PipelineJobData>): Promise<void> {
    await this.pipeline.processStep(job.data.runId, job.data.stepId, job.data.correlationId)
  }
}

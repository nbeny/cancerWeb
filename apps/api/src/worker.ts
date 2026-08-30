import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { PipelineProcessor } from './pipeline/pipeline.processor'
import { PipelineService } from './pipeline/pipeline.service'

/**
 * Module d'enveloppe réservé au worker : `PipelineProcessor` (le VRAI
 * consommateur BullMQ, `concurrency: 1`) n'est délibérément PAS un provider
 * de `PipelineModule`/`AppModule` (voir la jsdoc de `pipeline.processor.ts`)
 * — sinon `main.ts`, qui bootstrap aussi `AppModule`, consommerait la file
 * en plus de ce worker, doublant la concurrence réelle. En l'ajoutant ici,
 * seul CE process le fait tourner. `AppModule` réexporte `PipelineModule`
 * (voir sa jsdoc) précisément pour que `PipelineProcessor`, déclaré ici,
 * puisse injecter `PipelineService`.
 */
@Module({ imports: [AppModule], providers: [PipelineProcessor] })
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule)
  const pipeline = app.get(PipelineService)

  // Reprise après redémarrage : une étape restée RUNNING sans battement
  // récent au moment où CE worker démarre appartient à une exécution
  // précédente qui n'a jamais pu la terminer (crash, redéploiement) — voir
  // `PipelineService.recoverStaleSteps`.
  const recovered = await pipeline.recoverStaleSteps()
  if (recovered > 0) {
    console.log(`Worker démarré : ${recovered} étape(s) bloquée(s) reprise(s) après redémarrage.`)
  }

  console.log('Worker démarré, en attente de jobs (file "pipeline", concurrence 1)')

  // Le `Worker` BullMQ créé par `PipelineProcessor` (via `@nestjs/bullmq`)
  // détient une connexion Redis active, qui maintient la boucle d'événements
  // ouverte — plus besoin du minuteur `keepAlive` de l'ancien squelette.
  const shutdown = async () => {
    console.log('Arrêt demandé : fermeture propre du worker.')
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

void bootstrap()

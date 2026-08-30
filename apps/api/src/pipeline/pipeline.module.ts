import { DynamicModule, Module, Provider } from '@nestjs/common'
import { Queue } from 'bullmq'
import { AiModule } from '../ai/ai.module'
import { ArticlesModule } from '../articles/articles.module'
import { SeoModule } from '../seo/seo.module'
import { OutlineStepHandler } from './handlers/outline.handler'
import { DraftStepHandler } from './handlers/draft.handler'
import { PipelineService } from './pipeline.service'
import { PipelineResolver } from './pipeline.resolver'
import { BullPipelineQueue, InlinePipelineQueue, PIPELINE_QUEUE, PIPELINE_QUEUE_NAME } from './pipeline-queue'
import type { PipelineJobData } from './pipeline-queue'

/**
 * `bullmq` (le paquet bas niveau) fonctionne sous ts-jest — vérifié à la
 * main : `import { Queue } from 'bullmq'` ci-dessus ne casse aucun test.
 * `@nestjs/bullmq`, lui, est publié en ESM pur (`"type": "module"`, aucun
 * export CommonJS réel malgré la clé `require` de son `package.json`) :
 * un `import` statique de ce paquet en tête de fichier fait échouer TOUT
 * test qui charge `PipelineModule` (donc `AppModule`, donc la quasi-totalité
 * de la suite `test:int`) avec `SyntaxError: Unexpected token 'export'` —
 * constaté empiriquement avant d'écrire ce fichier. `node dist/main.js`
 * (Node réel, pas le chargeur CommonJS sandboxé de Jest) le charge sans
 * problème (Node 22+ sait faire un `require()` synchrone d'un graphe ESM).
 *
 * D'où ce `require()` différé, exécuté seulement quand
 * `PIPELINE_QUEUE_DRIVER=bullmq` (jamais en test, voir `.env.test` :
 * `PIPELINE_QUEUE_DRIVER=inline`) : Jest ne voit jamais ce paquet tant que
 * cette branche n'est pas exécutée, contrairement à un `import` statique,
 * toujours chargé même mort. `PipelineProcessor` (le VRAI worker BullMQ,
 * `pipeline.processor.ts`) fait le choix inverse — import statique — parce
 * qu'aucun test ne le charge jamais (voir sa jsdoc) : c'est `node
 * dist/worker.js` qui en fait foi, pas Jest.
 */
function loadBullModule(): typeof import('@nestjs/bullmq') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- voir la jsdoc de `loadBullModule` : import statique interdit (ESM pur, casse ts-jest)
  return require('@nestjs/bullmq') as typeof import('@nestjs/bullmq')
}

function parseRedisUrl(url: string): { host: string; port: number; username?: string; password?: string } {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
  }
}

/** `bullmq` (production/dev) ou `inline` (tests d'intégration — voir la jsdoc de `pipeline-queue.ts`). Jamais un repli implicite sur `inline` : une valeur inconnue échoue bruyamment, même politique que `AI_PROVIDER` (`ai.module.ts`). */
function readDriver(): 'bullmq' | 'inline' {
  const raw = process.env.PIPELINE_QUEUE_DRIVER ?? 'bullmq'
  if (raw !== 'bullmq' && raw !== 'inline') {
    throw new Error(`PIPELINE_QUEUE_DRIVER invalide : "${raw}". Valeurs acceptées : bullmq, inline.`)
  }
  return raw
}

const DRIVER = readDriver()

const queueImports: DynamicModule[] =
  DRIVER === 'bullmq'
    ? (() => {
        const { BullModule } = loadBullModule()
        return [
          BullModule.forRootAsync({
            useFactory: () => ({ connection: parseRedisUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379') }),
          }),
          BullModule.registerQueue({ name: PIPELINE_QUEUE_NAME }),
        ]
      })()
    : []

const queueProvider: Provider =
  DRIVER === 'bullmq'
    ? {
        provide: PIPELINE_QUEUE,
        inject: [loadBullModule().getQueueToken(PIPELINE_QUEUE_NAME)],
        useFactory: (queue: Queue<PipelineJobData>) => new BullPipelineQueue(queue),
      }
    : { provide: PIPELINE_QUEUE, useClass: InlinePipelineQueue }

@Module({
  imports: [AiModule, ArticlesModule, SeoModule, ...queueImports],
  providers: [PipelineService, OutlineStepHandler, DraftStepHandler, queueProvider, PipelineResolver],
  // `PipelineService` (utilisé par `worker.ts`, hors de cet `AppModule`) et
  // `PIPELINE_QUEUE` (la file BullMQ enregistrée ci-dessus, dont
  // `PipelineProcessor` a besoin — voir sa jsdoc sur la découverte globale de
  // `@nestjs/bullmq`) sont tous deux exportés : `AppModule` doit lui-même
  // réexporter ce module pour que `worker.ts` (qui importe `AppModule`, pas
  // directement `PipelineModule`) puisse les atteindre.
  exports: [PipelineService, PIPELINE_QUEUE],
})
export class PipelineModule {}

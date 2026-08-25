import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

// Bootstrap standalone : aucun serveur HTTP. Les processeurs BullMQ arrivent au Lot 2.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  console.log('Worker démarré, en attente de jobs')
  const shutdown = async () => { await app.close(); process.exit(0) }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

void bootstrap()

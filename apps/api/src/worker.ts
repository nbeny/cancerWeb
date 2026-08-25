import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

// Bootstrap standalone : aucun serveur HTTP. Les processeurs BullMQ arrivent au Lot 2.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  console.log('Worker démarré, en attente de jobs')
  // Tant qu'aucun processeur BullMQ (Lot 2) n'ouvre de connexion active, ce
  // contexte applicatif ne détient aucun handle libuv qui retiendrait la
  // boucle d'événements : sans ce minuteur, Node se termine juste après ce
  // bootstrap (constaté en conteneur : sortie immédiate en code 0), rendant
  // illusoires les gestionnaires SIGTERM/SIGINT ci-dessous. Un `Promise`
  // jamais résolue ne suffit pas — seule une ressource libuv active
  // (timer, socket…) empêche la boucle de se vider.
  const keepAlive = setInterval(() => {}, 1 << 30)
  const shutdown = async () => { clearInterval(keepAlive); await app.close(); process.exit(0) }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

void bootstrap()

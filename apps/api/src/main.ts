import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import type { Response } from 'express'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { parseEnv } from './config/env'

async function bootstrap() {
  // bufferLogs : les logs émis avant que app.useLogger() ne remplace le
  // logger Nest par défaut sont mis en file d'attente puis rejoués par pino.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  // La pile tourne derrière Caddy (un seul hop de confiance) : sans ceci,
  // Express ignore `X-Forwarded-For` et `req.ip` vaut toujours l'IP du
  // conteneur proxy pour tout le trafic externe, ce qui agrège le rate
  // limiting et le journal d'accès sur une clé unique partagée par tous
  // les clients.
  app.set('trust proxy', 1)
  // AppModule instancie ConfigModule, qui charge le .env racine (effet de
  // bord dotenv sur process.env) avant que parseEnv ne soit relu ici.
  const env = parseEnv(process.env)
  app.use(cookieParser())
  // CSP désactivée : l'API ne sert pas de HTML. Elle sera définie côté
  // Next.js pour le blog public (Lot 3).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.getHttpAdapter().getInstance().get('/health', (_req: unknown, res: Response) =>
    res.json({ status: 'ok' }),
  )
  await app.listen(env.API_PORT)
  console.log(`API prête sur http://localhost:${env.API_PORT}`)
}

void bootstrap()

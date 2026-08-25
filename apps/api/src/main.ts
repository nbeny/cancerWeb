import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { parseEnv } from './config/env'

async function bootstrap() {
  // bufferLogs : les logs émis avant que app.useLogger() ne remplace le
  // logger Nest par défaut sont mis en file d'attente puis rejoués par pino.
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  // AppModule instancie ConfigModule, qui charge le .env racine (effet de
  // bord dotenv sur process.env) avant que parseEnv ne soit relu ici.
  const env = parseEnv(process.env)
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.getHttpAdapter().getInstance().get('/health', (_req: unknown, res: any) =>
    res.json({ status: 'ok' }),
  )
  await app.listen(env.API_PORT)
  console.log(`API prête sur http://localhost:${env.API_PORT}`)
}

void bootstrap()

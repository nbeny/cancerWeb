import { INestApplication, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Test, TestingModuleBuilder } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

export interface Harness {
  app: INestApplication
  prisma: PrismaService
  gql: (query: string, variables?: Record<string, unknown>, cookies?: string[]) => request.Test
  close: () => Promise<void>
  reset: () => Promise<void>
}

export async function createHarness(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<Harness> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
  if (configure) builder = configure(builder)
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>()
  // Doit répliquer main.ts : sinon les tests valident une configuration de
  // confiance du proxy différente de celle réellement déployée derrière Caddy.
  app.set('trust proxy', 1)
  app.use(cookieParser())
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  await app.init()

  const prisma = app.get(PrismaService)

  const gql = (query: string, variables?: Record<string, unknown>, cookies?: string[]) => {
    const req = request(app.getHttpServer()).post('/graphql').set('Content-Type', 'application/json')
    if (cookies?.length) req.set('Cookie', cookies)
    return req.send({ query, variables })
  }

  return {
    app,
    prisma,
    gql,
    reset: () => prisma.truncateAll(),
    close: async () => {
      await app.close()
    },
  }
}

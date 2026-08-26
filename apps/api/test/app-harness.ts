import { INestApplication, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Test, TestingModuleBuilder } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

interface GraphQLErrorBody {
  errors?: Array<{ extensions?: { code?: string }; code?: string }>
}

// L'API et les anciens tests ne s'accordent pas encore forcément sur
// l'emplacement du code d'erreur (`extensions.code` selon la norme
// GraphQL, ou une clé `code` à la racine gardée pour rétrocompatibilité) :
// ce helper couvre les deux formes plutôt que de dupliquer le repli dans
// chaque fichier de test.
export const errorCode = (body: GraphQLErrorBody): string | undefined =>
  body.errors?.[0]?.extensions?.code ?? body.errors?.[0]?.code

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

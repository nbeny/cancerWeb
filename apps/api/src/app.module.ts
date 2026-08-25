import { resolve } from 'node:path'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { parseEnv } from './config/env'
import { PrismaModule } from './prisma/prisma.module'
import { GraphQLModule } from './graphql/graphql.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { AuthModule } from './auth/auth.module'
import { DomainsModule } from './domains/domains.module'
import { GqlAuthGuard } from './common/guards/gql-auth.guard'
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware'
import { createPinoHttpOptions } from './common/logging/pino-http-options'

// Le monorepo n'a qu'un seul .env, à la racine (voir docker-compose.yml).
// __dirname pointe vers apps/api/src (ts-node) ou apps/api/dist (build) :
// remonter 3 niveaux atteint la racine du repo dans les deux cas.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnv,
      envFilePath: resolve(__dirname, '../../../.env'),
    }),
    LoggerModule.forRoot({ pinoHttp: createPinoHttpOptions() }),
    PrismaModule,
    GraphQLModule,
    AuthModule,
    DomainsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: GqlAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}

import { Module } from '@nestjs/common'
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { ConfigService } from '@nestjs/config'
import { Query, Resolver } from '@nestjs/graphql'
import depthLimit from 'graphql-depth-limit'
import { GraphQLError } from 'graphql'
import { join } from 'node:path'
import type { Request, Response } from 'express'
import { Env } from '../config/env'
import { Public } from '../common/decorators/public.decorator'

export interface GqlContext { req: Request; res: Response }

@Resolver()
class RootResolver {
  // Sonde de disponibilité : doit rester accessible sans authentification,
  // y compris maintenant que le guard global protège tout par défaut.
  @Public()
  @Query(() => String, { description: 'Horodatage serveur — sonde de disponibilité.' })
  serverTime(): string {
    return new Date().toISOString()
  }
}

@Module({
  imports: [
    NestGraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        autoSchemaFile: join(process.cwd(), '../../packages/graphql/schema.graphql'),
        sortSchema: true,
        playground: false,
        introspection: config.get('NODE_ENV') !== 'production',
        context: ({ req, res }: GqlContext) => ({ req, res }),
        validationRules: [depthLimit(config.get('GRAPHQL_MAX_DEPTH'))],
        formatError: (error) => ({
          message: error.message,
          code: error.extensions?.code ?? 'INTERNAL',
          path: error.path,
        }),
        plugins: [
          {
            async requestDidStart() {
              return {
                async didResolveOperation({ request, document, schema }) {
                  const { getComplexity, simpleEstimator } = await import('graphql-query-complexity')
                  const complexity = getComplexity({
                    schema,
                    operationName: request.operationName,
                    query: document,
                    variables: request.variables,
                    estimators: [simpleEstimator({ defaultComplexity: 1 })],
                  })
                  const max = Number(process.env.GRAPHQL_MAX_COMPLEXITY ?? 1000)
                  if (complexity > max) {
                    throw new GraphQLError(`Requête trop complexe : ${complexity} (maximum ${max})`, {
                      extensions: { code: 'QUERY_TOO_COMPLEX' },
                    })
                  }
                },
              }
            },
          },
        ],
      }),
    }),
  ],
  providers: [RootResolver],
})
export class GraphQLModule {}

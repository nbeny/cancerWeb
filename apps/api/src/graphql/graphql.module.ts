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
        // En production, l'image d'exécution ne contient pas packages/ (seul
        // apps/api en est extrait) : écrire le SDL sur disque ferait planter
        // le conteneur au démarrage. NestJS sait garder le schéma en mémoire
        // (autoSchemaFile: true) — rien n'est alors écrit sur disque. Hors
        // production (dev, test), on continue à régénérer le fichier : c'est
        // ce mécanisme que la CI utilise pour détecter un schéma périmé.
        autoSchemaFile:
          config.get('NODE_ENV') === 'production'
            ? true
            : join(process.cwd(), '../../packages/graphql/schema.graphql'),
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
                  // Lu via ConfigService (déjà validé par parseEnv/zod), comme
                  // GRAPHQL_MAX_DEPTH ci-dessus — pas `Number(process.env...)`,
                  // qui court-circuite cette validation : une valeur non
                  // numérique y donnerait NaN, et `complexity > NaN` est
                  // toujours faux, désactivant la limite sans erreur.
                  const max = config.get('GRAPHQL_MAX_COMPLEXITY')
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

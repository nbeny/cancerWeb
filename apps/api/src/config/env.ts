import { z } from 'zod'

// Préfixe des valeurs d'exemple de .env.example (JWT_ACCESS_SECRET,
// JWT_REFRESH_SECRET...). Ces valeurs satisfont déjà le minimum de 32
// caractères exigé ci-dessous : rien d'autre n'empêcherait de démarrer en
// production avec les secrets versionnés dans le dépôt.
const PLACEHOLDER_SECRET_PREFIX = 'change-me-'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    API_PORT: z.coerce.number().int().positive().default(4000),
    PUBLIC_ORIGIN: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET doit faire au moins 32 caractères'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    GRAPHQL_MAX_DEPTH: z.coerce.number().int().positive().default(8),
    GRAPHQL_MAX_COMPLEXITY: z.coerce.number().int().positive().default(1000),
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(200),
    // Pas de valeur par défaut : un déploiement qui oublie de la fixer doit
    // échouer bruyamment au démarrage plutôt que de retomber silencieusement
    // sur `fake`, ce qui ferait tourner de la génération factice en
    // production sans que personne ne s'en aperçoive.
    AI_PROVIDER: z.enum(['fake', 'cli', 'http'], {
      message: "AI_PROVIDER doit valoir l'une de : fake, cli, http",
    }),
    // Lue directement via `process.env` par `pipeline.module.ts` (même motif
    // que `AI_PROVIDER` dans `ai.module.ts` : la valeur choisit du code
    // IMPORTÉ statiquement ou non, avant que Nest n'ait fini de construire
    // `ConfigService`) — déclarée ici uniquement pour que `parseEnv` échoue
    // tôt et lisiblement sur une valeur invalide. `bullmq` par défaut
    // (production/dev) ; `.env.test` la force à `inline` pour que la suite
    // d'intégration n'ouvre jamais de connexion Redis (voir
    // `pipeline-queue.ts`).
    PIPELINE_QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (env[key].startsWith(PLACEHOLDER_SECRET_PREFIX)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} utilise encore la valeur d'exemple de .env.example : impossible de démarrer en production avec ce secret`,
        })
      }
    }
  })

export type Env = z.infer<typeof schema>

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Configuration d'environnement invalide :\n${details}`)
  }
  return result.data
}

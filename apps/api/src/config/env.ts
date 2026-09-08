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
    // --- Revalidation du blog public (Tâche 7) ---
    // Racine du front Next.js JOIGNABLE DEPUIS L'API (`http://web:3001` dans
    // le réseau Docker), pas `PUBLIC_ORIGIN` : cette dernière est l'URL vue
    // par le navigateur (`http://localhost:3000`, servie par Caddy), qui
    // depuis le conteneur `api` ne désigne pas le front mais l'API elle-même.
    //
    // Les deux sont OPTIONNELLES, contrairement à `AI_PROVIDER` : une API qui
    // refuserait de démarrer faute de savoir prévenir le front rendrait le
    // back-office indisponible pour un service purement cosmétique. Non
    // renseignées, la notification est ignorée avec un avertissement au
    // journal (voir `RevalidationService`), et le plancher de revalidation
    // d'une heure posé côté web garde le blog frais en attendant.
    WEB_INTERNAL_URL: z.string().url().optional(),
    // Partagé avec le service `web` (voir docker-compose.yml) : c'est le seul
    // élément qui distingue une notification légitime de l'API d'un appel
    // arbitraire au webhook, joignable depuis tout le réseau du conteneur.
    REVALIDATE_SECRET: z.string().min(1).optional(),
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
    // Même règle pour le secret du webhook de revalidation, à ceci près qu'il
    // est optionnel : on ne le contrôle que s'il est renseigné. Le laisser à
    // la valeur d'exemple en production reviendrait à publier le secret dans
    // le dépôt, donc à laisser n'importe qui purger le cache du blog à
    // volonté — une amplification de charge triviale vers l'API.
    if (env.REVALIDATE_SECRET?.startsWith(PLACEHOLDER_SECRET_PREFIX)) {
      ctx.addIssue({
        code: 'custom',
        path: ['REVALIDATE_SECRET'],
        message:
          "REVALIDATE_SECRET utilise encore la valeur d'exemple de .env.example : impossible de démarrer en production avec ce secret",
      })
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

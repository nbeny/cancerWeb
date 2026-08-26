import type { createHarness as CreateHarness, Harness } from './app-harness'

// `ConfigModule.forRoot(...)` s'exécute au moment où le décorateur `@Module`
// d'AppModule est évalué, c'est-à-dire au premier `require` de
// `src/app.module.ts` — pas à chaque `createHarness()`. La variable doit
// donc être posée avant le premier `require` de `./app-harness` pour que
// `parseEnv` la voie au démarrage.
process.env.GRAPHQL_MAX_COMPLEXITY = '2'

// `import` serait hissé au-dessus de l'affectation de `process.env` ci-dessus
// et casserait l'ordre requis : `require` reste ici le seul moyen d'obtenir
// une exécution différée et donc de contrôler l'ordre d'évaluation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHarness } = require('./app-harness') as { createHarness: typeof CreateHarness }

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })

describe('limite de complexité GraphQL', () => {
  it('laisse passer une requête à la limite configurée au démarrage', async () => {
    // `serverTime` a une complexité de 1 (estimateur par défaut) : deux
    // occurrences atteignent exactement la limite de 2 posée ci-dessus.
    const res = await h.gql(`{ a: serverTime b: serverTime }`)
    expect(res.body.errors).toBeUndefined()
  })

  it('rejette une requête qui dépasse la limite configurée au démarrage', async () => {
    const res = await h.gql(`{ a: serverTime b: serverTime c: serverTime }`)
    // formatError (graphql.module.ts) place le code sous `extensions.code`
    // (norme GraphQL) et le duplique au premier niveau (`code`) par
    // rétrocompatibilité avec le code front existant.
    expect(res.body.errors?.[0]?.extensions?.code).toBe('QUERY_TOO_COMPLEX')
    expect(res.body.errors?.[0]?.code).toBe('QUERY_TOO_COMPLEX')
  })

  // Avant le correctif, le plugin relisait `process.env.GRAPHQL_MAX_COMPLEXITY`
  // à *chaque requête* via `Number(process.env... ?? 1000)`, en court-circuitant
  // ConfigService. `ConfigService.get()` renvoie au contraire la valeur figée
  // et validée au démarrage (voir `getFromValidatedEnv` dans
  // @nestjs/config/dist/config.service.js, consultée avant tout retour au
  // `process.env` courant) : une modification de `process.env` après coup ne
  // doit donc avoir aucun effet. Avec l'ancien code, la même mutation ferait
  // lire une chaîne non numérique, `Number(...)` donnerait NaN, et
  // `complexity > NaN` étant toujours faux, la limite disparaîtrait sans
  // erreur — silencieusement, en pleine exécution, sans jamais retoucher au
  // démarrage de l'application.
  it("reste appliquée même si process.env est corrompu après le démarrage (ConfigService ignore la mutation)", async () => {
    process.env.GRAPHQL_MAX_COMPLEXITY = 'pas-un-nombre'
    try {
      const res = await h.gql(`{ a: serverTime b: serverTime c: serverTime }`)
      expect(res.body.errors?.[0]?.code).toBe('QUERY_TOO_COMPLEX')
    } finally {
      process.env.GRAPHQL_MAX_COMPLEXITY = '2'
    }
  })
})

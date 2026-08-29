import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })

// Profondeur (Task 11) : `Category.parent` (auto-référence, voir
// `articles/category.resolver.ts`) est le premier champ du schéma qui
// permette de dépasser GRAPHQL_MAX_DEPTH=8 sans fabriquer un chemin
// artificiel — vérifié en lisant le SDL généré
// (`packages/graphql/schema.graphql` : `Article.category: Category`,
// `Category.parent: Category`) avant d'écrire cette requête, précisément
// pour éviter l'erreur déjà commise deux fois sur ce projet (une requête
// invalide qui échoue sur « champ inconnu » et donne un test vert qui ne
// teste rien). `Article.author`/`Article.domain` seuls n'auraient pas
// suffi : `User` et `Domain` n'ont aucun champ objet, donc aucune
// profondeur au-delà de leurs scalaires.
//
// Calcul de la profondeur (algorithme de `graphql-depth-limit`, lu dans
// `node_modules/graphql-depth-limit/index.js` : chaque champ NON préfixé
// `__` avec une sélection ajoute un niveau) pour
// `articles { items { category { parent×6 { id } } } }` :
// articles(1) → items(2) → category(3) → parent×6(4..9) → id(10) : la
// vérification échoue dès que la profondeur dépasse 8, ce qui arrive
// exactement à partir du 6ᵉ `parent` imbriqué (5 `parent` seuls resteraient
// sous la limite).
const DEEP_QUERY = `
  query ($domainId: ID!) {
    articles(domainId: $domainId) {
      items {
        category {
          parent { parent { parent { parent { parent { parent { id } } } } } }
        }
      }
    }
  }`

const wideQuery = (fields: number): string =>
  `{ ${Array.from({ length: fields }, (_, i) => `a${i}: serverTime`).join(' ')} }`

describe('garde-fous GraphQL', () => {
  it('rejette une requête trop complexe', async () => {
    const res = await h.gql(wideQuery(1001))
    expect(res.body.errors?.[0]?.message).toMatch(/complexe|complex/i)
    expect(res.body.errors?.[0]?.extensions?.code).toBe('QUERY_TOO_COMPLEX')
  })

  it('accepte une requête sous le seuil de complexité', async () => {
    const res = await h.gql(wideQuery(50))
    expect(res.body.data.a0).toEqual(expect.any(String))
  })

  it('expose le SDL et répond à une requête triviale', async () => {
    const res = await h.gql('{ serverTime }')
    expect(res.body.data.serverTime).toEqual(expect.any(String))
  })

  it('rejette une requête dépassant la profondeur maximale (GRAPHQL_MAX_DEPTH=8)', async () => {
    // La validation de profondeur a lieu avant l'exécution (comme la
    // complexité ci-dessus, voir `wideQuery` sans authentification) : nul
    // besoin d'un domaine réel ni d'être authentifié pour l'exercer.
    const res = await h.gql(DEEP_QUERY, { domainId: 'peu-importe' })
    expect(res.body.data).toBeUndefined()
    expect(res.body.errors?.[0]?.message).toMatch(/depth|profondeur/i)
  })

  it('accepte une requête sous la limite de profondeur (5 `parent` imbriqués, un de moins que la limite)', async () => {
    const SHALLOWER_QUERY = `
      query ($domainId: ID!) {
        articles(domainId: $domainId) {
          items {
            category {
              parent { parent { parent { parent { parent { id } } } } }
            }
          }
        }
      }`
    const res = await h.gql(SHALLOWER_QUERY, { domainId: 'peu-importe' })
    // Pas d'erreur de PROFONDEUR : la requête peut échouer plus loin (pas de
    // domaine réel, pas d'authentification), mais jamais avec un message
    // mentionnant la profondeur.
    const messages = (res.body.errors ?? []).map((e: { message: string }) => e.message)
    expect(messages.some((m: string) => /depth|profondeur/i.test(m))).toBe(false)
  })
})

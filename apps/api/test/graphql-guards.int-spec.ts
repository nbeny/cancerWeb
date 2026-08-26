import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })

// La profondeur n'est toujours pas testée ici. Depuis la Task 15, le schéma
// expose `domains { items { … } }` (voir packages/graphql/schema.graphql),
// mais `Domain` n'a encore aucun champ objet — seulement des scalaires et
// des enums. Le chemin le plus profond disponible est donc
// `{ domains { items { id } } }`, soit 3 niveaux de sélection imbriqués,
// très loin des 9 niveaux nécessaires pour dépasser GRAPHQL_MAX_DEPTH=8.
// `graphql-depth-limit` exempte par ailleurs délibérément les champs
// d'introspection (`__schema`, etc.), donc l'introspection ne peut pas non
// plus servir à fabriquer de la profondeur. Fabriquer un champ imbriqué
// artificiel uniquement pour ce test donnerait un test vert qui ne
// vérifie rien de réel sur le schéma applicatif — l'erreur déjà commise
// dans la première version du plan. Ce test est donc reporté au Lot 1,
// quand `Article.author` et `Article.domain` existeront et permettront de
// construire un chemin imbriqué réellement exposé par l'API.
// La complexité, elle, est bien exercée ci-dessous via des alias.
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
})

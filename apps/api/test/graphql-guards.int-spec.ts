import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })

// La profondeur n'est pas testée ici : le schéma ne contient à ce stade que
// `serverTime`, un scalaire non imbricable, et `graphql-depth-limit` exempte
// délibérément les champs d'introspection (`__schema`, etc.) du calcul de
// profondeur — on ne peut donc pas exercer ce garde-fou sans un vrai champ
// imbriqué. Ce test est déplacé à la Task 15, où `domains { items { … } }`
// fournira une imbrication réelle. La complexité, elle, l'est via des alias.
const wideQuery = (fields: number): string =>
  `{ ${Array.from({ length: fields }, (_, i) => `a${i}: serverTime`).join(' ')} }`

describe('garde-fous GraphQL', () => {
  it('rejette une requête trop complexe', async () => {
    const res = await h.gql(wideQuery(1001))
    expect(res.body.errors?.[0]?.message).toMatch(/complexe|complex/i)
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

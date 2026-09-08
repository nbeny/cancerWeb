import { isDuplicateTitle, normalizeTitle } from './topic-similarity'

describe('normalizeTitle', () => {
  it('efface casse, accents, ponctuation et espaces superflus', () => {
    expect(normalizeTitle('  L’Immunothérapie : Où en EST-on ?  ')).toBe('immunotherapie ou en est on')
  })
})

describe('isDuplicateTitle', () => {
  const existing = [
    'Bonnes pratiques des mots de passe',
    'Zero Trust en entreprise',
  ]

  it.each([
    ['Les mots de passe : bonnes pratiques', 'reformulation par réordonnancement'],
    ['BONNES PRATIQUES DES MOTS DE PASSE', 'casse seule'],
    ['Bonnes pratiques des mots de passe', 'titre identique'],
  ])('considère %s comme un doublon (%s)', (candidate) => {
    expect(isDuplicateTitle(candidate, existing)).toBe(true)
  })

  it.each([
    ['Zero Trust pour les PME', 'même thème, périmètre différent'],
    ['Gérer les fuites de données', 'sujet sans rapport'],
    ['Authentification multifacteur en pratique', 'proche thématiquement, mots différents'],
  ])('laisse passer %s (%s)', (candidate) => {
    expect(isDuplicateTitle(candidate, existing)).toBe(false)
  })

  it('ne trouve aucun doublon face à une liste vide', () => {
    expect(isDuplicateTitle('Un sujet quelconque', [])).toBe(false)
  })
})

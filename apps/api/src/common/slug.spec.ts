import { slugify } from './slug'

describe('slugify', () => {
  it('met en minuscules et remplace les espaces', () => {
    expect(slugify('Zero Trust en 2026')).toBe('zero-trust-en-2026')
  })
  it('supprime les accents', () => {
    expect(slugify('Sécurité des données')).toBe('securite-des-donnees')
  })
  it('supprime la ponctuation et les tirets en trop', () => {
    expect(slugify('  API GraphQL : quels risques ?! ')).toBe('api-graphql-quels-risques')
  })
  it('tronque à 80 caractères sans laisser de tiret final', () => {
    const slug = slugify('a'.repeat(50) + ' ' + 'b'.repeat(50))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
  it('retourne une chaîne non vide pour une entrée sans caractère alphanumérique', () => {
    expect(slugify('!!!')).toBe('n-a')
  })
})

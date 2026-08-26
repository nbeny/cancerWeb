import { createDomainSchema } from '@cancerweb/validation'

// Ce schéma doit refléter exactement les bornes serveur de
// apps/api/src/domains/domain.types.ts (CreateDomainInput) : ce test sert
// de garde-fou si l'un des deux dérive de l'autre.
const valid = {
  name: 'Cybersécurité',
  language: 'fr' as const,
  tone: 'PROFESSIONAL' as const,
  expertiseLevel: 'INTERMEDIATE' as const,
}

describe('createDomainSchema', () => {
  it('accepte des valeurs valides', () => {
    expect(createDomainSchema.safeParse(valid).success).toBe(true)
  })

  it('rejette un nom trop court', () => {
    expect(createDomainSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false)
  })

  it('rejette un nom de plus de 80 caractères', () => {
    expect(createDomainSchema.safeParse({ ...valid, name: 'a'.repeat(81) }).success).toBe(false)
  })

  it('rejette une description de plus de 500 caractères', () => {
    expect(createDomainSchema.safeParse({ ...valid, description: 'a'.repeat(501) }).success).toBe(false)
  })

  it('rejette des instructions IA de plus de 4000 caractères', () => {
    expect(createDomainSchema.safeParse({ ...valid, aiInstructions: 'a'.repeat(4001) }).success).toBe(false)
  })

  it('rejette un code pays qui n’est pas dans la liste ISO 3166-1 alpha-2', () => {
    expect(createDomainSchema.safeParse({ ...valid, country: 'ZZ' }).success).toBe(false)
    expect(createDomainSchema.safeParse({ ...valid, country: 'FRA' }).success).toBe(false)
  })

  it('accepte un code pays valide même en minuscules', () => {
    expect(createDomainSchema.safeParse({ ...valid, country: 'fr' }).success).toBe(true)
  })

  it('rejette une langue non supportée', () => {
    expect(createDomainSchema.safeParse({ ...valid, language: 'de' }).success).toBe(false)
  })

  it('rejette plus de 20 cibles', () => {
    const targetAudience = Array.from({ length: 21 }, (_, i) => `cible-${i}`)
    expect(createDomainSchema.safeParse({ ...valid, targetAudience }).success).toBe(false)
  })

  it('rejette plus de 50 mots-clés', () => {
    const keywords = Array.from({ length: 51 }, (_, i) => `mot-${i}`)
    expect(createDomainSchema.safeParse({ ...valid, keywords }).success).toBe(false)
  })
})

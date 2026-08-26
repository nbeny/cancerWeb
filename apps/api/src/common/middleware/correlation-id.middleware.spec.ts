import { isValidCorrelationId, resolveCorrelationId } from './correlation-id.middleware'

describe('isValidCorrelationId', () => {
  it('accepte un UUID', () => {
    expect(isValidCorrelationId('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(true)
  })

  it('accepte une chaîne alphanumérique/tiret courte', () => {
    expect(isValidCorrelationId('req-abc123')).toBe(true)
  })

  it('rejette une chaîne trop longue', () => {
    expect(isValidCorrelationId('a'.repeat(65))).toBe(false)
  })

  it('rejette des caractères de contrôle', () => {
    expect(isValidCorrelationId('abc\r\nX-Injected: 1')).toBe(false)
  })

  it('rejette une valeur non-string', () => {
    expect(isValidCorrelationId(undefined)).toBe(false)
    expect(isValidCorrelationId(42)).toBe(false)
  })
})

describe('resolveCorrelationId', () => {
  it('conserve une valeur client valide', () => {
    expect(resolveCorrelationId('req-abc123')).toBe('req-abc123')
  })

  it('génère un nouvel identifiant quand la valeur client est invalide', () => {
    const resolved = resolveCorrelationId('a'.repeat(200))
    expect(resolved).not.toBe('a'.repeat(200))
    expect(isValidCorrelationId(resolved)).toBe(true)
  })

  it('génère un nouvel identifiant quand aucune valeur client n\'est fournie', () => {
    const resolved = resolveCorrelationId(undefined)
    expect(isValidCorrelationId(resolved)).toBe(true)
  })

  it('prend la première valeur si le header est répété', () => {
    expect(resolveCorrelationId(['req-abc123', 'req-def456'])).toBe('req-abc123')
  })
})

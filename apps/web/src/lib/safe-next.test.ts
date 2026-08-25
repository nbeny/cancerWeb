import { FALLBACK_NEXT, safeNext } from './safe-next'

const BASE = 'http://localhost:3000/api/auth/refresh'

describe('safeNext', () => {
  it('conserve un chemin interne et sa query', () => {
    expect(safeNext('/dashboard/domains?page=2', BASE)).toBe('/dashboard/domains?page=2')
  })

  it('retombe sur le tableau de bord quand rien n’est fourni', () => {
    expect(safeNext(null, BASE)).toBe(FALLBACK_NEXT)
    expect(safeNext('', BASE)).toBe(FALLBACK_NEXT)
  })

  // Chaque entrée ci-dessous est une tentative de redirection ouverte réelle.
  // L'antislash est le cas piégeux : une validation par préfixe de chaîne le
  // laisse passer, puis le parseur d'URL le normalise en slash et l'utilisateur
  // atterrit sur un domaine tiers après s'être authentifié.
  it.each([
    ['URL absolue', 'https://evil.example'],
    ['protocole-relatif', '//evil.example'],
    ['antislash', '/\\evil.example'],
    ['antislash double', '/\\\\evil.example'],
    ['antislash puis slash', '/\\/evil.example'],
    ['schéma javascript', 'javascript:alert(1)'],
    ['chemin absolu avec hôte', 'http://evil.example/dashboard'],
  ])('neutralise une redirection hors domaine (%s)', (_label, candidate) => {
    const result = safeNext(candidate, BASE)
    expect(result).toBe(FALLBACK_NEXT)
    expect(new URL(result, BASE).origin).toBe('http://localhost:3000')
  })

  it('ne renvoie jamais une origine absolue, même pour la bonne origine', () => {
    expect(safeNext('http://localhost:3000/dashboard/domains', BASE)).toBe('/dashboard/domains')
  })
})

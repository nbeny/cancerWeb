import { vi } from 'vitest'

const redirectMock = vi.fn((path: string) => {
  // next/navigation#redirect s'implémente en lançant une exception spéciale
  // pour interrompre le rendu ; on simule cet effet pour vérifier qu'aucun
  // code n'essaie de continuer après un appel à redirect().
  throw Object.assign(new Error(`NEXT_REDIRECT:${path}`), { digest: `NEXT_REDIRECT;${path}` })
})
const meMock = vi.fn()

vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => '' }) }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/graphql-client', () => ({ serverSdk: () => ({ Me: meMock }) }))

const { default: DashboardLayout } = await import('./layout')

const unauthenticated = {
  response: { errors: [{ message: 'Authentification requise', extensions: { code: 'UNAUTHENTICATED' } }] },
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    meMock.mockReset()
  })

  it('redirige vers /auth/login uniquement quand Me() échoue en UNAUTHENTICATED', async () => {
    meMock.mockRejectedValue(unauthenticated)

    await expect(DashboardLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/auth/login')
    expect(redirectMock).toHaveBeenCalledWith('/auth/login')
  })

  // Avant la correction, le catch nu redirigeait quelle que soit la cause :
  // une API arrêtée, un timeout ou une erreur de schéma éjectaient
  // silencieusement l'utilisateur vers le login, masquant l'incident réel.
  it('ne redirige pas et laisse remonter toute autre panne (API arrêtée, timeout, erreur de schéma)', async () => {
    const outage = new Error('fetch failed: ECONNREFUSED')
    meMock.mockRejectedValue(outage)

    await expect(DashboardLayout({ children: null })).rejects.toBe(outage)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('affiche le tableau de bord quand Me() réussit', async () => {
    meMock.mockResolvedValue({ data: { me: { name: 'Alice' } } })

    const element = await DashboardLayout({ children: null })
    expect(element).toBeTruthy()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

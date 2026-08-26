import { isTrustedFetchSite } from './fetch-metadata'

describe('isTrustedFetchSite', () => {
  it('accepte same-origin', () => {
    expect(isTrustedFetchSite('same-origin')).toBe(true)
  })

  it('accepte same-site', () => {
    expect(isTrustedFetchSite('same-site')).toBe(true)
  })

  it('refuse cross-site', () => {
    expect(isTrustedFetchSite('cross-site')).toBe(false)
  })

  it('refuse none (navigation directe, sans initiateur)', () => {
    expect(isTrustedFetchSite('none')).toBe(false)
  })

  it('refuse quand l’en-tête est absent (navigateur ancien ou client non-navigateur)', () => {
    expect(isTrustedFetchSite(null)).toBe(false)
  })
})

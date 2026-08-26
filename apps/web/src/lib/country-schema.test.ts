import { isIsoCountryCode } from '@cancerweb/validation'

describe('isIsoCountryCode', () => {
  it('accepte un code ISO 3166-1 alpha-2 valide', () => {
    expect(isIsoCountryCode('FR')).toBe(true)
    expect(isIsoCountryCode('US')).toBe(true)
  })

  it('rejette un code qui ressemble à un code pays mais n’en est pas un', () => {
    expect(isIsoCountryCode('ZZ')).toBe(false)
  })

  it('est sensible à la casse (la normalisation est à la charge de l’appelant)', () => {
    expect(isIsoCountryCode('fr')).toBe(false)
  })
})

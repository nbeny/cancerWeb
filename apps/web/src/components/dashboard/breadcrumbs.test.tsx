import { segmentsFromPathname } from './breadcrumbs'

describe('segmentsFromPathname', () => {
  it('découpe un chemin en segments non vides', () => {
    expect(segmentsFromPathname('/dashboard/domains/new')).toEqual(['dashboard', 'domains', 'new'])
  })

  it('ignore les doubles slashs et le slash final', () => {
    expect(segmentsFromPathname('/dashboard//domains/')).toEqual(['dashboard', 'domains'])
  })

  it('renvoie un tableau vide pour la racine', () => {
    expect(segmentsFromPathname('/')).toEqual([])
  })
})

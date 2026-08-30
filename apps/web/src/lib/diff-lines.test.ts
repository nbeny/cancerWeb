import { diffLinesByLine } from './diff-lines'

describe('diffLinesByLine', () => {
  it('renvoie une seule ligne inchangée pour un contenu identique', () => {
    expect(diffLinesByLine('a\nb', 'a\nb')).toEqual([
      { type: 'unchanged', value: 'a' },
      { type: 'unchanged', value: 'b' },
    ])
  })

  it('détecte une ligne ajoutée', () => {
    const result = diffLinesByLine('a', 'a\nb')
    expect(result).toEqual([
      { type: 'unchanged', value: 'a' },
      { type: 'added', value: 'b' },
    ])
  })

  it('détecte une ligne supprimée', () => {
    const result = diffLinesByLine('a\nb', 'a')
    expect(result).toEqual([
      { type: 'unchanged', value: 'a' },
      { type: 'removed', value: 'b' },
    ])
  })

  it('détecte une ligne modifiée comme suppression + ajout', () => {
    const result = diffLinesByLine('a\nb\nc', 'a\nX\nc')
    expect(result).toEqual([
      { type: 'unchanged', value: 'a' },
      { type: 'removed', value: 'b' },
      { type: 'added', value: 'X' },
      { type: 'unchanged', value: 'c' },
    ])
  })

  it('ne produit pas de ligne fantôme pour une chaîne vide', () => {
    expect(diffLinesByLine('', '')).toEqual([])
  })
})

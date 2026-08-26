import { parse } from './parse'
import { splitSections } from './sections'

describe('splitSections', () => {
  it('renvoie une section unique heading: null pour un texte sans titre', () => {
    const md = 'Un simple paragraphe, sans aucun titre.'

    const sections = splitSections(parse(md))

    expect(sections).toEqual([
      { heading: null, depth: 0, startLine: 1, endLine: 1 },
    ])
  })

  it('découpe le document à chaque titre', () => {
    const md = [
      '# Introduction', // ligne 1
      '', // 2
      'Texte intro.', // 3
      '', // 4
      '## Section A', // 5
      '', // 6
      'Texte A.', // 7
      '', // 8
      '## Section B', // 9
      '', // 10
      'Texte B.', // 11
    ].join('\n')

    const sections = splitSections(parse(md))

    expect(sections).toEqual([
      { heading: 'Introduction', depth: 1, startLine: 1, endLine: 4 },
      { heading: 'Section A', depth: 2, startLine: 5, endLine: 8 },
      { heading: 'Section B', depth: 2, startLine: 9, endLine: 11 },
    ])
  })

  it('place tout contenu précédant le premier titre dans une section heading: null', () => {
    const md = ['Préambule.', '', '# Titre'].join('\n')

    const sections = splitSections(parse(md))

    expect(sections[0]).toEqual({ heading: null, depth: 0, startLine: 1, endLine: 2 })
    expect(sections[1]).toEqual({ heading: 'Titre', depth: 1, startLine: 3, endLine: 3 })
  })

  it('renvoie un tableau vide pour un document vide, sans lever', () => {
    expect(() => splitSections(parse(''))).not.toThrow()
    expect(splitSections(parse(''))).toEqual([])
  })
})

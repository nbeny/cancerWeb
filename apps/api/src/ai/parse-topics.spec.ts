import { parseTopics } from './parse-topics'

describe('parseTopics', () => {
  it('parse un tableau JSON de sujets ({ title, angle })', () => {
    const text = JSON.stringify([
      { title: 'Sujet un', angle: 'Angle un' },
      { title: 'Sujet deux', angle: 'Angle deux' },
    ])
    const topics = parseTopics(text)
    expect(topics).toEqual([
      { title: 'Sujet un', suggestedAngle: 'Angle un' },
      { title: 'Sujet deux', suggestedAngle: 'Angle deux' },
    ])
  })

  it('parse un JSON même entouré de texte parasite (préambule du modèle)', () => {
    const text = `Voici les sujets proposés :\n${JSON.stringify([{ title: 'Sujet un' }])}\nVoilà !`
    const topics = parseTopics(text)
    expect(topics).toEqual([{ title: 'Sujet un' }])
  })

  it('accepte un tableau JSON de simples chaînes', () => {
    const topics = parseTopics(JSON.stringify(['Sujet un', 'Sujet deux']))
    expect(topics).toEqual([{ title: 'Sujet un' }, { title: 'Sujet deux' }])
  })

  it('ignore les entrées JSON sans titre exploitable', () => {
    const topics = parseTopics(JSON.stringify([{ title: 'Sujet un' }, { angle: 'orpheline' }, { title: '  ' }]))
    expect(topics).toEqual([{ title: 'Sujet un' }])
  })

  it('parse une liste de titres de niveau 2 en Markdown, à défaut de JSON', () => {
    const md = ['## Premier sujet', 'Angle : patients récemment diagnostiqués.', '', '## Second sujet'].join('\n')
    const topics = parseTopics(md)
    expect(topics.map((t) => t.title)).toEqual(['Premier sujet', 'Second sujet'])
  })

  it('parse une liste à puces Markdown, à défaut de titres', () => {
    const md = ['- Premier sujet', '- Second sujet', '- Troisième sujet'].join('\n')
    const topics = parseTopics(md)
    expect(topics.map((t) => t.title)).toEqual(['Premier sujet', 'Second sujet', 'Troisième sujet'])
  })

  it("échoue explicitement si aucune forme reconnue n'a produit de sujet", () => {
    expect(() => parseTopics('Je ne sais pas quoi proposer.')).toThrow(/sujet/i)
  })
})

describe('parseTopics — justification', () => {
  it('extrait rationale du JSON', () => {
    const [topic] = parseTopics('[{"title":"Zero Trust","rationale":"Comble un manque sur le domaine."}]')
    expect(topic?.rationale).toBe('Comble un manque sur le domaine.')
  })

  it('accepte aussi les clés "pourquoi" et "why"', () => {
    const [fr] = parseTopics('[{"title":"A","pourquoi":"Raison FR."}]')
    const [en] = parseTopics('[{"title":"B","why":"Raison EN."}]')
    expect(fr?.rationale).toBe('Raison FR.')
    expect(en?.rationale).toBe('Raison EN.')
  })

  it('laisse rationale absent quand le modèle ne la fournit pas', () => {
    const [topic] = parseTopics('[{"title":"Sans justification"}]')
    expect(topic?.rationale).toBeUndefined()
  })
})

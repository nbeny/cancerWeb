import { normaliserTitresCorps } from './article-headings'

// Les entrées de ce fichier ne sont pas inventées : ce sont les sorties
// réelles de `render(parse(...))` (apps/api/src/markdown), obtenues en
// exécutant le pipeline de l'API sur le Markdown correspondant. Tester ce
// module sur du HTML écrit à la main donnerait de fausses assurances : c'est
// précisément parce que la forme exacte du sérialiseur importe (échappement,
// guillemets, auto-fermeture) que ces cas ont été relevés à la source.
describe('normaliserTitresCorps', () => {
  it('retire le titre de tête, forme produite par un Markdown commençant par « # »', () => {
    expect(normaliserTitresCorps('<h1>Titre simple</h1>\n<p>Corps.</p>')).toBe('<p>Corps.</p>')
  })

  it('laisse intact un corps sans titre de tête', () => {
    expect(normaliserTitresCorps('<p>Paragraphe direct.</p>\n<h2>Section</h2>')).toBe(
      '<p>Paragraphe direct.</p>\n<h2>Section</h2>',
    )
  })

  it('retire un titre de tête contenant du balisage en ligne', () => {
    const rendu = '<h1>Titre <em>avec</em> <code>code</code></h1>\n<p>Corps.</p>'
    expect(normaliserTitresCorps(rendu)).toBe('<p>Corps.</p>')
  })

  // Un commentaire HTML retiré par la sanitation laisse un saut de ligne
  // devant le titre : celui-ci reste « en tête ».
  it('reconnaît un titre de tête précédé de blancs', () => {
    expect(normaliserTitresCorps('\n<h1>Titre</h1>\n<p>Corps.</p>')).toBe('<p>Corps.</p>')
  })

  // Un `<h1>` qui n'ouvre pas le document n'est pas le titre redonné : c'est
  // du contenu, qu'on conserve en le rétrogradant.
  it('rétrograde en h2 un h1 qui ne se trouve pas en tête', () => {
    expect(normaliserTitresCorps('<h2>Section</h2>\n<h1>Titre tardif</h1>\n<p>Corps.</p>')).toBe(
      '<h2>Section</h2>\n<h2>Titre tardif</h2>\n<p>Corps.</p>',
    )
  })

  it('retire le premier titre et rétrograde les suivants', () => {
    expect(normaliserTitresCorps('<h1>Premier</h1>\n<p>Corps.</p>\n<h1>Second</h1>\n<p>Suite.</p>')).toBe(
      '<p>Corps.</p>\n<h2>Second</h2>\n<p>Suite.</p>',
    )
  })

  it('conserve les attributs en rétrogradant, pour ne pas casser les ancres', () => {
    expect(normaliserTitresCorps('<p>Intro.</p>\n<h1 id="user-content-x">Titre</h1>')).toBe(
      '<p>Intro.</p>\n<h2 id="user-content-x">Titre</h2>',
    )
  })

  // Le piège annoncé : `hast-util-to-html` n'échappe pas le `>` dans une
  // valeur d'attribut. Une expression régulière en `<h1[^>]*>` couperait la
  // balise en plein milieu de l'attribut et produirait du HTML corrompu.
  it("gère un « > » littéral à l'intérieur d'une valeur d'attribut", () => {
    expect(normaliserTitresCorps('<h1 title="a>b">Titre</h1>\n<p>Corps.</p>')).toBe('<p>Corps.</p>')
    expect(normaliserTitresCorps('<p>Intro.</p>\n<h1 title="a>b">T</h1>')).toBe(
      '<p>Intro.</p>\n<h2 title="a>b">T</h2>',
    )
  })

  // Un article QUI PARLE de HTML : le `<h1>` y est du texte, échappé en
  // `&#x3C;h1>` par le sérialiseur. Il ne doit surtout pas être touché.
  it("ne touche pas à un « h1 » cité comme exemple de code (il est échappé)", () => {
    const rendu = '<pre><code>&#x3C;h1>Pas un vrai titre&#x3C;/h1>\n</code></pre>\n<p>Corps.</p>'
    expect(normaliserTitresCorps(rendu)).toBe(rendu)
  })

  // Cas le plus dangereux : un `<h1>` jamais fermé dans le Markdown source.
  // Le parseur HTML le referme en fin de document, si bien que l'élément
  // englobe tout l'article. Le supprimer comme un titre de tête viderait la
  // page ; on le rétrograde, aucun contenu n'est perdu.
  it('ne vide pas la page quand un h1 non fermé englobe tout le document', () => {
    const rendu = '<h1>Titre jamais ferme\n<p>Corps.</p></h1>'
    const sortie = normaliserTitresCorps(rendu)
    expect(sortie).toContain('Corps.')
    expect(sortie).toBe('<h2>Titre jamais ferme\n<p>Corps.</p></h2>')
  })

  it('gère un titre de tête vide', () => {
    expect(normaliserTitresCorps('<h1></h1>\n<p>Corps.</p>')).toBe('<p>Corps.</p>')
  })

  it('rétrograde un h1 imbriqué dans une citation sans toucher à la citation', () => {
    expect(normaliserTitresCorps('<blockquote>\n<h1>Titre cité</h1>\n</blockquote>\n<p>Corps.</p>')).toBe(
      '<blockquote>\n<h2>Titre cité</h2>\n</blockquote>\n<p>Corps.</p>',
    )
  })

  it('ne confond pas une balise dont le nom commence par h1 avec un titre', () => {
    const rendu = '<p>Intro.</p>\n<h123>Faux</h123>'
    expect(normaliserTitresCorps(rendu)).toBe(rendu)
  })

  it('laisse le document intact quand aucune balise fermante ne suit', () => {
    const rendu = '<p>Intro.</p>\n<h1>Titre sans fin'
    expect(normaliserTitresCorps(rendu)).toBe(rendu)
  })

  it('accepte un corps vide', () => {
    expect(normaliserTitresCorps('')).toBe('')
  })
})

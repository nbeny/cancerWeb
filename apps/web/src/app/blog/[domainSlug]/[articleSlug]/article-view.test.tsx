import { render, screen } from '@testing-library/react'
import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'
import { ArticleView } from './article-view'

function article(surcharges: Partial<PublicArticleFieldsFragment> = {}): PublicArticleFieldsFragment {
  return {
    id: 'a1',
    slug: 'mon-article',
    title: 'Titre affiché',
    excerpt: 'Extrait lisible',
    renderedHtml: '<h2>Section</h2><p>Corps</p>',
    coverImageUrl: null,
    wordCount: 42,
    publishedAt: '2026-03-14T09:00:00.000Z',
    seoTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    robotsIndex: true,
    robotsFollow: true,
    ...surcharges,
  }
}

describe('ArticleView', () => {
  it('affiche le titre en en-tête de niveau 1', () => {
    render(<ArticleView article={article()} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Titre affiché')
  })

  it('injecte renderedHtml tel quel, sans le réinterpréter', () => {
    const { container } = render(<ArticleView article={article()} />)
    expect(container.querySelector('h2')?.textContent).toBe('Section')
    // `getByText` et non `querySelector('p')` : la ligne de date est elle
    // aussi un `<p>`, et elle précède le corps dans le document.
    expect(screen.getByText('Corps').tagName).toBe('P')
  })

  // Le défaut trouvé en vérification live : 16 des 17 articles réels
  // commencent par « # Titre » en Markdown, donc leur `renderedHtml` porte son
  // propre `<h1>` — la page en affichait deux. Le fixture d'origine utilisait
  // un corps sans titre, la seule des deux formes qui ne reproduisait pas le
  // problème. Les deux sont désormais couvertes, et c'est le COMPTE de `<h1>`
  // qui est affirmé : une assertion sur le seul texte du titre restait verte
  // avec un doublon.
  it("n'affiche qu'un seul h1 quand le corps commence par son propre titre", () => {
    const { container } = render(
      <ArticleView
        article={article({ renderedHtml: '<h1>Titre affiché</h1>\n<p>Corps.</p>' })}
      />,
    )
    const titres = container.querySelectorAll('h1')
    expect(titres).toHaveLength(1)
    expect(titres[0].textContent).toBe('Titre affiché')
    // Le corps est conservé, seul le titre redondant disparaît.
    expect(screen.getByText('Corps.')).toBeDefined()
  })

  it("n'affiche qu'un seul h1 quand le corps n'a pas de titre de tête", () => {
    const { container } = render(
      <ArticleView
        article={article({ renderedHtml: '<p>Paragraphe direct.</p>\n<h2>Section</h2>' })}
      />,
    )
    const titres = container.querySelectorAll('h1')
    expect(titres).toHaveLength(1)
    expect(titres[0].textContent).toBe('Titre affiché')
    expect(container.querySelector('h2')?.textContent).toBe('Section')
  })

  // Le titre visible vient de la base, jamais du corps : c'est ce qui garantit
  // qu'il ne diverge ni du `<title>` ni de la balise Open Graph, tous deux
  // construits à partir des mêmes champs (voir `article-metadata.ts`).
  it('affiche le titre canonique et non celui écrit dans le Markdown', () => {
    const { container } = render(
      <ArticleView
        article={article({
          title: 'Titre canonique',
          renderedHtml: '<h1>Titre divergent du Markdown</h1>\n<p>Corps.</p>',
        })}
      />,
    )
    const titres = container.querySelectorAll('h1')
    expect(titres).toHaveLength(1)
    expect(titres[0].textContent).toBe('Titre canonique')
    expect(container.textContent).not.toContain('Titre divergent du Markdown')
  })

  it('formate la date de publication pour un lecteur français', () => {
    render(<ArticleView article={article({ publishedAt: '2026-03-14T09:00:00.000Z' })} />)
    expect(screen.getByText('14/03/2026')).toBeDefined()
  })

  // L'horodatage brut reste dans l'attribut : c'est lui que lisent les
  // machines, la forme française n'existant que pour l'œil.
  it("conserve l'horodatage ISO dans l'attribut dateTime", () => {
    const { container } = render(<ArticleView article={article()} />)
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-03-14T09:00:00.000Z')
  })

  it('affiche la couverture quand elle est renseignée, décorative pour les lecteurs d’écran', () => {
    const { container } = render(
      <ArticleView article={article({ coverImageUrl: 'https://exemple.fr/couverture.jpg' })} />,
    )
    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe('https://exemple.fr/couverture.jpg')
    expect(image?.getAttribute('alt')).toBe('')
  })

  it("n'affiche aucune image quand coverImageUrl est absente", () => {
    const { container } = render(<ArticleView article={article({ coverImageUrl: null })} />)
    expect(container.querySelector('img')).toBeNull()
  })

  // Les champs facultatifs du fragment public le sont réellement en base : la
  // page doit s'afficher, pas tomber, quand ils manquent tous.
  it('rend le titre seul quand ni date ni HTML ne sont disponibles', () => {
    const { container } = render(
      <ArticleView article={article({ publishedAt: null, renderedHtml: null, coverImageUrl: null })} />,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Titre affiché')
    expect(container.querySelector('time')).toBeNull()
    expect(screen.queryByText(/Publié le/)).toBeNull()
  })
})

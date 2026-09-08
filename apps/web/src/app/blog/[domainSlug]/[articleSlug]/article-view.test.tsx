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

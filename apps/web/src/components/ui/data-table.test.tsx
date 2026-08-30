import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
let currentSearch = ''

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/articles',
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

const { DataTable } = await import('./data-table')

interface Row {
  id: string
  title: string
}

const rows: Row[] = [
  { id: '1', title: 'Alpha' },
  { id: '2', title: 'Beta' },
]

const columns = [
  { key: 'title', header: 'Titre', sortable: true, render: (row: Row) => row.title },
  { key: 'id', header: 'Identifiant', render: (row: Row) => row.id },
]

describe('DataTable', () => {
  beforeEach(() => {
    pushMock.mockClear()
    currentSearch = ''
  })

  it('affiche les en-têtes et les cellules déclarées par les colonnes', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    expect(screen.getByText('Titre')).toBeDefined()
    expect(screen.getByText('Identifiant')).toBeDefined()
    expect(screen.getByText('Alpha')).toBeDefined()
    expect(screen.getByText('Beta')).toBeDefined()
  })

  it('utilise <th scope="col"> pour chaque en-tête', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(2)
    for (const header of headers) expect(header.getAttribute('scope')).toBe('col')
  })

  it('affiche un état vide personnalisé quand il n’y a aucune ligne', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        totalCount={0}
        page={1}
        pageSize={20}
        emptyState={<p>Rien à afficher</p>}
      />,
    )
    expect(screen.getByText('Rien à afficher')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('reflète l’absence de tri par aria-sort="none" sur une colonne triable', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    const titleHeader = screen.getByRole('columnheader', { name: /Titre/ })
    expect(titleHeader.getAttribute('aria-sort')).toBe('none')
  })

  it('ne pose pas aria-sort sur une colonne non triable', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    const idHeader = screen.getByRole('columnheader', { name: /Identifiant/ })
    expect(idHeader.hasAttribute('aria-sort')).toBe(false)
  })

  it('reflète le tri courant lu dans l’URL', () => {
    currentSearch = 'sort=title'
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    expect(screen.getByRole('columnheader', { name: /Titre/ }).getAttribute('aria-sort')).toBe('ascending')
  })

  it('reflète un tri descendant (préfixe "-") lu dans l’URL', () => {
    currentSearch = 'sort=-title'
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    expect(screen.getByRole('columnheader', { name: /Titre/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it('clique sur un en-tête non trié pousse `sort=<key>` et réinitialise la page', () => {
    currentSearch = 'page=3'
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={3} pageSize={20} />)
    fireEvent.click(screen.getByRole('button', { name: /Titre/ }))
    expect(pushMock).toHaveBeenCalledWith('/dashboard/articles?sort=title')
  })

  it('un deuxième clic sur la même colonne passe en tri descendant', () => {
    currentSearch = 'sort=title'
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    fireEvent.click(screen.getByRole('button', { name: /Titre/ }))
    expect(pushMock).toHaveBeenCalledWith('/dashboard/articles?sort=-title')
  })

  it('un troisième clic efface le tri', () => {
    currentSearch = 'sort=-title'
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    fireEvent.click(screen.getByRole('button', { name: /Titre/ }))
    expect(pushMock).toHaveBeenCalledWith('/dashboard/articles')
  })

  it('conserve les autres paramètres d’URL lors d’un changement de page', () => {
    currentSearch = 'domainId=abc&status=DRAFT'
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={50} page={1} pageSize={20} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(pushMock).toHaveBeenCalledWith('/dashboard/articles?domainId=abc&status=DRAFT&page=2')
  })

  it('n’affiche pas de pagination quand tout tient sur une page', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} totalCount={2} page={1} pageSize={20} />)
    expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull()
  })

  it('affiche un squelette de chargement quand `loading` est vrai', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} totalCount={0} page={1} pageSize={20} loading />)
    expect(screen.getByTestId('data-table-loading')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

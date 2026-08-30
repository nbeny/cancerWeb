import type { CategoryFieldsFragment } from '@cancerweb/graphql'
import { buildTree, selfAndDescendants } from './tree'

function category(overrides: Partial<CategoryFieldsFragment> = {}): CategoryFieldsFragment {
  return {
    id: 'c1',
    domainId: 'd1',
    name: 'Catégorie',
    slug: 'categorie',
    description: null,
    parentId: null,
    articleCount: 0,
    ...overrides,
  }
}

describe('buildTree', () => {
  it('place en racine toute catégorie sans parentId', () => {
    const tree = buildTree([category({ id: 'a' }), category({ id: 'b' })])
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(tree.every((n) => n.children.length === 0)).toBe(true)
  })

  it('range chaque catégorie sous les enfants de son parent', () => {
    const tree = buildTree([
      category({ id: 'root', name: 'Racine' }),
      category({ id: 'child', name: 'Enfant', parentId: 'root' }),
      category({ id: 'grandchild', name: 'Petit-enfant', parentId: 'child' }),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe('root')
    expect(tree[0]?.children).toHaveLength(1)
    expect(tree[0]?.children[0]?.id).toBe('child')
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('grandchild')
  })

  it('traite un parentId orphelin (aucune catégorie connue) comme une racine plutôt que de le perdre', () => {
    const tree = buildTree([category({ id: 'orphan', parentId: 'introuvable' })])
    expect(tree.map((n) => n.id)).toEqual(['orphan'])
  })

  it('gère plusieurs racines et plusieurs enfants par parent', () => {
    const tree = buildTree([
      category({ id: 'root-1' }),
      category({ id: 'root-2' }),
      category({ id: 'child-1', parentId: 'root-1' }),
      category({ id: 'child-2', parentId: 'root-1' }),
    ])

    expect(tree).toHaveLength(2)
    const root1 = tree.find((n) => n.id === 'root-1')
    expect(root1?.children.map((c) => c.id).sort()).toEqual(['child-1', 'child-2'])
  })
})

describe('selfAndDescendants', () => {
  const categories = [
    category({ id: 'a' }),
    category({ id: 'b', parentId: 'a' }),
    category({ id: 'c', parentId: 'b' }),
    category({ id: 'd' }), // non apparentée
  ]

  it('inclut la catégorie elle-même', () => {
    expect(selfAndDescendants('d', categories).has('d')).toBe(true)
  })

  it('inclut tous les descendants, directs et indirects', () => {
    const excluded = selfAndDescendants('a', categories)
    expect(excluded.has('a')).toBe(true)
    expect(excluded.has('b')).toBe(true)
    expect(excluded.has('c')).toBe(true)
    expect(excluded.has('d')).toBe(false)
  })

  it('une feuille ne contient qu’elle-même', () => {
    expect(selfAndDescendants('c', categories)).toEqual(new Set(['c']))
  })
})

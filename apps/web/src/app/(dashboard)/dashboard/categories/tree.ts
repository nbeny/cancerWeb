import type { CategoryFieldsFragment } from '@cancerweb/graphql'

export interface CategoryNode extends CategoryFieldsFragment {
  children: CategoryNode[]
}

/**
 * Reconstruit l'arborescence à partir de la liste PLATE renvoyée par
 * `categories(domainId)` (triée par nom, voir `CategoriesService.listForDomain`) :
 * l'API n'expose pas de requête imbriquée dédiée, `parentId` suffit à la
 * reconstituer côté client. L'ordre des enfants suit l'ordre d'itération de
 * `byId` (donc l'ordre de la liste source, déjà alphabétique).
 *
 * Une catégorie dont le `parentId` ne correspond à AUCUNE catégorie connue
 * (jamais censé arriver — `onDelete: SetNull` empêche une référence
 * pendante, voir `schema.prisma`) est traitée comme une racine plutôt que
 * silencieusement omise : mieux vaut une catégorie mal placée que perdue.
 */
export function buildTree(categories: CategoryFieldsFragment[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>(categories.map((c) => [c.id, { ...c, children: [] }]))
  const roots: CategoryNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/**
 * Une catégorie et tous ses descendants — exclus des choix de parent dans le
 * formulaire d'édition pour éviter un cycle évident côté client (le serveur
 * reste l'autorité finale pour les cycles indirects, voir
 * `CategoriesService.assertNoCycle`).
 */
export function selfAndDescendants(id: string, categories: CategoryFieldsFragment[]): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id)
        grew = true
      }
    }
  }
  return ids
}

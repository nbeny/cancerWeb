import { Int, Parent, ResolveField, Resolver } from '@nestjs/graphql'
import { Category as PrismaCategory } from '@prisma/client'
import { Category } from './category.types'
import { CurrentLoaders } from '../common/decorators/loaders.decorator'
import type { Loaders } from '../common/dataloader/loaders'

/**
 * `parent` (auto-référence, voir `schema.prisma`) est le champ qui permet de
 * construire un chemin imbriqué de plus de 8 niveaux pour
 * `graphql-guards.int-spec.ts` ("le test de profondeur, différé deux
 * fois") : `Article.author`/`Article.domain` seuls n'y suffisent pas, `User`
 * et `Domain` n'ayant aucun champ objet.
 *
 * `children` (Task 12) est le pendant descendant de `parent`, chargé via un
 * DataLoader dédié (`childrenByParentId`) pour la même raison que
 * `tagsByArticleId`/`categoryById` : lister des catégories avec leurs
 * enfants ne doit pas coûter une requête par catégorie.
 *
 * `articleCount` (Task 12) est le seul compteur ajouté (« reste sobre ») :
 * utile pour afficher un badge dans une liste de catégories sans avoir à
 * charger tous les articles. Chargé via `articleCountByCategoryId`
 * (`groupBy`), pas un `count()` par catégorie.
 */
@Resolver(() => Category)
export class CategoryResolver {
  @ResolveField(() => Category, { nullable: true })
  parent(@Parent() category: Category, @CurrentLoaders() loaders: Loaders): Promise<PrismaCategory | null> {
    if (!category.parentId) return Promise.resolve(null)
    return loaders.categoryById.load(category.parentId)
  }

  @ResolveField(() => [Category])
  children(@Parent() category: Category, @CurrentLoaders() loaders: Loaders): Promise<PrismaCategory[]> {
    return loaders.childrenByParentId.load(category.id)
  }

  @ResolveField(() => Int)
  articleCount(@Parent() category: Category, @CurrentLoaders() loaders: Loaders): Promise<number> {
    return loaders.articleCountByCategoryId.load(category.id)
  }
}

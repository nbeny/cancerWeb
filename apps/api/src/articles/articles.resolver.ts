import { Args, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, User, Domain } from '@prisma/client'
import { ArticlesService } from './articles.service'
import { Article, ArticleConnection, ArticleFilter, ArticleVersion, CreateArticleInput, UpdateArticleInput } from './article.types'
import { Category } from './category.types'
import { Tag } from './tag.types'
import { User as UserGqlType } from '../users/user.type'
import { Domain as DomainGqlType } from '../domains/domain.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { CurrentLoaders } from '../common/decorators/loaders.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { PageInput } from '../common/dto/page.input'
import type { Loaders } from '../common/dataloader/loaders'

// Mutations de transition (Task 7-8) : le rôle minimum requis sur chaque
// mutation correspond au rôle minimum du bord du diagramme qu'elle emprunte
// (voir transitions.ts). `ArticlesService` revérifie indépendamment via
// `canTransition` — défense en profondeur, comme pour la propriété d'article
// dans `update()`.
// Même remarque que TopicsResolver sur `domainId` explicite : l'id d'un
// Article est distinct de celui de son domaine.
@Resolver(() => Article)
@UseGuards(DomainRoleGuard)
export class ArticlesResolver {
  constructor(private readonly articlesService: ArticlesService) {}

  @Query(() => ArticleConnection)
  @RequireDomainRole(DomainRole.VIEWER)
  articles(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('filter', { nullable: true }) filter?: ArticleFilter,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<ArticleConnection> {
    return this.articlesService.listForDomain(user.id, domainId, page ?? { limit: 20, offset: 0 }, filter)
  }

  @Query(() => Article)
  @RequireDomainRole(DomainRole.VIEWER)
  article(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Article> {
    return this.articlesService.findForUser(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.AUTHOR)
  createArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('input') input: CreateArticleInput,
  ): Promise<Article> {
    return this.articlesService.create(user.id, domainId, input)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.AUTHOR)
  updateArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateArticleInput,
  ): Promise<Article> {
    return this.articlesService.update(user.id, domainId, id, input)
  }

  @Mutation(() => Boolean)
  @RequireDomainRole(DomainRole.OWNER)
  deleteArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.articlesService.remove(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.AUTHOR)
  submitForReview(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Article> {
    return this.articlesService.submitForReview(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.EDITOR)
  approveArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Article> {
    return this.articlesService.approveArticle(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.EDITOR)
  rejectArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Article> {
    return this.articlesService.rejectArticle(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.EDITOR)
  publishArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Article> {
    return this.articlesService.publishArticle(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.EDITOR)
  scheduleArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('scheduledAt', { type: () => Date }) scheduledAt: Date,
  ): Promise<Article> {
    return this.articlesService.scheduleArticle(user.id, domainId, id, scheduledAt)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.EDITOR)
  archiveArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Article> {
    return this.articlesService.archiveArticle(user.id, domainId, id)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.AUTHOR)
  setArticleCategory(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
    @Args('categoryId', { type: () => ID, nullable: true }) categoryId?: string | null,
  ): Promise<Article> {
    return this.articlesService.setCategory(user.id, domainId, articleId, categoryId ?? null)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.AUTHOR)
  setArticleTags(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
    @Args('tagIds', { type: () => [ID] }) tagIds: string[],
  ): Promise<Article> {
    return this.articlesService.setTags(user.id, domainId, articleId, tagIds)
  }

  @Query(() => [ArticleVersion])
  @RequireDomainRole(DomainRole.VIEWER)
  articleVersions(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
  ): Promise<ArticleVersion[]> {
    return this.articlesService.listVersions(user.id, domainId, articleId)
  }

  @Mutation(() => ArticleVersion)
  @RequireDomainRole(DomainRole.AUTHOR)
  createArticleVersion(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
    @Args('changeNote', { nullable: true }) changeNote?: string,
  ): Promise<ArticleVersion> {
    return this.articlesService.createVersion(user.id, domainId, articleId, changeNote)
  }

  @Mutation(() => Article)
  @RequireDomainRole(DomainRole.AUTHOR)
  restoreArticleVersion(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
    @Args('version', { type: () => Int }) version: number,
  ): Promise<Article> {
    return this.articlesService.restoreVersion(user.id, domainId, articleId, version)
  }

  // ---------------------------------------------------------------------
  // Champs imbriqués (Task 11) — premiers de tout le schéma. Chargés via
  // les DataLoader posés dans le contexte GraphQL (un par requête, voir
  // `common/dataloader/loaders.ts`) : sans eux, lister N articles avec leurs
  // relations émettrait N+1 requêtes Prisma (voir `n-plus-one.int-spec.ts`).
  //
  // Aucun `@RequireDomainRole` ici : ces champs n'ont pas d'argument
  // `domainId`/`id` propre pour que `DomainRoleGuard` puisse le résoudre
  // (il lit `args.domainId ?? args.id`, absents sur un `@ResolveField`). Ce
  // n'est pas un trou d'autorisation : on n'atteint jamais ces resolvers
  // sans être déjà passé par `articles`/`article`, qui ont, eux, vérifié
  // l'appartenance au domaine de L'ARTICLE PARENT — la seule chose que ces
  // champs révèlent est son auteur, son domaine, sa catégorie ou ses tags,
  // déjà accessibles via les champs scalaires `authorId`/`domainId`/etc.
  // ---------------------------------------------------------------------

  @ResolveField(() => UserGqlType)
  author(@Parent() article: Article, @CurrentLoaders() loaders: Loaders): Promise<User | null> {
    return loaders.userById.load(article.authorId)
  }

  @ResolveField(() => DomainGqlType)
  domain(@Parent() article: Article, @CurrentLoaders() loaders: Loaders): Promise<Domain | null> {
    return loaders.domainById.load(article.domainId)
  }

  @ResolveField(() => Category, { nullable: true })
  category(@Parent() article: Article, @CurrentLoaders() loaders: Loaders): Promise<Category | null> {
    if (!article.categoryId) return Promise.resolve(null)
    return loaders.categoryById.load(article.categoryId)
  }

  @ResolveField(() => [Tag])
  tags(@Parent() article: Article, @CurrentLoaders() loaders: Loaders): Promise<Tag[]> {
    return loaders.tagsByArticleId.load(article.id)
  }
}

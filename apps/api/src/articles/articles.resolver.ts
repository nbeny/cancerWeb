import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, User } from '@prisma/client'
import { ArticlesService } from './articles.service'
import { Article, ArticleConnection, CreateArticleInput, UpdateArticleInput } from './article.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { PageInput } from '../common/dto/page.input'

// Resolver volontairement réduit au CRUD (Task 6) : aucune mutation de
// transition de statut (submitForReview, publishArticle, ...) n'est
// exposée ici — elles arrivent avec la machine à états (Task 7-8).
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
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<ArticleConnection> {
    return this.articlesService.listForDomain(user.id, domainId, page ?? { limit: 20, offset: 0 })
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
}

import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, User } from '@prisma/client'
import { SeoService } from './seo.service'
import { SeoReport, SeoReportConnection } from './seo.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { PageInput } from '../common/dto/page.input'

// `analyzeSeo` est une MUTATION bien que l'analyse elle-meme soit une
// fonction pure et synchrone : elle ecrit un `SeoReport` et met a jour
// `Article.latestSeoScore`. Une query qui ecrit en base serait un piege pour
// tout client GraphQL qui suppose (a raison, par convention) qu'une query
// n'a pas d'effet de bord.
//
// Meme motif que TopicsResolver/ArticlesResolver sur `domainId` explicite :
// un `SeoReport` (comme un Article) a son propre identifiant, distinct de
// celui de son domaine.
@Resolver(() => SeoReport)
@UseGuards(DomainRoleGuard)
export class SeoResolver {
  constructor(private readonly seoService: SeoService) {}

  @Mutation(() => SeoReport)
  @RequireDomainRole(DomainRole.AUTHOR)
  analyzeSeo(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
  ): Promise<SeoReport> {
    return this.seoService.analyze(user.id, domainId, articleId)
  }

  @Query(() => SeoReportConnection)
  @RequireDomainRole(DomainRole.VIEWER)
  seoReports(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('articleId', { type: () => ID }) articleId: string,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<SeoReportConnection> {
    return this.seoService.listReports(user.id, domainId, articleId, page ?? { limit: 20, offset: 0 })
  }
}

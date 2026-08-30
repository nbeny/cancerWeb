import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, User } from '@prisma/client'
import { SeoService } from './seo.service'
import { SeoReport, SeoReportConnection } from './seo.types'
import { blockingCodes } from './analyzer'
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

  // Pas déclaré comme propriété de classe dans `seo.types.ts` : même motif
  // que `Category.parent`/`children`/`articleCount` (voir leur jsdoc) — un
  // `@ResolveField` pur suffit à NestJS GraphQL (code-first) pour l'ajouter
  // au SDL. `cappedBy` n'est PAS persisté en base (ni dans `issues` ni dans
  // `metrics`, voir le rapport de tâche pour la justification de ce choix) :
  // il est recalculé ici à partir des `issues` déjà persistées, via
  // `blockingCodes`, LA MÊME fonction que celle utilisée par l'analyseur pur
  // au moment du calcul (`analyzer.ts`). Aucune divergence possible entre le
  // score plafonné stocké et ce que ce champ expose : une seule définition de
  // « qu'est-ce qui plafonne », réutilisée en écriture comme en lecture.
  @ResolveField(() => [String])
  cappedBy(@Parent() report: SeoReport): string[] {
    return blockingCodes(report.issues)
  }
}

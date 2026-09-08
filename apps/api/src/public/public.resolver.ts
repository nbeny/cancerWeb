import { Args, Query, Resolver } from '@nestjs/graphql'
import { PublicService } from './public.service'
import { PublicArticle, PublicArticleConnection, PublicDomain } from './public.types'
import { Public } from '../common/decorators/public.decorator'
import { PageInput } from '../common/dto/page.input'

/**
 * Surface GraphQL du blog public : les trois premières LECTURES de
 * l'application joignables sans session (jusqu'ici, seules des mutations
 * d'authentification et la sonde `serverTime` portaient `@Public()`).
 *
 * `@Public()` est posé sur CHAQUE query, jamais sur la classe : ainsi une
 * query ajoutée ici demain reste protégée par le `GqlAuthGuard` global tant
 * que quelqu'un n'a pas écrit noir sur blanc qu'elle doit être ouverte. Le
 * défaut doit être « fermé », y compris dans le module dont tout le reste est
 * ouvert.
 *
 * Aucun `@CurrentUser()` ici, et c'est volontaire : il n'y a pas
 * d'utilisateur. Le seul contrôle d'accès est celui de `PublicService`, qui
 * ne sait lire que des articles effectivement publiés.
 */
@Resolver()
export class PublicResolver {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Query(() => PublicDomain)
  publicDomain(@Args('slug') slug: string): Promise<PublicDomain> {
    return this.publicService.domainBySlug(slug)
  }

  @Public()
  @Query(() => PublicArticleConnection)
  publicArticles(
    @Args('domainSlug') domainSlug: string,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<PublicArticleConnection> {
    // Même repli que `ArticlesResolver.articles` : quand l'argument `page`
    // est omis EN ENTIER, le ValidationPipe ne construit pas de `PageInput`
    // et les valeurs par défaut du champ ne s'appliquent pas. Fourni, il est
    // validé (@Min/@Max, voir `common/dto/page.input.ts`) — c'est là que se
    // joue la borne haute de `limit`, seule entrée que contrôle un appelant
    // anonyme et donc seul levier de déni de service qu'il aurait sans elle.
    return this.publicService.articles(domainSlug, page ?? { limit: 20, offset: 0 })
  }

  @Public()
  @Query(() => PublicArticle)
  publicArticle(@Args('domainSlug') domainSlug: string, @Args('slug') slug: string): Promise<PublicArticle> {
    return this.publicService.articleBySlug(domainSlug, slug)
  }
}

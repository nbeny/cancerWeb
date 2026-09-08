import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Paginated } from '../common/dto/page.input'

/**
 * Vue publique d'un article. Type SÉPARÉ de `Article` (articles/article.types.ts)
 * par sécurité, pas par confort : le type interne porte des champs qui ne
 * doivent jamais sortir — `rationale` (justification éditoriale interne,
 * Lot A), `authorId`, `topicId`, `latestSeoScore`, `scheduledAt`. Réutiliser
 * le type interne ferait dépendre la confidentialité d'un `select` correct,
 * qu'une évolution future élargirait sans que rien ne le signale. Ici,
 * ajouter un champ au blog est un acte explicite.
 */
@ObjectType()
export class PublicArticle {
  @Field(() => ID) id!: string
  @Field() title!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) renderedHtml?: string | null
  @Field(() => String, { nullable: true }) excerpt?: string | null
  @Field(() => String, { nullable: true }) coverImageUrl?: string | null
  @Field(() => Date, { nullable: true }) publishedAt?: Date | null
  @Field(() => Int) wordCount!: number

  @Field(() => String, { nullable: true }) seoTitle?: string | null
  @Field(() => String, { nullable: true }) metaDescription?: string | null
  @Field(() => String, { nullable: true }) canonicalUrl?: string | null
  @Field() robotsIndex!: boolean
  @Field() robotsFollow!: boolean
}

@ObjectType()
export class PublicArticleConnection extends Paginated(PublicArticle) {}

/** Vue publique d'un domaine : uniquement de quoi habiller le blog. */
@ObjectType()
export class PublicDomain {
  @Field(() => ID) id!: string
  @Field() name!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) description?: string | null
  @Field() language!: string
}

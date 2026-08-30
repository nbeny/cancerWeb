import { Field, ID, Int, InputType, ObjectType, registerEnumType } from '@nestjs/graphql'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'
import { ArticleStatus } from '@prisma/client'
import {
  ARTICLE_TITLE_MIN_LENGTH,
  ARTICLE_TITLE_MAX_LENGTH,
  ARTICLE_CONTENT_MIN_LENGTH,
  ARTICLE_CONTENT_MAX_LENGTH,
  ARTICLE_EXCERPT_MAX_LENGTH,
  ARTICLE_COVER_IMAGE_URL_MAX_LENGTH,
  ARTICLE_SEO_TITLE_MAX_LENGTH,
  ARTICLE_META_DESCRIPTION_MAX_LENGTH,
  ARTICLE_CANONICAL_URL_MAX_LENGTH,
  ARTICLE_FOCUS_KEYWORD_MAX_LENGTH,
  ARTICLE_SECONDARY_KEYWORDS_MAX_SIZE,
} from '@cancerweb/validation'
import { Paginated } from '../common/dto/page.input'

registerEnumType(ArticleStatus, { name: 'ArticleStatus' })

@ObjectType()
export class Article {
  @Field(() => ID) id!: string
  @Field(() => ID) domainId!: string
  @Field(() => ID, { nullable: true }) topicId?: string | null
  @Field(() => ID) authorId!: string
  @Field(() => ID, { nullable: true }) categoryId?: string | null
  @Field() title!: string
  @Field() slug!: string
  @Field() content!: string
  @Field(() => String, { nullable: true }) renderedHtml?: string | null
  @Field(() => String, { nullable: true }) excerpt?: string | null
  @Field(() => String, { nullable: true }) coverImageUrl?: string | null
  @Field(() => ArticleStatus) status!: ArticleStatus
  @Field(() => Int) currentVersion!: number
  @Field(() => Int) wordCount!: number
  @Field(() => Int, { nullable: true }) latestSeoScore?: number | null
  @Field(() => Date, { nullable: true }) scheduledAt?: Date | null
  @Field(() => Date, { nullable: true }) publishedAt?: Date | null

  @Field(() => String, { nullable: true }) seoTitle?: string | null
  @Field(() => String, { nullable: true }) metaDescription?: string | null
  @Field(() => String, { nullable: true }) canonicalUrl?: string | null
  @Field(() => String, { nullable: true }) focusKeyword?: string | null
  @Field(() => [String]) secondaryKeywords!: string[]
  @Field() robotsIndex!: boolean
  @Field() robotsFollow!: boolean

  @Field() createdAt!: Date
  @Field() updatedAt!: Date
}

@ObjectType()
export class ArticleConnection extends Paginated(Article) {}

@ObjectType()
export class ArticleVersion {
  @Field(() => ID) id!: string
  @Field(() => ID) articleId!: string
  @Field(() => Int) version!: number
  @Field() title!: string
  @Field() content!: string
  @Field(() => String, { nullable: true }) changeNote?: string | null
  @Field(() => ID) createdById!: string
  @Field() createdAt!: Date
}

// Même motif que domain.types.ts / topic.types.ts : `undefined` (champ omis)
// et `null` (effacement explicite) doivent être traités différemment pour
// les colonnes nullables (categoryId, excerpt, coverImageUrl, seoTitle,
// metaDescription, canonicalUrl, focusKeyword). `title`/`content` sont
// NOT NULL en base : un `null` explicite doit être rejeté en
// VALIDATION_FAILED plutôt que d'atteindre Prisma tel quel.
const skipIfOmitted = (_: unknown, value: unknown): boolean => value !== undefined

@InputType()
export class CreateArticleInput {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() topicId?: string
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() categoryId?: string
  @Field() @IsString() @Length(ARTICLE_TITLE_MIN_LENGTH, ARTICLE_TITLE_MAX_LENGTH) title!: string
  @Field() @IsString() @Length(ARTICLE_CONTENT_MIN_LENGTH, ARTICLE_CONTENT_MAX_LENGTH) content!: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(ARTICLE_EXCERPT_MAX_LENGTH) excerpt?: string
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_COVER_IMAGE_URL_MAX_LENGTH)
  coverImageUrl?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(ARTICLE_SEO_TITLE_MAX_LENGTH) seoTitle?: string
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_META_DESCRIPTION_MAX_LENGTH)
  metaDescription?: string
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_CANONICAL_URL_MAX_LENGTH)
  canonicalUrl?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(ARTICLE_FOCUS_KEYWORD_MAX_LENGTH) focusKeyword?: string
  @Field(() => [String], { defaultValue: [] })
  @ArrayMaxSize(ARTICLE_SECONDARY_KEYWORDS_MAX_SIZE)
  secondaryKeywords!: string[]
  @Field({ defaultValue: true }) @IsBoolean() robotsIndex!: boolean
  @Field({ defaultValue: true }) @IsBoolean() robotsFollow!: boolean
}

/**
 * Filtre de la query `articles`. Tout est combinable : `status` +
 * `minSeoScore` + `search` ensemble donnent l'INTERSECTION des trois (voir
 * `article-query.ts` — une seule requête SQL porte tous les filtres, y
 * compris `search`).
 *
 * `tagIds` retient un article qui porte AU MOINS UN des tags demandés (OR),
 * pas la totalité (AND) : décision assumée, cohérente avec un usage "filtrer
 * par étiquette" plutôt que "trouver l'intersection exacte d'étiquettes" —
 * voir `article-filter-sort.int-spec.ts`.
 *
 * `minSeoScore` exclut aussi bien les scores insuffisants que les articles
 * jamais analysés (`latestSeoScore: null`) : il n'y a pas de score à
 * comparer, ce n'est ni un 0 ni une exception au filtre (`NULL >= x` est
 * NULL en SQL, donc exclu par construction — pas besoin de clause dédiée).
 *
 * Un tableau vide (`status: []`, `tagIds: []`) est traité comme une absence
 * de filtre sur ce champ, au même titre qu'un champ omis : c'est le
 * comportement le moins surprenant pour un groupe de cases à cocher toutes
 * décochées, plutôt qu'un filtre qui ne matcherait jamais rien.
 */
@InputType()
export class ArticleFilter {
  @Field(() => [ArticleStatus], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ArticleStatus, { each: true })
  status?: ArticleStatus[]

  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() authorId?: string
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() categoryId?: string

  @Field(() => [ID], { nullable: true }) @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[]

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) search?: string

  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(100) minSeoScore?: number

  @Field(() => Date, { nullable: true }) @IsOptional() @IsDate() publishedAfter?: Date
  @Field(() => Date, { nullable: true }) @IsOptional() @IsDate() publishedBefore?: Date
}

export enum ArticleSortField {
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  PUBLISHED_AT = 'PUBLISHED_AT',
  TITLE = 'TITLE',
  SEO_SCORE = 'SEO_SCORE',
}
registerEnumType(ArticleSortField, { name: 'ArticleSortField' })

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}
registerEnumType(SortDirection, { name: 'SortDirection' })

/**
 * Tri de la query `articles`, résolu EN BASE (voir `article-query.ts`).
 * Quand `filter.search` est aussi fourni, un `sort` explicite l'EMPORTE sur
 * le rang de pertinence plein texte : la pertinence n'est le tri par défaut
 * QUE si aucun tri explicite n'est demandé — décision assumée, cohérente
 * avec le principe qu'un choix explicite de l'utilisateur prime toujours sur
 * un choix implicite du serveur.
 *
 * `SEO_SCORE` et `PUBLISHED_AT` sont des colonnes nullable : les valeurs
 * `null` (article jamais analysé / jamais publié) sont toujours reléguées en
 * fin de tri, quel que soit `direction` — sans quoi un tri DESC placerait un
 * `null` EN TÊTE (comportement par défaut de Postgres pour DESC).
 *
 * `field`/`direction` sont marqués Non-Null CÔTÉ SCHÉMA GraphQL (`@Field`
 * sans `nullable: true`, comme demandé) : un client qui envoie un objet
 * `sort` incomplet est rejeté par la validation GraphQL elle-même, avant
 * d'atteindre ce resolver. `@IsOptional()` ici ne relâche donc rien pour un
 * VRAI `sort` fourni — il neutralise seulement le même piège que documenté
 * sur `PageInput` (`page.input.ts`) : quand l'argument `sort` est omis EN
 * ENTIER, le ValidationPipe de Nest instancie quand même un `ArticleSort`
 * vide pour le valider, et `field`/`direction` non-optionnels y échoueraient
 * à tort. `article-query.ts` traite un `ArticleSort` sans `field` ni
 * `direction` comme l'absence de tri explicite.
 */
@InputType()
export class ArticleSort {
  @Field(() => ArticleSortField) @IsOptional() @IsEnum(ArticleSortField) field?: ArticleSortField
  @Field(() => SortDirection) @IsOptional() @IsEnum(SortDirection) direction?: SortDirection
}

@InputType()
export class UpdateArticleInput {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() categoryId?: string
  @Field({ nullable: true })
  @ValidateIf(skipIfOmitted)
  @IsString()
  @Length(ARTICLE_TITLE_MIN_LENGTH, ARTICLE_TITLE_MAX_LENGTH)
  title?: string
  @Field({ nullable: true })
  @ValidateIf(skipIfOmitted)
  @IsString()
  @Length(ARTICLE_CONTENT_MIN_LENGTH, ARTICLE_CONTENT_MAX_LENGTH)
  content?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(ARTICLE_EXCERPT_MAX_LENGTH) excerpt?: string
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_COVER_IMAGE_URL_MAX_LENGTH)
  coverImageUrl?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(ARTICLE_SEO_TITLE_MAX_LENGTH) seoTitle?: string
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_META_DESCRIPTION_MAX_LENGTH)
  metaDescription?: string
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_CANONICAL_URL_MAX_LENGTH)
  canonicalUrl?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(ARTICLE_FOCUS_KEYWORD_MAX_LENGTH) focusKeyword?: string
  @Field(() => [String], { nullable: true })
  @ValidateIf(skipIfOmitted)
  @ArrayMaxSize(ARTICLE_SECONDARY_KEYWORDS_MAX_SIZE)
  secondaryKeywords?: string[]
  @Field({ nullable: true }) @ValidateIf(skipIfOmitted) @IsBoolean() robotsIndex?: boolean
  @Field({ nullable: true }) @ValidateIf(skipIfOmitted) @IsBoolean() robotsFollow?: boolean
}

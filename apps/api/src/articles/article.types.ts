import { Field, ID, Int, InputType, ObjectType, registerEnumType } from '@nestjs/graphql'
import { ArrayMaxSize, IsBoolean, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator'
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
 * Filtre de la query `articles`. `search` déclenche la recherche plein
 * texte (Task 10, `../search.ts`) sur `Article.searchVector` plutôt que le
 * listing simple par domaine — un champ omis ou vide préserve le
 * comportement précédent.
 */
@InputType()
export class ArticleFilter {
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) search?: string
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

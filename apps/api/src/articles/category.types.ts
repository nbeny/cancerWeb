import { Field, ID, InputType, ObjectType } from '@nestjs/graphql'
import { IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator'
import { CATEGORY_NAME_MIN_LENGTH, CATEGORY_NAME_MAX_LENGTH, CATEGORY_DESCRIPTION_MAX_LENGTH } from '@cancerweb/validation'

/**
 * `parent` (Task 11), `children` et `articleCount` (Task 12) ne sont PAS
 * déclarés comme propriétés de classe ici : ce sont des `@ResolveField` purs
 * dans `category.resolver.ts`, chargés via DataLoader. NestJS GraphQL
 * (code-first) les ajoute au SDL à partir du resolver, sans qu'une
 * déclaration de champ soit nécessaire sur l'`@ObjectType` — vérifié dans le
 * SDL généré (`packages/graphql/schema.graphql`, `Category.parent`) avant
 * d'appliquer le même motif à `children`/`articleCount`.
 */
@ObjectType()
export class Category {
  @Field(() => ID) id!: string
  @Field(() => ID) domainId!: string
  @Field() name!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) description?: string | null
  @Field(() => ID, { nullable: true }) parentId?: string | null
}

// Un `null` explicite sur `undefined`/champ omis se comportent différemment :
// voir le même motif dans domain.types.ts/topic.types.ts. `description` et
// `parentId` correspondent à des colonnes nullables en base (voir
// schema.prisma) et peuvent légitimement être effacées avec `null`
// (`parentId: null` détache une catégorie de son parent, la rend racine).
const skipIfOmitted = (_: unknown, value: unknown): boolean => value !== undefined

@InputType()
export class CreateCategoryInput {
  @Field() @IsString() @Length(CATEGORY_NAME_MIN_LENGTH, CATEGORY_NAME_MAX_LENGTH) name!: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(CATEGORY_DESCRIPTION_MAX_LENGTH) description?: string
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() parentId?: string
}

@InputType()
export class UpdateCategoryInput {
  @Field({ nullable: true })
  @ValidateIf(skipIfOmitted)
  @IsString()
  @Length(CATEGORY_NAME_MIN_LENGTH, CATEGORY_NAME_MAX_LENGTH)
  name?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(CATEGORY_DESCRIPTION_MAX_LENGTH) description?: string
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() parentId?: string | null
}

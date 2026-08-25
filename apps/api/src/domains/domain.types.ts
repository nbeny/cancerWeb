import { Field, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql'
import { ArrayMaxSize, IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator'
import { ExpertiseLevel, Tone } from '@prisma/client'
import { Paginated } from '../common/dto/page.input'

registerEnumType(Tone, { name: 'Tone' })
registerEnumType(ExpertiseLevel, { name: 'ExpertiseLevel' })

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const

@ObjectType()
export class Domain {
  @Field(() => ID) id!: string
  @Field() name!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) description?: string | null
  @Field() language!: string
  @Field(() => String, { nullable: true }) country?: string | null
  @Field(() => Tone) tone!: Tone
  @Field(() => ExpertiseLevel) expertiseLevel!: ExpertiseLevel
  @Field(() => [String]) targetAudience!: string[]
  @Field(() => [String]) keywords!: string[]
  @Field(() => [String]) excludedTopics!: string[]
  @Field(() => String, { nullable: true }) aiInstructions?: string | null
  @Field() autoPublish!: boolean
  @Field() reviewOutline!: boolean
  @Field() createdAt!: Date
  @Field() updatedAt!: Date
}

@ObjectType()
export class DomainConnection extends Paginated(Domain) {}

@InputType()
export class CreateDomainInput {
  @Field() @IsString() @Length(2, 80) name!: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) description?: string
  @Field({ defaultValue: 'fr' }) @IsIn(SUPPORTED_LANGUAGES as unknown as string[]) language!: string
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @Length(2, 2) country?: string
  @Field(() => Tone, { defaultValue: Tone.PROFESSIONAL }) @IsEnum(Tone) tone!: Tone
  @Field(() => ExpertiseLevel, { defaultValue: ExpertiseLevel.INTERMEDIATE }) @IsEnum(ExpertiseLevel) expertiseLevel!: ExpertiseLevel
  @Field(() => [String], { defaultValue: [] }) @ArrayMaxSize(20) targetAudience!: string[]
  @Field(() => [String], { defaultValue: [] }) @ArrayMaxSize(50) keywords!: string[]
  @Field(() => [String], { defaultValue: [] }) @ArrayMaxSize(50) excludedTopics!: string[]
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) aiInstructions?: string
}

// `UpdateDomainInput` a des champs `nullable: true` côté GraphQL pour que le
// client puisse omettre ceux qu'il ne modifie pas (input partiel). Mais
// « omis » et « explicitement null » sont deux choses différentes : seules
// `description`, `country` et `aiInstructions` correspondent à des colonnes
// nullables en base (voir schema.prisma) et peuvent légitimement être
// effacées avec `null`. Pour elles, `@IsOptional()` est correct : il laisse
// passer `undefined` (champ omis) et `null` (effacement voulu) sans
// validation supplémentaire.
//
// Pour les autres champs (colonnes `NOT NULL`), `@IsOptional()` aurait le
// même effet indésirable : il traiterait `null` comme "rien à valider" et
// laisserait la valeur atteindre Prisma, qui rejette avec une erreur de
// contrainte non gérée (500 + bruit de log). On utilise donc
// `@ValidateIf` pour ne sauter la validation que sur `undefined` : un
// `null` explicite est alors soumis aux validateurs de type
// (`@IsString`, `@IsEnum`, `@ArrayMaxSize`, `@IsBoolean`, ...), qui le
// rejettent proprement en `VALIDATION_FAILED`.
const skipIfOmitted = (_: unknown, value: unknown): boolean => value !== undefined

@InputType()
export class UpdateDomainInput {
  @Field({ nullable: true }) @ValidateIf(skipIfOmitted) @IsString() @Length(2, 80) name?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) description?: string
  @Field({ nullable: true }) @ValidateIf(skipIfOmitted) @IsIn(SUPPORTED_LANGUAGES as unknown as string[]) language?: string
  @Field(() => Tone, { nullable: true }) @ValidateIf(skipIfOmitted) @IsEnum(Tone) tone?: Tone
  @Field(() => ExpertiseLevel, { nullable: true }) @ValidateIf(skipIfOmitted) @IsEnum(ExpertiseLevel) expertiseLevel?: ExpertiseLevel
  @Field(() => [String], { nullable: true }) @ValidateIf(skipIfOmitted) @ArrayMaxSize(20) targetAudience?: string[]
  @Field(() => [String], { nullable: true }) @ValidateIf(skipIfOmitted) @ArrayMaxSize(50) keywords?: string[]
  @Field(() => [String], { nullable: true }) @ValidateIf(skipIfOmitted) @ArrayMaxSize(50) excludedTopics?: string[]
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) aiInstructions?: string
  @Field({ nullable: true }) @ValidateIf(skipIfOmitted) @IsBoolean() autoPublish?: boolean
  @Field({ nullable: true }) @ValidateIf(skipIfOmitted) @IsBoolean() reviewOutline?: boolean
}

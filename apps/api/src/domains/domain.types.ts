import { Field, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql'
import { ArrayMaxSize, IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator'
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

@InputType()
export class UpdateDomainInput {
  @Field({ nullable: true }) @IsOptional() @IsString() @Length(2, 80) name?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) description?: string
  @Field({ nullable: true }) @IsOptional() @IsIn(SUPPORTED_LANGUAGES as unknown as string[]) language?: string
  @Field(() => Tone, { nullable: true }) @IsOptional() @IsEnum(Tone) tone?: Tone
  @Field(() => ExpertiseLevel, { nullable: true }) @IsOptional() @IsEnum(ExpertiseLevel) expertiseLevel?: ExpertiseLevel
  @Field(() => [String], { nullable: true }) @IsOptional() @ArrayMaxSize(20) targetAudience?: string[]
  @Field(() => [String], { nullable: true }) @IsOptional() @ArrayMaxSize(50) keywords?: string[]
  @Field(() => [String], { nullable: true }) @IsOptional() @ArrayMaxSize(50) excludedTopics?: string[]
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) aiInstructions?: string
  @Field({ nullable: true }) @IsOptional() @IsBoolean() autoPublish?: boolean
  @Field({ nullable: true }) @IsOptional() @IsBoolean() reviewOutline?: boolean
}

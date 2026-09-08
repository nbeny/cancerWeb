import { Field, ID, Int, InputType, ObjectType, registerEnumType } from '@nestjs/graphql'
import {
  ArrayMaxSize,
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
import { SearchIntent, TopicStatus } from '@prisma/client'
import {
  TOPIC_TITLE_MIN_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
  TOPIC_DESCRIPTION_MAX_LENGTH,
  TOPIC_SUGGESTED_ANGLE_MAX_LENGTH,
  TOPIC_KEYWORDS_MAX_SIZE,
  TOPIC_DIFFICULTY_MIN,
  TOPIC_DIFFICULTY_MAX,
  TOPIC_INTEREST_MIN,
  TOPIC_INTEREST_MAX,
} from '@cancerweb/validation'
import { Paginated } from '../common/dto/page.input'

registerEnumType(SearchIntent, { name: 'SearchIntent' })
registerEnumType(TopicStatus, { name: 'TopicStatus' })

@ObjectType()
export class Topic {
  @Field(() => ID) id!: string
  @Field(() => ID) domainId!: string
  @Field() title!: string
  @Field(() => String, { nullable: true }) description?: string | null
  @Field(() => [String]) keywords!: string[]
  @Field(() => SearchIntent, { nullable: true }) searchIntent?: SearchIntent | null
  @Field(() => Int, { nullable: true }) estimatedDifficulty?: number | null
  @Field(() => Int, { nullable: true }) estimatedInterest?: number | null
  @Field(() => String, { nullable: true }) suggestedAngle?: string | null
  @Field(() => String, { nullable: true }) rationale?: string | null
  @Field(() => TopicStatus) status!: TopicStatus
  @Field(() => String, { nullable: true }) generatedByJobId?: string | null
  @Field() createdAt!: Date
  @Field() updatedAt!: Date
}

@ObjectType()
export class TopicConnection extends Paginated(Topic) {}

// Un `null` explicite sur `undefined`/champ omis se comportent différemment :
// voir le même motif dans domain.types.ts. Seuls description, searchIntent,
// estimatedDifficulty, estimatedInterest et suggestedAngle correspondent à
// des colonnes nullables en base et peuvent légitimement être effacées.
const skipIfOmitted = (_: unknown, value: unknown): boolean => value !== undefined

@InputType()
export class CreateTopicInput {
  @Field() @IsString() @Length(TOPIC_TITLE_MIN_LENGTH, TOPIC_TITLE_MAX_LENGTH) title!: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(TOPIC_DESCRIPTION_MAX_LENGTH) description?: string
  @Field(() => [String], { defaultValue: [] }) @ArrayMaxSize(TOPIC_KEYWORDS_MAX_SIZE) keywords!: string[]
  @Field(() => SearchIntent, { nullable: true }) @IsOptional() @IsEnum(SearchIntent) searchIntent?: SearchIntent
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(TOPIC_DIFFICULTY_MIN)
  @Max(TOPIC_DIFFICULTY_MAX)
  estimatedDifficulty?: number
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(TOPIC_INTEREST_MIN)
  @Max(TOPIC_INTEREST_MAX)
  estimatedInterest?: number
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(TOPIC_SUGGESTED_ANGLE_MAX_LENGTH) suggestedAngle?: string
}

@InputType()
export class UpdateTopicInput {
  @Field({ nullable: true })
  @ValidateIf(skipIfOmitted)
  @IsString()
  @Length(TOPIC_TITLE_MIN_LENGTH, TOPIC_TITLE_MAX_LENGTH)
  title?: string
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(TOPIC_DESCRIPTION_MAX_LENGTH) description?: string
  @Field(() => [String], { nullable: true }) @ValidateIf(skipIfOmitted) @ArrayMaxSize(TOPIC_KEYWORDS_MAX_SIZE) keywords?: string[]
  @Field(() => SearchIntent, { nullable: true }) @IsOptional() @IsEnum(SearchIntent) searchIntent?: SearchIntent
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(TOPIC_DIFFICULTY_MIN)
  @Max(TOPIC_DIFFICULTY_MAX)
  estimatedDifficulty?: number
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(TOPIC_INTEREST_MIN)
  @Max(TOPIC_INTEREST_MAX)
  estimatedInterest?: number
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(TOPIC_SUGGESTED_ANGLE_MAX_LENGTH) suggestedAngle?: string
}

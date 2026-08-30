import { Field, ID, InputType, ObjectType } from '@nestjs/graphql'
import { IsString, Length } from 'class-validator'
import { TAG_NAME_MIN_LENGTH, TAG_NAME_MAX_LENGTH } from '@cancerweb/validation'

@ObjectType()
export class Tag {
  @Field(() => ID) id!: string
  @Field(() => ID) domainId!: string
  @Field() name!: string
  @Field() slug!: string
}

@InputType()
export class CreateTagInput {
  @Field() @IsString() @Length(TAG_NAME_MIN_LENGTH, TAG_NAME_MAX_LENGTH) name!: string
}

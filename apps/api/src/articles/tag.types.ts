import { Field, ID, ObjectType } from '@nestjs/graphql'

/** Type GraphQL minimal — voir la note de `category.types.ts` : complété par la Task 12. */
@ObjectType()
export class Tag {
  @Field(() => ID) id!: string
  @Field(() => ID) domainId!: string
  @Field() name!: string
  @Field() slug!: string
}

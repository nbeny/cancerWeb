import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql'
import { GlobalRole } from '@prisma/client'

registerEnumType(GlobalRole, { name: 'GlobalRole' })

@ObjectType()
export class User {
  @Field(() => ID) id!: string
  @Field() email!: string
  @Field() name!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) bio?: string | null
  @Field(() => String, { nullable: true }) avatarUrl?: string | null
  @Field(() => GlobalRole) globalRole!: GlobalRole
  @Field() createdAt!: Date
}

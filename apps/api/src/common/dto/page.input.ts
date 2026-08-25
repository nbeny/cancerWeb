import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'
import { IsInt, Max, Min } from 'class-validator'
import { Type } from '@nestjs/common'

@InputType()
export class PageInput {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(100)
  limit!: number

  @Field(() => Int, { defaultValue: 0 })
  @IsInt() @Min(0)
  offset!: number
}

export function Paginated<T>(classRef: Type<T>): Type<{ items: T[]; totalCount: number }> {
  @ObjectType({ isAbstract: true })
  abstract class PageClass {
    @Field(() => [classRef])
    items!: T[]

    @Field(() => Int)
    totalCount!: number
  }
  return PageClass as Type<{ items: T[]; totalCount: number }>
}

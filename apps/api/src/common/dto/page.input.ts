import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'
import { IsInt, Max, Min } from 'class-validator'
import { Type } from '@nestjs/common'

@InputType()
export class PageInput {
  // Valeurs par défaut portées par le champ TS lui-même (et pas seulement par
  // `defaultValue` côté GraphQL) : quand l'argument `page` entier est omis,
  // le ValidationPipe de Nest instancie un PageInput vide (`new PageInput()`)
  // avant de valider — sans initialiseur ici, limit/offset resteraient
  // `undefined` et échoueraient la validation malgré l'argument optionnel.
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(100)
  limit: number = 20

  @Field(() => Int, { defaultValue: 0 })
  @IsInt() @Min(0)
  offset: number = 0
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

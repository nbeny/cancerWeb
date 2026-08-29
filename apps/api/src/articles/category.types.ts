import { Field, ID, ObjectType } from '@nestjs/graphql'

/**
 * Type GraphQL minimal — Task 11 en a besoin pour exposer `Article.category`
 * (premier champ imbriqué du schéma) et pour construire un chemin imbriqué
 * de plus de 8 niveaux via l'auto-référence `parent` (voir
 * `n-plus-one.int-spec.ts` / `graphql-guards.int-spec.ts`, "le test de
 * profondeur, différé deux fois"). La Task 12 le complètera (mutations,
 * `articles`, `children`...) : ce fichier ne couvre que ce dont ce lot a
 * l'usage.
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

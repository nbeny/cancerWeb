import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { GraphQLJSON } from '../common/scalars/json.scalar'
import { Paginated } from '../common/dto/page.input'

/**
 * Miroir GraphQL de `SeoIssue` (voir `seo/types.ts`, module pur). `severity`
 * reste un simple `String` plutôt qu'un enum GraphQL enregistré : c'est une
 * union de chaînes TypeScript (`Severity`), pas un enum Prisma, et la
 * dupliquer en enum GraphQL ferait deux sources de vérité à garder
 * synchronisées pour un bénéfice nul ici (aucune validation d'entrée : ce
 * type n'est jamais utilisé en entrée, seulement en sortie).
 */
@ObjectType()
export class SeoIssue {
  @Field() code!: string
  @Field() severity!: string
  @Field() message!: string
  @Field(() => String, { nullable: true }) field?: string | null
}

@ObjectType()
export class SeoReport {
  @Field(() => ID) id!: string
  @Field(() => ID) articleId!: string
  @Field(() => Int) score!: number
  @Field(() => [SeoIssue]) issues!: SeoIssue[]
  // `metrics` a des clés variables selon les critères applicables à
  // l'article (voir `analyzer.ts` : un critère neutralisé n'apporte pas les
  // mêmes clés) : un schéma JSON libre convient mieux qu'un type figé qu'il
  // faudrait faire évoluer à chaque nouveau critère.
  @Field(() => GraphQLJSON) metrics!: Record<string, number>
  @Field() computedAt!: Date
}

@ObjectType()
export class SeoReportConnection extends Paginated(SeoReport) {}

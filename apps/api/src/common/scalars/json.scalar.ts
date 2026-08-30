import { GraphQLScalarType, valueFromASTUntyped } from 'graphql'

/**
 * Scalaire GraphQL générique pour une valeur JSON sans schéma fixe (ex.
 * `SeoReport.metrics`, dont les clés varient selon les critères applicables
 * — voir `seo/types.ts`). Pas de dépendance à `graphql-type-json` : `graphql`
 * expose déjà `valueFromASTUntyped`, qui fait exactement ce dont
 * `parseLiteral` a besoin (conversion générique d'un nœud AST en valeur JS),
 * évitant d'ajouter un paquet pour quelques lignes.
 */
export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Valeur JSON arbitraire, sans schéma fixe.',
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
  parseLiteral: (ast) => valueFromASTUntyped(ast),
})

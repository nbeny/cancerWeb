import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: './schema.graphql',
  documents: './src/operations/**/*.graphql',
  generates: {
    './src/generated.ts': {
      // Depuis graphql-code-generator v6 (voir migration "operations-and-client-preset-from-5-0"),
      // 'typescript-operations' génère lui-même les types Input/Enum/Operation utilisés — le plugin
      // 'typescript' de base n'est plus nécessaire en setup un-seul-fichier et produirait des
      // déclarations dupliquées (TS2300/TS2567) avec 'typescript-operations'.
      plugins: ['typescript-operations', 'typescript-graphql-request'],
      config: {
        rawRequest: true, // expose les en-têtes de réponse — nécessaire pour lire Set-Cookie
        scalars: { DateTime: 'string' },
        avoidOptionals: { field: true },
      },
    },
  },
}

export default config

import shared from '@cancerweb/config/eslint.config.mjs';

export default [
  ...shared,
  {
    // Fichier généré par `graphql-codegen` (voir codegen.ts) : le linter
    // ne doit pas juger un artefact de build reconstruit à chaque codegen.
    ignores: ['src/generated.ts']
  }
];

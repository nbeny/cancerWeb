import shared from '@cancerweb/config/eslint.config.mjs';

export default [
  ...shared,
  {
    ignores: ['dist/', 'generated/']
  },
  {
    // jest.config.js / jest.int.config.js sont chargés par Node en CommonJS
    // (pas de "type": "module" dans package.json) : ils utilisent bien
    // `module.exports`, ce n'est pas une variable globale non déclarée.
    files: ['*.config.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly'
      }
    }
  }
];

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules/', 'dist/', '.next/', '.turbo/', 'coverage/', 'playwright-report/', 'test-results/']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `const { toOmit, ...rest } = obj` is the standard idiom for
          // dropping a property before using the remainder; `toOmit` is
          // deliberately unused and is not a real defect.
          ignoreRestSiblings: true
        }
      ]
    }
  }
];

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/api-client/src/schema.ts',
      '.superpowers/**',
    ],
  },
  ...tseslint.configs.recommended,
);

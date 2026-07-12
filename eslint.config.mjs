import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import autoImports from './.wxt/eslint-auto-imports.mjs';

export default tseslint.config(
  {
    ignores: ['.output/', '.wxt/', 'node_modules/', 'scratch/', 'public/'],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  autoImports,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

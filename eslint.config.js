import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['node_modules', 'data', 'coverage', '**/dist', 'pnpm-lock.yaml', '**/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The two classic hook rules; a hook after an early return blanked the whole app once.
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // '@perch/core' re-exports server modules (postgres, node:crypto): it blanked the web app with
    // "Buffer is not defined". Web values come from the browser-safe '@perch/core/browser'.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@perch/core',
              message: "Import values from '@perch/core/browser' (type-only imports are fine).",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
);

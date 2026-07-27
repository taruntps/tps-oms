import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// PR4 Phase 6: restored ESLint flat config (v9). All plugins were already installed;
// the config file was missing so `npm run lint` errored. This is the standard
// Vite + React + TypeScript flat config. `@typescript-eslint/no-explicit-any` is set
// to 'warn' (not error) because the codebase deliberately uses `supabase as any` for
// tables not yet in the generated Database types — a documented, intentional pattern.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow `const { omitMe, ...rest } = obj` (destructure-to-omit) and `_`-prefixed
      // intentionally-unused identifiers — both are deliberate patterns in this codebase.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
)

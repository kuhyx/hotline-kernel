import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Hardest practical configuration: every core ESLint rule (`js.configs.all`),
 * plus type-aware strict + stylistic from typescript-eslint.
 *
 * `js.configs.all` contains rules that actively contradict each other and a few
 * that are incoherent for this domain. Each disable below is a deliberate
 * decision with a stated reason, not a convenience.
 */
export default defineConfig(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  js.configs.all,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // The flat config itself lives outside tsconfig's include, so it needs
        // an explicit default-project allowance or type-aware linting aborts.
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      // A tuning rig is made of numbers. Naming 1400 as WINDUP_RIFLE_MS and
      // then exposing it on a slider is ceremony, not safety.
      'no-magic-numbers': 'off',
      // Fights domain ordering: {x, y} must not become {y, x}.
      'sort-keys': 'off',
      'sort-imports': 'off',
      // Contradicts prefer-const and one-declaration-per-line readability.
      'one-var': ['error', 'never'],
      // Ternaries are the clearest form for the small conditionals here,
      // and stylisticTypeChecked actively prefers them in places.
      'no-ternary': 'off',
      'no-nested-ternary': 'error',
      // Directly contradicts no-undef-init for `let x: T | undefined`.
      // no-undef-init is the more useful half of the pair, so it wins.
      'init-declarations': 'off',
      // dx, dy, tx, ty ARE the vocabulary of raycasting.
      'id-length': 'off',
      'capitalized-comments': 'off',
      // `undefined` is meaningful under noUncheckedIndexedAccess.
      'no-undefined': 'off',
      // Handled by the TS-aware equivalents.
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': 'error',
      // Budgets, not bans. Tightened from the defaults where practical.
      complexity: ['error', 12],
      'max-statements': ['error', 22],
      'max-lines-per-function': ['error', { max: 90, skipComments: true, skipBlankLines: true }],
      'max-lines': ['error', { max: 400, skipComments: true, skipBlankLines: true }],
      // Six, not the default three. The render and step functions take a fixed,
      // ordered set of collaborators every frame; bundling them into an options
      // object would allocate per frame in the hot loop and read worse at the
      // call site. Anything above six gets grouped instead.
      'max-params': ['error', 6],
      'max-depth': ['error', 4],
      'no-plusplus': 'error',
      'func-style': ['error', 'expression'],
      'no-void': ['error', { allowAsStatement: true }],
      'require-unicode-regexp': 'off',
      'no-inline-comments': 'off',
      'line-comment-position': 'off',
    },
  },

  {
    files: ['src/**/*.tsx', 'src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-bitwise': 'error',
    },
  },

  {
    files: ['src/core/rng.ts'],
    rules: {
      // A PRNG is bit manipulation. Expressing xor and shift arithmetically
      // would be slower and considerably less clear.
      'no-bitwise': 'off',
    },
  },

  {
    files: ['scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // A soak harness is a script: it prints, it loops, it is long by nature.
      'no-magic-numbers': 'off',
      'max-statements': 'off',
      'max-lines-per-function': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      // Tests are allowed to be long and repetitive; that is what makes them
      // readable as a specification.
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'no-magic-numbers': 'off',
      // In a test, the non-null assertion IS the assertion: if the value is
      // absent the test fails loudly at that exact line, which is the goal.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-magic-numbers': 'off',
      // Plugin config objects ship without full type declarations, so the
      // type-aware rules see `error` types when this file lints itself.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);

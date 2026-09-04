import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// One flat config for the whole repo: server is plain Node ESM, client is
// TypeScript + React, and everything under e2e/ + the two Playwright/test
// runners is Node again. `tsc --noEmit` (already run by `client`'s own
// `npm run build`) already enforces strict typing, unused locals/params,
// and switch fallthrough on the client -- this exists for what that
// doesn't cover: real bugs (undefined variables, unreachable code, a stray
// `==`) everywhere, and correct Hook usage in the client specifically.
export default tseslint.config(
  { ignores: ['**/node_modules/**', 'client/dist/**', 'test-results/**', 'playwright-report/**', 'blob-report/**'] },

  // Server: plain JS, Node, ESM.
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      // The codebase's own convention for an intentionally-unused parameter
      // (most middleware signatures are fixed by arity, e.g. Express error
      // handlers always take 4 args) is a leading underscore -- respect it
      // instead of flagging every `_req`/`_next` already written that way.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // e2e helpers + Playwright config: Node again, some of it TypeScript.
  {
    files: ['e2e/**/*.mjs', 'playwright.config.ts'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  {
    files: ['playwright.config.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // e2e specs: Node + the Playwright test globals (test, expect, ...) that
  // @playwright/test hands them as function arguments, not real globals --
  // nothing extra needed beyond Node's own.
  {
    files: ['e2e/**/*.spec.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Client: TypeScript + React, browser environment.
  {
    files: ['client/src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Just the two long-stable rules, not eslint-plugin-react-hooks@7's
      // full "recommended" -- that preset now also carries a batch of new,
      // aggressive React Compiler-readiness checks (no setState-in-effect,
      // no ref reads during render, ...) that would mean refactoring
      // several already-working, already-shipped polling/effect hooks as a
      // side effect of adding CI tooling. Worth revisiting deliberately,
      // not as a drive-by of this change.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      eqeqeq: ['error', 'smart'],
      // tsc's own noUnusedLocals/noUnusedParameters already cover this,
      // strictly (build fails on it) -- doubling it up here just risks the
      // two disagreeing on an intentionally-unused destructured field.
      '@typescript-eslint/no-unused-vars': 'off',
      // A single deliberate `any` in api.ts's generic JSON-fetch helper,
      // immediately cast to the caller's real type -- the standard shape
      // for a thin fetch wrapper, not a type-safety gap tsc would catch.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);

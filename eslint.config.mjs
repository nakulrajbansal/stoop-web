import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * Flat ESLint config.
 *
 * The `lint` script used to be `next lint`, and there was no ESLint config in
 * the repo at all. `next lint` answers that by starting an interactive "guided
 * setup" asking which config you want, which hangs forever in CI with no TTY.
 * `eslint .` against this file runs, reports and exits.
 *
 * `next/typescript` is on, which is stricter than this codebase has ever been
 * linted. Nothing is turned off. The one adjustment is severity, and only for
 * `no-explicit-any`:
 *
 *   - src/lib, src/app/api, src/types — the API and the shared server code,
 *     which is what the iOS app talks to — are held to `error`. They are
 *     currently at zero: the `as any` casts that used to live there existed
 *     only because src/types/database.ts described the schema incompletely,
 *     and removing that cause removed them.
 *
 *   - The web page components still carry 43 legacy `any`s (React pages
 *     written before the schema types worked). Those are `warn`: visible in
 *     every run, not silenced, and not this branch's to rewrite. Turning them
 *     into build-blocking errors would have meant either rewriting ~25 pages
 *     of unrelated production UI or adding eslint-disable comments, and the
 *     second is the thing worth avoiding.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'next-env.d.ts',
      'supabase/seed_*.mjs',
      'lint-summary.mjs'
    ]
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx', 'src/app/sitemap.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' }
  },
  {
    // The surface the mobile app depends on. Held to the strict setting.
    files: ['src/lib/**/*.ts', 'src/app/api/**/*.ts', 'src/types/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' }
  }
];

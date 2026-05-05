// .eslintrc.js — Freddie Mac SDLC Terminal
// Enforces code standards aligned with Freddie Mac NFRs

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'security', 'no-secrets'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:security/recommended',
    'prettier',
  ],
  rules: {
    // ── TypeScript strict rules ──────────────────────────────────────────
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',

    // ── Freddie Mac NFR: No hardcoded secrets ────────────────────────────
    'no-secrets/no-secrets': ['error', { tolerance: 4.5 }],

    // ── Security rules ───────────────────────────────────────────────────
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-object-injection': 'warn',
    'security/detect-possible-timing-attacks': 'error',

    // ── General quality ──────────────────────────────────────────────────
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.js'],
};

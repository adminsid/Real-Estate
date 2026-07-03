module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'scripts/'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // Only export-components restriction is a dev HMR hint; context files
    // legitimately export both Provider components and context objects/hooks.
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}

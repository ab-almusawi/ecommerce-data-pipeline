module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    '*.js',
  ],
  overrides: [
    {
      files: ['services/nestjs-integration/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: 'services/nestjs-integration/tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint/eslint-plugin'],
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
      ],
      rules: {
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
  ],
};

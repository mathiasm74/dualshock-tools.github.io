export default [
  {
    ignores: ['node_modules/**', 'dist/**']
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'semi': ['error', 'always'],
      'quotes': ['warn', 'single', { 'allowTemplateLiterals': true }],
      'eqeqeq': ['warn', 'always'],
      'no-console': 'off',
      'no-debugger': 'warn'
    }
  }
];
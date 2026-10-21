const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', '.workbuddy/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // 渲染层跑在浏览器上下文，不能使用 Node API
    files: ['renderer/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
]

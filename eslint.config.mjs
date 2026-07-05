import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  {
    ignores: ['lucide.min.js', 'dist/**'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.node,
        lucide: 'readonly',
      },
    },
  },
  pluginJs.configs.recommended,
  {
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
];

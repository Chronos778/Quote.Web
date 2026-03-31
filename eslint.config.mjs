import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  {
    ignores: ['lucide.min.js'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
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

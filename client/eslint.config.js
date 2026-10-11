// Лише правила, що ловлять падіння під час виконання, яких збірка Vite не бачить:
// змінна до оголошення (TDZ), неоголошені імена, порушення правил хуків React.
// Запуск: npm run lint (у CI — перед збіркою).
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.{js,jsx,mjs}'],
    plugins: { react, 'react-hooks': hooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];

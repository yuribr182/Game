import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // js/ legado fica fora do lint até ser portado (roadmap F1-F5 do PRD)
  { ignores: ['dist', 'dev-dist', 'node_modules', 'js', 'sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // fronteira: o motor puro não pode tocar DOM/render (regra do PRD §4.2)
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['*render*', '*ui*', '*audio*', 'pixi.js'], message: 'core/ não importa DOM/Pixi — comunique-se via bus.' }] },
      ],
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage'],
    },
  }
);

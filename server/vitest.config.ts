// Config própria — impede o Vitest de herdar o vite.config.ts da raiz do jogo.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});

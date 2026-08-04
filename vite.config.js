import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});

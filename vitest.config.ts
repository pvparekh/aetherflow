import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Agent worktrees live under .claude/worktrees; never test them from here.
    exclude: ['**/node_modules/**', '**/.next/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
});

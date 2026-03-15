import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-at-least-16',
      JWT_REFRESH_SECRET: 'test-refresh-secret-16',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
    },
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
})

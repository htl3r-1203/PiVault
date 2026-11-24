import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Tests laufen in Node (dort stellt globalThis.crypto die Web-Crypto-API bereit, wie im Browser).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts'],
    },
  }),
)

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://qdnmuoyqpqdewepzuezp.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: '***REMOVED***',
    },
  },
})

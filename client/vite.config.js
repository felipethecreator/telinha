import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// build sai direto na pasta que o servidor serve
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})

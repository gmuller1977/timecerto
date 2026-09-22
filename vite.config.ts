import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vite'

// SINGLE_FILE=1 gera um index.html único (usado para preview/compartilhamento)
const singleFile = process.env.SINGLE_FILE === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  base: singleFile ? './' : '/',
  build: singleFile ? { outDir: 'dist-single' } : {},
})

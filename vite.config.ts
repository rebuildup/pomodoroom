import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactCompiler from '@ls-stack/vite-plugin-react-compiler'
import path from 'path'

export default defineConfig({
  plugins: [react(), reactCompiler()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    entries: ['./src/main.tsx'],
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})

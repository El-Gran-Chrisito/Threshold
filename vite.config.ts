import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode artifact` emits one self-contained HTML file.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  build: {
    chunkSizeWarningLimit: 2000,
    // The web build also ships the marketing page (home.html); the artifact is the app alone.
    rollupOptions: mode === 'artifact' ? {} : { input: { main: 'index.html', home: 'home.html' } },
  },
}))

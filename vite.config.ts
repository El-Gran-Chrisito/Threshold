import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode artifact` emits one self-contained HTML file.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode.startsWith('artifact') ? [viteSingleFile()] : [])],
  build: {
    chunkSizeWarningLimit: 2000,
    // The web build also ships the marketing page (home.html); the artifact is the app alone.
    // `--mode artifact-home` makes a one-file copy of the marketing page.
    rollupOptions: mode === 'artifact' ? {} : mode === 'artifact-home' ? { input: 'home.html' } : { input: { main: 'index.html', home: 'home.html' } },
  },
}))

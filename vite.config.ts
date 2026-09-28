import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { crawlFiles, seoHead } from './src/landing/seo'
import { planPages } from './src/landing/planPages'

/** Link-preview tags and structured data on the marketing page; robots.txt and sitemap.xml for the site. */
function seo(siteUrl: string, site: boolean, appPath: string): Plugin {
  return {
    name: 'threshold-seo',
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith('home.html')) return html
      return html.replace('<meta property="og:image" content="shots/street.jpg" />', seoHead(siteUrl))
    },
    generateBundle() {
      if (!site) return
      // Public pages for the plan library, from the same data the app uses.
      const pages = planPages({ appPath, siteUrl })
      for (const [fileName, source] of Object.entries(pages)) this.emitFile({ type: 'asset', fileName, source })
      const { robots, sitemap } = crawlFiles(siteUrl, Object.keys(pages).map((p) => `/${p.replace(/index\.html$/, '')}`))
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      if (sitemap) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
    },
  }
}

const env = (mode: string) => loadEnv(mode, process.cwd(), 'VITE_')

// `vite build --mode artifact` emits one self-contained HTML file.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), seo(env(mode).VITE_SITE_URL ?? '', !mode.startsWith('artifact'), env(mode).VITE_APP_PATH || './index.html'), ...(mode.startsWith('artifact') ? [viteSingleFile()] : [])],
  build: {
    chunkSizeWarningLimit: 2000,
    // The web build also ships the marketing page (home.html); the artifact is the app alone.
    // `--mode artifact-home` makes a one-file copy of the marketing page.
    rollupOptions: mode === 'artifact' ? {} : mode === 'artifact-home' ? { input: 'home.html' } : { input: { main: 'index.html', home: 'home.html' } },
  },
}))

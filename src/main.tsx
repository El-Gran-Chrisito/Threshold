import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './store/store'
import { registerServiceWorker } from './product/pwa'

// Exposed for scripted browser tests.
;(window as unknown as { __threshold: unknown }).__threshold = { store: useStore }

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

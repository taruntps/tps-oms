import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnceForChunkError } from './lib/chunkReload'

// After a new deploy, a lazy route's old hashed chunk 404s. Vite fires
// `vite:preloadError`; reload once to fetch the fresh build instead of crashing.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnceForChunkError()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

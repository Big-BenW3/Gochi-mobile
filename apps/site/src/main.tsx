import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/tokens.css'

const container = document.getElementById('root')

if (!container) {
  // Fail loudly rather than rendering into nothing. A blank page with no error
  // is the hardest kind of bug to notice on a landing page.
  throw new Error('Gochi site: #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
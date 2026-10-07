import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './features/auth/AuthContext.jsx'
import { PlacementCycleProvider } from './features/placement-cycle/PlacementCycleContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <PlacementCycleProvider><AuthProvider><App /></AuthProvider></PlacementCycleProvider>
    </BrowserRouter>
  </StrictMode>,
)

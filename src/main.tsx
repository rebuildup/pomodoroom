import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/material-symbols-outlined'
import App from './App'
import StartupUpdateChecker from './components/StartupUpdateChecker'
import './index.css'

// Log environment variables for debugging
console.log('[main.tsx] Environment check:', {
  GOOGLE_CLIENT_ID: import.meta.env.GOOGLE_CLIENT_ID || 'not found',
  NODE_ENV: import.meta.env.NODE_ENV || 'not found',
  MODE: import.meta.env.MODE || 'not found'
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <StartupUpdateChecker />
  </React.StrictMode>,
)

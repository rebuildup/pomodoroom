import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/material-symbols-outlined'
import App from './App'
import StartupUpdateChecker from './components/StartupUpdateChecker'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <StartupUpdateChecker />
  </React.StrictMode>,
)

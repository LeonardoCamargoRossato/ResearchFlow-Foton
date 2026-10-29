import React from 'react'
import ReactDOM from 'react-dom/client'
import AccessGate from './auth/AccessGate'
import './styles.css'
import './governance.css'
import './mobile-ux.css'
import './coordinator-v4.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccessGate />
  </React.StrictMode>
)

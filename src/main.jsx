import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Note: StrictMode removed to prevent Plaid Link from initializing twice
// StrictMode causes double-mounting in development, which conflicts with Plaid
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

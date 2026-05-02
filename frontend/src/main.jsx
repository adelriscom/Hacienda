import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App'
import '../styles.css'
import '../styles-dashboard.css'
import '../styles-screens.css'
import './styles/modal.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import { AirCanvas } from './features/canvas/AirCanvas'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AirCanvas />
  </React.StrictMode>,
)

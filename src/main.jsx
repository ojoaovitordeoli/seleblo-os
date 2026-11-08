import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// ?chat abre a tela completa de conversa, sem carregar a ilha 3D.
const tela = new URLSearchParams(window.location.search).has('chat')
  ? lazy(() => import('./chat/RoninTela'))
  : lazy(() => import('./App'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <Suspense fallback={null}>{React.createElement(tela)}</Suspense>,
)

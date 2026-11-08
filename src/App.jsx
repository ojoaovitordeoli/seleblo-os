import React, { useCallback, useEffect, useState } from 'react'
import KnowledgePanel from './components/KnowledgePanel'
import RoninChat from './components/RoninChat'
import Header from './components/Header'
import EscritorioPixel from './pixel/EscritorioPixel'
import MundoVoxel from './mundo/MundoVoxel'
import { avisarRonin } from './pixel/roninEventos'
import './ui/tema.css'

// SELEBLO OS: ilha de blocos (16 terrenos = 16 pastas do cofre) com o robô RONIN.
// A cena 3D antiga (src/scene/OfficeScene.js) ficou no repositório, mas não é mais usada.
// Visual antigo em pixel-art: http://127.0.0.1:4173/?visual=pixel
const VISUAL = new URLSearchParams(window.location.search).get('visual') === 'pixel' ? 'pixel' : 'mundo'

export default function App() {
  const [showRoninChat, setShowRoninChat] = useState(false)
  const [zoneCommand, setZoneCommand] = useState(null)
  const [pergunta, setPergunta] = useState(null)
  const abrirPasta = useCallback((folder) => setZoneCommand({ folder, seq: Date.now() }), [])

  // "Perguntar ao RONIN" a partir de uma nota do Cofre
  useEffect(() => {
    const ouvir = (event) => {
      setPergunta({ texto: event.detail?.texto || '', nota: event.detail?.nota || null, seq: Date.now() })
      setShowRoninChat(true)
    }
    window.addEventListener('seleblo:perguntar', ouvir)
    return () => window.removeEventListener('seleblo:perguntar', ouvir)
  }, [])

  return (
    <>
      {VISUAL === 'mundo'
        ? <MundoVoxel onAbrirPasta={abrirPasta} />
        : <EscritorioPixel onAbrirPasta={abrirPasta} />}

      <Header />
      <KnowledgePanel
        command={zoneCommand}
        onFocusFolder={(pasta) => avisarRonin({ estado: 'ir', pasta })}
        onResetView={() => avisarRonin({ estado: 'casa' })}
      />
      <button
        type="button"
        className="so-placa"
        style={{ right: 16 }}
        aria-pressed={showRoninChat}
        onClick={() => setShowRoninChat((v) => !v)}
      >🤖 Falar com o RONIN</button>
      <RoninChat open={showRoninChat} onClose={() => setShowRoninChat(false)} pergunta={pergunta} />

      <div style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
        font: "700 13px 'Nunito', sans-serif", color: '#fbf4df', pointerEvents: 'none', textAlign: 'center',
        textShadow: '0 1px 0 #3a2716, 0 2px 8px rgba(30,20,10,.7)', maxWidth: 'calc(100vw - 32px)',
      }}>
        Clique numa placa para abrir a pasta · arraste para girar a ilha · role para aproximar
      </div>
    </>
  )
}

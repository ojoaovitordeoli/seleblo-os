import React, { useCallback, useState } from 'react'
import KnowledgePanel from './components/KnowledgePanel'
import RoninChat from './components/RoninChat'
import Header from './components/Header'
import EscritorioPixel from './pixel/EscritorioPixel'
import MundoVoxel from './mundo/MundoVoxel'
import { avisarRonin } from './pixel/roninEventos'

// SELEBLO OS: ilha de blocos (16 terrenos = 16 pastas do cofre) com o robô RONIN.
// A cena 3D antiga (src/scene/OfficeScene.js) ficou no repositório, mas não é mais usada.
// Visual antigo em pixel-art: http://127.0.0.1:4173/?visual=pixel
const VISUAL = new URLSearchParams(window.location.search).get('visual') === 'pixel' ? 'pixel' : 'mundo'

export default function App() {
  const [showRoninChat, setShowRoninChat] = useState(false)
  const [zoneCommand, setZoneCommand] = useState(null)
  const abrirPasta = useCallback((folder) => setZoneCommand({ folder, seq: Date.now() }), [])

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
        onClick={() => setShowRoninChat(true)}
        aria-label="Abrir chat com RONIN, agente de IA local"
        style={{
          position: 'fixed', top: 77, right: 20, zIndex: 55,
          padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
          border: '1px solid rgba(13,238,243,.45)', color: '#0DEEF3',
          background: 'rgba(3,25,45,.9)', backdropFilter: 'blur(12px)',
          fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: '.05em',
        }}
      >◉ FALAR COM RONIN · IA LOCAL</button>
      <RoninChat open={showRoninChat} onClose={() => setShowRoninChat(false)} />

      <div style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
        fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '.12em',
        color: 'rgba(234,246,255,.9)', pointerEvents: 'none', textAlign: 'center', textShadow: '0 1px 6px rgba(0,20,40,.8)',
      }}>
        clique numa placa para abrir a pasta · arraste para girar a ilha · fale com o RONIN e veja ele consultar o cofre
      </div>
    </>
  )
}

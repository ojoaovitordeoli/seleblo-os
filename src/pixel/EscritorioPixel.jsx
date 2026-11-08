import React, { useEffect, useRef, useState } from 'react'
import { KNOWLEDGE_CATEGORIES } from '../knowledgeCategories'
import { ouvirRonin, pastaDoCaminho } from './roninEventos'

/*
 * Escritório pixel-art do SELEBLO OS.
 * 16 mesas = 16 pastas do cofre. O RONIN anda até a mesa da pasta que está
 * consultando, senta e digita/lê; enquanto pensa, vai até a estante.
 * Gráficos: Pixel Agents (MIT) e Metro City (JIK-A-4) — ver public/pixel/CREDITOS.md
 */

const T = 16
const COLS = 33
const ROWS = 19
const W = COLS * T
const H = ROWS * T
const BASE = '/pixel/'

// Mesas: 2 fileiras de 8. Cadeira na frente da mesa; o RONIN senta de costas, olhando o computador.
const FILEIRAS = [{ cadeira: 6, mesa: 4 }, { cadeira: 12, mesa: 10 }]
const MESAS = KNOWLEDGE_CATEGORIES.map((cat, i) => {
  const f = FILEIRAS[Math.floor(i / 8)]
  const x0 = 1 + (i % 8) * 4
  return { ...cat, x0, cadeira: { x: x0 + 1, y: f.cadeira }, mesaY: f.mesa }
})
const CASA = { x: 16, y: 15 }
const ESTANTE = { x: 4, y: 2 }
const PASSEIOS = [{ x: 1, y: 8 }, { x: 31, y: 8 }, { x: 24, y: 16 }, { x: 8, y: 16 }, { x: 20, y: 2 }]

// Tiles bloqueados (paredes, mesas, sofá, mesinha)
const bloqueado = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => y < 2 || x === 0 && y < 2))
for (const m of MESAS) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) bloqueado[m.mesaY + dy][m.x0 + dx] = true
for (let x = 14; x <= 19; x++) bloqueado[17][x] = true // sofás
bloqueado[15][17] = bloqueado[15][18] = bloqueado[16][17] = bloqueado[16][18] = true // mesinha de centro

function caminho(de, para) {
  const k = (p) => p.y * COLS + p.x
  const fila = [de]
  const veio = new Map([[k(de), null]])
  while (fila.length) {
    const p = fila.shift()
    if (p.x === para.x && p.y === para.y) break
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: p.x + dx, y: p.y + dy }
      if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || veio.has(k(n))) continue
      if (bloqueado[n.y][n.x] && !(n.x === para.x && n.y === para.y)) continue
      veio.set(k(n), p)
      fila.push(n)
    }
  }
  if (!veio.has(k(para))) return []
  const rota = []
  for (let p = para; p && !(p.x === de.x && p.y === de.y); p = veio.get(k(p))) rota.unshift(p)
  return rota
}

function carregar(src) {
  return new Promise((ok) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => ok(null)
    img.src = BASE + src
  })
}

/** Pinta um sprite em tons de cinza com uma cor (estilo "colorize"). */
function tingir(img, cor, sx = 0, sy = 0, w = img.width, h = img.height) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = cor
  g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  return c
}

const FALAS = {
  pensando: ['Deixa eu ver…', 'Procurando no cofre…', 'Consultando a estante…'],
  erro: ['Ops, não consegui.', 'Tive um problema.'],
}
const sortear = (l) => l[Math.floor(Math.random() * l.length)]

export default function EscritorioPixel({ onAbrirPasta }) {
  const canvasRef = useRef(null)
  const caixaRef = useRef(null)
  const [layout, setLayout] = useState({ s: 2, ox: 0, oy: 0 })
  const [contagem, setContagem] = useState({})
  const [fala, setFala] = useState(null) // { texto, x, y }
  const [ativa, setAtiva] = useState(null)
  const roninRef = useRef(null)

  // Quantas notas cada pasta tem
  useEffect(() => {
    fetch('/api/seleblo/library', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const conta = (n) => (n.type === 'note' ? 1 : (n.children || []).reduce((a, c) => a + conta(c), 0))
        const c = {}
        for (const n of d.nodes || []) if (n.type === 'folder') c[n.name] = conta(n)
        setContagem(c)
      })
      .catch(() => {})
  }, [])

  // Escala inteira para o pixel-art ficar nítido
  useEffect(() => {
    const ajustar = () => {
      const el = caixaRef.current
      if (!el) return
      const { clientWidth: cw, clientHeight: ch } = el
      const s = Math.max(1, Math.floor(Math.min(cw / W, (ch - 40) / H) * 2) / 2)
      setLayout({ s, ox: Math.round((cw - W * s) / 2), oy: Math.round((ch - H * s) / 2 + 12) })
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [])

  useEffect(() => {
    let vivo = true
    let raf = 0
    const c = canvasRef.current
    const g = c.getContext('2d')
    const sprites = {}
    const ronin = {
      x: CASA.x * T, y: CASA.y * T, tile: { ...CASA }, dir: 'down', estado: 'idle', quadro: 0, tq: 0,
      rota: [], tarefas: [], acao: null, ate: 0, ocioso: 0, sentado: false,
    }
    roninRef.current = ronin

    const irPara = (alvo, acao, dur, fim) => ronin.tarefas.push({ alvo, acao, dur, fim })
    const limpar = () => { ronin.tarefas = []; ronin.acao = null; ronin.rota = [] }
    const mostrarFala = (texto, ms = 2600) => {
      setFala({ texto, ate: performance.now() + ms })
    }

    const desliga = ouvirRonin((ev) => {
      if (ev.estado === 'pensando') {
        limpar()
        mostrarFala(sortear(FALAS.pensando), 60000)
        irPara(ESTANTE, 'ler', 600000)
      } else if (ev.estado === 'respondeu') {
        limpar()
        const pastas = [...new Set((ev.pastas || []).map(pastaDoCaminho))]
          .map((p) => MESAS.find((m) => m.id === p)).filter(Boolean).slice(0, 4)
        if (!pastas.length) mostrarFala('Respondi!')
        for (const m of pastas) {
          irPara(m.cadeira, 'digitar', 2200, () => { setAtiva(m.id); mostrarFala(`Consultei ${m.title}`, 2200) })
        }
        irPara(CASA, 'idle', 0, () => setAtiva(null))
      } else if (ev.estado === 'erro') {
        limpar()
        mostrarFala(sortear(FALAS.erro))
        irPara(CASA, 'idle', 0)
      } else if (ev.estado === 'ir') {
        const m = MESAS.find((x) => x.id === ev.pasta)
        if (!m) return
        limpar()
        irPara(m.cadeira, 'ler', 600000, () => { setAtiva(m.id); mostrarFala(`Abrindo ${m.title}`) })
      } else if (ev.estado === 'casa') {
        limpar()
        setAtiva(null)
        irPara(CASA, 'idle', 0)
      }
    })

    ;(async () => {
      const nomes = ['char_0', 'floor_1', 'floor_3', 'wall_0', ...['DESK_FRONT', 'PC_FRONT_ON_1', 'PC_FRONT_ON_2', 'PC_FRONT_ON_3', 'WOODEN_CHAIR_BACK', 'DOUBLE_BOOKSHELF',
        'BOOKSHELF', 'PLANT', 'PLANT_2', 'LARGE_PLANT', 'WHITEBOARD', 'COFFEE', 'SOFA_FRONT', 'CLOCK', 'SMALL_PAINTING',
        'LARGE_PAINTING', 'COFFEE_TABLE', 'BIN', 'CACTUS'].map((n) => 'furniture/' + n)]
      const imgs = await Promise.all(nomes.map((n) => carregar(n + '.png')))
      nomes.forEach((n, i) => { sprites[n.replace('furniture/', '')] = imgs[i] })
      if (sprites.floor_1) sprites.pisoA = tingir(sprites.floor_1, '#c9a37a')
      if (sprites.floor_3) sprites.pisoB = tingir(sprites.floor_3, '#8fa6c9')
      if (sprites.wall_0) sprites.parede = tingir(sprites.wall_0, '#9fb1d6', 2 * 16, 2 * 32, 16, 32) // peça horizontal (máscara L+O)
      if (!vivo) return
      let antes = performance.now()
      const laco = (agora) => {
        const dt = Math.min(0.05, (agora - antes) / 1000)
        antes = agora
        atualizar(dt, agora)
        desenhar()
        raf = requestAnimationFrame(laco)
      }
      raf = requestAnimationFrame(laco)
    })()

    function atualizar(dt, agora) {
      const r = ronin
      // próxima tarefa
      if (!r.acao && !r.rota.length && r.tarefas.length) {
        r.acao = r.tarefas.shift()
        r.rota = caminho(r.tile, r.acao.alvo)
        r.sentado = false
      }
      if (r.rota.length) {
        const p = r.rota[0]
        const tx = p.x * T, ty = p.y * T
        const vel = 56 * dt
        const dx = tx - r.x, dy = ty - r.y
        r.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
        r.estado = 'walk'
        if (Math.abs(dx) <= vel && Math.abs(dy) <= vel) {
          r.x = tx; r.y = ty; r.tile = { x: p.x, y: p.y }; r.rota.shift()
          if (!r.rota.length && r.acao) {
            r.ate = agora + r.acao.dur
            r.acao.fim?.()
            r.sentado = MESAS.some((m) => m.cadeira.x === p.x && m.cadeira.y === p.y)
            r.dir = r.sentado || r.acao.alvo === ESTANTE ? 'up' : 'down'
          }
        } else {
          r.x += Math.sign(dx) * Math.min(vel, Math.abs(dx))
          r.y += Math.sign(dy) * Math.min(vel, Math.abs(dy))
        }
      } else if (r.acao) {
        r.estado = r.acao.acao === 'digitar' ? 'type' : r.acao.acao === 'ler' ? 'read' : 'idle'
        if (agora >= r.ate) { r.acao = null; r.estado = 'idle' }
      } else {
        r.estado = 'idle'
        r.ocioso += dt
        // passeio de vez em quando, para ele não ficar parado
        if (r.ocioso > 9 && !r.tarefas.length) {
          r.ocioso = 0
          irPara(sortear(PASSEIOS), 'idle', 1500)
          irPara(CASA, 'idle', 0)
        }
      }
      if (r.estado !== 'idle') r.ocioso = 0
      r.tq += dt
      const dur = r.estado === 'walk' ? 0.15 : 0.3
      if (r.tq >= dur) { r.tq = 0; r.quadro++ }
    }

    function desenharSprite(img, x, y, flip = false, sx = 0, sy = 0, w = img?.width, h = img?.height) {
      if (!img) return
      if (flip) {
        g.save(); g.scale(-1, 1); g.drawImage(img, sx, sy, w, h, -x - w, y, w, h); g.restore()
      } else g.drawImage(img, sx, sy, w, h, x, y, w, h)
    }

    function quadroRonin(r) {
      const linha = r.dir === 'down' ? 0 : r.dir === 'up' ? 1 : 2
      let col
      if (r.estado === 'walk') col = [0, 1, 2, 1][r.quadro % 4]
      else if (r.estado === 'type') col = 3 + (r.quadro % 2)
      else if (r.estado === 'read') col = 5 + (r.quadro % 2)
      else col = 1
      return { sx: col * 16, sy: linha * 32, flip: r.dir === 'left' }
    }

    function desenhar() {
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, W, H)
      // piso: madeira com "tapete" azul na área das mesas
      for (let y = 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const tapete = (y >= 3 && y <= 13 && x >= 0 && x <= 32)
        const piso = tapete ? sprites.pisoB : sprites.pisoA
        if (piso) g.drawImage(piso, x * T, y * T)
      }
      // parede
      for (let x = 0; x < COLS; x++) if (sprites.parede) g.drawImage(sprites.parede, x * T, 0)
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 2 * T, W, 3)
      // decoração da parede
      desenharSprite(sprites.DOUBLE_BOOKSHELF, 3 * T, 0)
      desenharSprite(sprites.DOUBLE_BOOKSHELF, 5 * T, 0)
      desenharSprite(sprites.WHITEBOARD, 10 * T, 0)
      desenharSprite(sprites.CLOCK, 14 * T, 0)
      desenharSprite(sprites.LARGE_PAINTING, 18 * T, 0)
      desenharSprite(sprites.SMALL_PAINTING, 22 * T, 0)
      desenharSprite(sprites.DOUBLE_BOOKSHELF, 26 * T, 0)
      desenharSprite(sprites.BOOKSHELF, 29 * T, T / 2)

      // objetos ordenados pela profundidade (base em y)
      const objs = []
      for (const m of MESAS) {
        const ativo = ronin.ativa === m.id
        objs.push({ y: (m.cadeira.y + 1) * T - 2, d: () => {
          if (ativo) { g.fillStyle = m.color + '55'; g.fillRect(m.x0 * T - 3, m.mesaY * T - 14, 3 * T + 6, 4 * T + 12) }
          desenharSprite(sprites.WOODEN_CHAIR_BACK, m.cadeira.x * T, (m.cadeira.y - 1) * T + 6)
        } })
        objs.push({ y: (m.mesaY + 2) * T - 4, d: () => {
          desenharSprite(sprites.DESK_FRONT, m.x0 * T, m.mesaY * T)
          const tela = ronin.ativa === m.id ? 'PC_FRONT_ON_' + (1 + (Math.floor(performance.now() / 250) % 3)) : 'PC_FRONT_ON_1'
          desenharSprite(sprites[tela], (m.x0 + 1) * T, m.mesaY * T - 12)
          // faixa colorida da pasta na frente da mesa
          g.fillStyle = m.color; g.fillRect(m.x0 * T + 4, (m.mesaY + 2) * T - 5, 3 * T - 8, 2)
        } })
      }
      // sala de estar
      objs.push({ y: 16 * T + 1, d: () => desenharSprite(sprites.COFFEE_TABLE, 17 * T, 15 * T) })
      objs.push({ y: 15 * T + 2, d: () => desenharSprite(sprites.COFFEE, 17.5 * T, 14.6 * T) })
      for (const x of [14, 16, 18]) objs.push({ y: 18 * T, d: () => desenharSprite(sprites.SOFA_FRONT, x * T, 17 * T) })
      for (const [img, x, y] of [['LARGE_PLANT', 0, 15], ['LARGE_PLANT', 31, 15], ['PLANT', 1, 2], ['PLANT_2', 31, 2], ['CACTUS', 21, 16], ['BIN', 12, 16], ['PLANT', 32, 9], ['PLANT_2', 0, 9]]) {
        const im = sprites[img]
        if (im) objs.push({ y: y * T + im.height, d: () => desenharSprite(im, x * T, y * T) })
      }
      // RONIN
      const r = ronin
      const q = quadroRonin(r)
      const yPe = r.y + T + (r.sentado ? -3 : 0)
      objs.push({ y: yPe, d: () => {
        g.fillStyle = 'rgba(0,0,0,.25)'
        g.beginPath(); g.ellipse(r.x + 8, r.y + T - 1, 6, 2.5, 0, 0, Math.PI * 2); g.fill()
        desenharSprite(sprites.char_0, r.x, yPe - 32, q.flip, q.sx, q.sy, 16, 32)
      } })
      objs.sort((a, b) => a.y - b.y).forEach((o) => o.d())

      // balão de fala acompanha o RONIN
      const el = document.getElementById('ronin-fala')
      if (el) {
        const s = Number(el.dataset.s), ox = Number(el.dataset.ox), oy = Number(el.dataset.oy)
        el.style.left = `${ox + (r.x + 8) * s}px`
        el.style.top = `${oy + (yPe - 34) * s}px`
      }
    }

    return () => { vivo = false; cancelAnimationFrame(raf); desliga() }
  }, [])

  // Expira a fala sem depender do laço de desenho (que não vê o estado novo)
  useEffect(() => {
    if (!fala) return
    const t = setTimeout(() => setFala(null), Math.max(0, fala.ate - performance.now()))
    return () => clearTimeout(t)
  }, [fala])

  // a mesa ativa também precisa chegar ao laço de desenho
  useEffect(() => { if (roninRef.current) roninRef.current.ativa = ativa }, [ativa])

  const { s, ox, oy } = layout
  return (
    <div ref={caixaRef} style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse at 50% 40%, #16233f 0%, #070d1c 75%)', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ position: 'absolute', left: ox, top: oy, width: W * s, height: H * s, imageRendering: 'pixelated', borderRadius: 6, boxShadow: '0 30px 80px rgba(0,0,0,.55), 0 0 0 2px rgba(13,238,243,.12)' }}
      />
      {MESAS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onAbrirPasta?.(m.id)}
          title={`${m.title} — ${m.description}`}
          style={{
            position: 'absolute',
            left: ox + (m.x0 + 1.5) * T * s,
            top: oy + (m.mesaY - 0.75) * T * s,
            transform: 'translate(-50%, -100%)',
            padding: '2px 6px',
            borderRadius: 6,
            border: `1px solid ${m.color}${ativa === m.id ? 'ff' : '88'}`,
            background: ativa === m.id ? `${m.color}33` : 'rgba(5,14,30,.82)',
            color: '#eaf6ff',
            fontFamily: "'DM Mono', monospace",
            fontSize: Math.max(8, Math.round(3.3 * s)),
            letterSpacing: '.04em',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            boxShadow: ativa === m.id ? `0 0 14px ${m.color}` : 'none',
          }}
        >
          <span style={{ color: m.color }}>{m.symbol}</span> {m.label}
          <span style={{ opacity: 0.6 }}> · {contagem[m.id] ?? 0}</span>
        </button>
      ))}
      <div
        id="ronin-fala"
        data-s={s}
        data-ox={ox}
        data-oy={oy}
        style={{
          position: 'absolute',
          transform: 'translate(-50%, -100%)',
          display: fala ? 'block' : 'none',
          padding: '5px 9px',
          borderRadius: 8,
          background: '#f4fbff',
          color: '#0b1a2e',
          fontFamily: "'DM Mono', monospace",
          fontSize: Math.max(10, Math.round(4.6 * s)),
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,.35)',
          pointerEvents: 'none',
        }}
      >
        {fala?.texto}
      </div>
    </div>
  )
}

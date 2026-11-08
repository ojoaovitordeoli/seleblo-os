import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { KNOWLEDGE_CATEGORIES } from '../knowledgeCategories'
import { ouvirRonin, pastaDoCaminho } from '../pixel/roninEventos'

/*
 * Mundo do SELEBLO OS: ilha flutuante de blocos.
 * 16 terrenos coloridos = 16 pastas do cofre. O RONIN é um robô 3D (CC0) que anda
 * pelos caminhos até os terrenos que consulta. Créditos em public/mundo/CREDITOS.md.
 */

const R = 24 // raio da ilha em blocos
const LOTE = 5 // terreno 5x5

// 8 terrenos no anel de dentro + 8 no de fora
const TERRENOS = KNOWLEDGE_CATEGORIES.map((cat, i) => {
  const dentro = i < 8
  const k = dentro ? i : i - 8
  const raio = dentro ? 9.5 : 17
  const ang = (k / 8) * Math.PI * 2 + (dentro ? 0 : Math.PI / 8)
  return { ...cat, cx: Math.round(Math.cos(ang) * raio), cz: Math.round(Math.sin(ang) * raio) }
})

// ruído determinístico simples
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function pastel(hex, mistura = 0.35) {
  return new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), mistura)
}

const FALAS = {
  pensando: ['Deixa eu ver…', 'Procurando no cofre…', 'Hmm, um instante…'],
  erro: ['Ops, não consegui.', 'Algo deu errado.'],
  passeio: ['Só dando uma volta 🙂', 'Tudo em ordem por aqui.', 'Organizando as ideias…'],
}
const sortear = (l) => l[Math.floor(Math.random() * l.length)]

export default function MundoVoxel({ onAbrirPasta }) {
  const caixaRef = useRef(null)
  const abrirRef = useRef(onAbrirPasta)
  useEffect(() => { abrirRef.current = onAbrirPasta }, [onAbrirPasta])

  useEffect(() => {
    const caixa = caixaRef.current
    let vivo = true

    // ---------------------------------------------------------------- cena
    const cena = new THREE.Scene()
    cena.background = new THREE.Color('#bfe3f5')
    cena.fog = new THREE.Fog('#bfe3f5', 70, 140)

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400)
    camera.position.set(46, 42, 46)

    const render = new THREE.WebGLRenderer({ antialias: true })
    render.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    render.shadowMap.enabled = true
    render.shadowMap.type = THREE.PCFSoftShadowMap
    caixa.appendChild(render.domElement)

    const rotulos = new CSS2DRenderer()
    rotulos.domElement.style.position = 'absolute'
    rotulos.domElement.style.inset = '0'
    rotulos.domElement.style.pointerEvents = 'none'
    caixa.appendChild(rotulos.domElement)

    const controles = new OrbitControls(camera, render.domElement)
    controles.enableDamping = true
    controles.target.set(0, 0, 0)
    controles.minDistance = 18
    controles.maxDistance = 95
    controles.maxPolarAngle = Math.PI * 0.44
    controles.autoRotateSpeed = 0.35
    let parado = 0
    controles.addEventListener('start', () => { parado = 0; controles.autoRotate = false })

    cena.add(new THREE.HemisphereLight('#eaf6ff', '#6b5a3e', 1.15))
    const sol = new THREE.DirectionalLight('#fff3dd', 2.2)
    sol.position.set(30, 50, 18)
    sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048)
    Object.assign(sol.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 })
    sol.shadow.bias = -0.0006
    cena.add(sol)

    // ---------------------------------------------------------------- blocos
    const cubo = new THREE.BoxGeometry(1, 1, 1)
    const blocos = { grama: [], terra: [], pedra: [], caminho: [], lote: [], tronco: [], folha: [], praca: [] }
    const ocupado = new Map() // "x,z" -> tipo do topo

    const pontoNoLote = (x, z) => TERRENOS.find((t) => Math.abs(x - t.cx) <= 2 && Math.abs(z - t.cz) <= 2)

    // caminhos: linha da praça até cada terreno
    const caminho = new Set()
    for (const t of TERRENOS) {
      const passos = Math.max(Math.abs(t.cx), Math.abs(t.cz))
      for (let i = 0; i <= passos; i++) {
        const x = Math.round((t.cx * i) / passos)
        const z = Math.round((t.cz * i) / passos)
        caminho.add(`${x},${z}`)
      }
    }
    // anel entre os terrenos de dentro e de fora
    for (let a = 0; a < 360; a += 1.5) {
      const r = 13.3
      caminho.add(`${Math.round(Math.cos((a * Math.PI) / 180) * r)},${Math.round(Math.sin((a * Math.PI) / 180) * r)}`)
    }

    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, z)
        const borda = R - 1.5 + hash(x, z) * 2.2
        if (d > borda) continue
        const lote = pontoNoLote(x, z)
        const chave = `${x},${z}`
        let topo = 'grama'
        if (d <= 3.2) topo = 'praca'
        else if (lote) topo = 'lote'
        else if (caminho.has(chave)) topo = 'caminho'
        blocos[topo].push({ x, y: -0.5, z, lote })
        ocupado.set(chave, topo)
        // corpo da ilha flutuante: mais fundo no centro
        const fundo = Math.floor(2 + (borda - d) * 0.55 + hash(z, x) * 2)
        for (let y = 1; y <= fundo; y++) blocos[y <= 2 ? 'terra' : 'pedra'].push({ x, y: -0.5 - y, z })
      }
    }

    // árvores
    let arvores = 0
    for (let i = 0; i < 400 && arvores < 30; i++) {
      const x = Math.round((hash(i, 3) - 0.5) * 2 * (R - 2))
      const z = Math.round((hash(7, i) - 0.5) * 2 * (R - 2))
      if (ocupado.get(`${x},${z}`) !== 'grama') continue
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => ocupado.get(`${x + dx},${z + dz}`) !== 'grama')) continue
      ocupado.set(`${x},${z}`, 'arvore')
      const alt = 2 + Math.round(hash(x, z) * 2)
      for (let y = 0; y < alt; y++) blocos.tronco.push({ x, y: y + 0.5, z })
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < 2; dy++) {
        if (dy === 1 && Math.abs(dx) + Math.abs(dz) === 2) continue
        blocos.folha.push({ x: x + dx, y: alt + dy + 0.5, z: z + dz })
      }
      blocos.folha.push({ x, y: alt + 2.5, z })
      arvores++
    }

    const CORES = {
      grama: '#7cc35a', terra: '#8a6239', pedra: '#8d9298', caminho: '#e3cf98', praca: '#b9bec4',
      tronco: '#7a5532', folha: '#4f9e44',
    }
    const malhas = []
    for (const [tipo, lista] of Object.entries(blocos)) {
      if (!lista.length) continue
      const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
      const m = new THREE.InstancedMesh(cubo, mat, lista.length)
      m.castShadow = tipo !== 'pedra'
      m.receiveShadow = true
      const mx = new THREE.Matrix4()
      const cor = new THREE.Color()
      lista.forEach((b, i) => {
        mx.makeTranslation(b.x, b.y, b.z)
        m.setMatrixAt(i, mx)
        if (tipo === 'lote') cor.copy(pastel(b.lote.color, 0.45))
        else cor.set(CORES[tipo])
        cor.offsetHSL(0, 0, (hash(b.x * 3 + b.y, b.z) - 0.5) * 0.07) // variação para parecer textura
        m.setColorAt(i, cor)
      })
      cena.add(m)
      malhas.push(m)
    }

    // ---------------------------------------------------------------- terrenos: cerca, baú, lanterna e placa
    const estruturas = new THREE.Group()
    cena.add(estruturas)
    const madeira = new THREE.MeshLambertMaterial({ color: '#6d4c2e' })
    const bauMat = new THREE.MeshLambertMaterial({ color: '#a8743f' })
    const ferro = new THREE.MeshLambertMaterial({ color: '#3b3f46' })
    const lanternas = {}
    const placas = {}
    for (const t of TERRENOS) {
      // postes da cerca nos cantos
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), madeira)
        p.position.set(t.cx + dx * 1.1, 0.45, t.cz + dz * 1.1)
        p.castShadow = true
        estruturas.add(p)
      }
      // baú no meio do terreno
      const bau = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), bauMat)
      bau.position.set(t.cx, 0.35, t.cz - 1)
      bau.castShadow = true
      estruturas.add(bau)
      const fecho = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.04), ferro)
      fecho.position.set(t.cx, 0.45, t.cz - 0.63)
      estruturas.add(fecho)
      // lanterna com a cor da pasta
      const poste = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), madeira)
      poste.position.set(t.cx + 1.6, 0.8, t.cz - 1.6)
      poste.castShadow = true
      estruturas.add(poste)
      const luzMat = new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.6 })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), luzMat)
      lamp.position.set(t.cx + 1.6, 1.8, t.cz - 1.6)
      estruturas.add(lamp)
      lanternas[t.id] = luzMat

      // placa (HTML) com nome e quantidade de notas
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'mundo-placa'
      el.style.setProperty('--cor', t.color)
      el.innerHTML = `<span class="s">${t.symbol}</span> ${t.label}<span class="n"> · …</span>`
      el.title = `${t.title} — ${t.description}`
      el.addEventListener('click', () => abrirRef.current?.(t.id))
      const obj = new CSS2DObject(el)
      obj.position.set(t.cx, 2.6, t.cz)
      cena.add(obj)
      placas[t.id] = el
    }

    // farol na praça (a "torre" do RONIN)
    const pedraEscura = new THREE.MeshLambertMaterial({ color: '#7d838b' })
    for (let n = 0; n < 3; n++) {
      const lado = 3 - n
      const b = new THREE.Mesh(new THREE.BoxGeometry(lado, 0.6, lado), pedraEscura)
      b.position.set(0, 0.3 + n * 0.6, 0)
      b.castShadow = b.receiveShadow = true
      cena.add(b)
    }
    const nucleoMat = new THREE.MeshStandardMaterial({ color: '#7ff6ff', emissive: '#4fe8ff', emissiveIntensity: 1.2 })
    const nucleo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), nucleoMat)
    nucleo.position.set(0, 2.1, 0)
    cena.add(nucleo)
    const feixe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#bff8ff', transparent: true, opacity: 0.35, depthWrite: false }),
    )
    feixe.position.set(0, 32, 0)
    cena.add(feixe)

    // nuvens de blocos
    const nuvens = new THREE.Group()
    const nuvemMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 })
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group()
      const n = 3 + Math.floor(hash(i, 9) * 4)
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3 + hash(k, i) * 3, 1, 2.5 + hash(i, k) * 2), nuvemMat)
        b.position.set(k * 2.2 - n, 0, (hash(k + 2, i) - 0.5) * 2)
        g.add(b)
      }
      const angN = (i / 7) * Math.PI * 2 + hash(i, 1)
      const raioN = 34 + hash(1, i) * 18
      g.position.set(Math.cos(angN) * raioN, -9 + hash(2, i) * 7, Math.sin(angN) * raioN)
      g.userData.ang = angN
      g.userData.raio = raioN
      g.userData.vel = 0.6 + hash(i, 4) * 0.8
      nuvens.add(g)
    }
    cena.add(nuvens)

    // contagem de notas
    fetch('/api/seleblo/library', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const conta = (n) => (n.type === 'note' ? 1 : (n.children || []).reduce((a, c) => a + conta(c), 0))
        for (const n of d.nodes || []) {
          const el = placas[n.name]
          if (el && n.type === 'folder') el.querySelector('.n').textContent = ` · ${conta(n)}`
        }
        for (const el of Object.values(placas)) {
          const n = el.querySelector('.n')
          if (n.textContent.includes('…')) n.textContent = ' · 0'
        }
      })
      .catch(() => {})

    // ---------------------------------------------------------------- RONIN (robô)
    const ronin = {
      obj: null, mixer: null, acoes: {}, atual: null, pos: new THREE.Vector3(1.8, 0, 2.2), rot: 0,
      rota: [], tarefas: [], tarefa: null, ate: 0, ocioso: 0, ativa: null,
    }
    const balao = document.createElement('div')
    balao.className = 'mundo-balao'
    const balaoObj = new CSS2DObject(balao)
    let balaoAte = 0
    const falar = (texto, ms = 2600) => {
      balao.textContent = texto
      balao.style.display = 'block'
      balaoAte = performance.now() + ms
    }

    const tocar = (nome, { uma = false, fade = 0.25 } = {}) => {
      const a = ronin.acoes[nome]
      if (!a || ronin.atual === a) return a
      a.reset()
      a.setLoop(uma ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
      a.clampWhenFinished = uma
      a.fadeIn(fade).play()
      if (ronin.atual) ronin.atual.fadeOut(fade)
      ronin.atual = a
      return a
    }

    new GLTFLoader().load('/mundo/RobotExpressive.glb', (gltf) => {
      if (!vivo) return
      const obj = gltf.scene
      const caixaBB = new THREE.Box3().setFromObject(obj)
      const altura = caixaBB.max.y - caixaBB.min.y
      obj.scale.setScalar(2.3 / altura)
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true } })
      obj.position.copy(ronin.pos)
      cena.add(obj)
      ronin.obj = obj
      ronin.mixer = new THREE.AnimationMixer(obj)
      for (const clip of gltf.animations) ronin.acoes[clip.name] = ronin.mixer.clipAction(clip)
      ronin.mixer.addEventListener('finished', () => { ronin.atual = null; tocar('Idle') })
      balaoObj.position.set(0, altura * 1.15, 0)
      obj.add(balaoObj)
      tocar('Idle')
      falar('Oi! Eu sou o RONIN.', 3000)
      setTimeout(() => tocar('Wave', { uma: true }), 400)
    })

    const centroLote = (t) => new THREE.Vector3(t.cx, 0, t.cz + 0.6)
    const PRACA = new THREE.Vector3(1.8, 0, 2.2)
    // rota: sempre pela praça (os caminhos saem dela)
    const rotaAte = (destino) => {
      const pontos = []
      const daPraca = ronin.pos.distanceTo(PRACA) > 1.5
      if (daPraca) pontos.push(PRACA.clone())
      pontos.push(destino.clone())
      return pontos
    }
    const fazer = (destino, acao, dur, aoChegar) => ronin.tarefas.push({ destino, acao, dur, aoChegar })
    const limpar = () => { ronin.tarefas = []; ronin.tarefa = null; ronin.rota = [] }
    const acender = (id) => {
      for (const [k, m] of Object.entries(lanternas)) m.emissiveIntensity = k === id ? 2.2 : 0.6
      for (const [k, el] of Object.entries(placas)) el.classList.toggle('ativa', k === id)
      ronin.ativa = id
    }

    const desliga = ouvirRonin((ev) => {
      ronin.ocioso = 0
      if (ev.estado === 'pensando') {
        limpar()
        falar(sortear(FALAS.pensando), 60000)
        fazer(PRACA, 'Idle', 600000, () => { nucleoMat.emissiveIntensity = 3 })
      } else if (ev.estado === 'respondeu') {
        limpar()
        nucleoMat.emissiveIntensity = 1.2
        const lotes = [...new Set((ev.pastas || []).map(pastaDoCaminho))]
          .map((p) => TERRENOS.find((t) => t.id === p)).filter(Boolean).slice(0, 4)
        if (!lotes.length) { falar('Respondi!'); tocar('Yes', { uma: true }) }
        for (const t of lotes) {
          fazer(centroLote(t), 'ThumbsUp', 2200, () => { acender(t.id); falar(`Consultei ${t.title}`, 2200) })
        }
        fazer(PRACA, 'Dance', 2600, () => { acender(null); falar('Pronto! 🎉', 2000) })
      } else if (ev.estado === 'erro') {
        limpar()
        nucleoMat.emissiveIntensity = 1.2
        falar(sortear(FALAS.erro))
        tocar('No', { uma: true })
      } else if (ev.estado === 'ir') {
        const t = TERRENOS.find((x) => x.id === ev.pasta)
        if (!t) return
        limpar()
        fazer(centroLote(t), 'Wave', 600000, () => { acender(t.id); falar(`Abrindo ${t.title}`) })
      } else if (ev.estado === 'casa') {
        limpar()
        acender(null)
        fazer(PRACA, 'Idle', 0)
      }
    })

    // ---------------------------------------------------------------- laço
    const relogio = new THREE.Clock()
    let raf = 0
    const ajustar = () => {
      const w = caixa.clientWidth, h = caixa.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render.setSize(w, h)
      rotulos.setSize(w, h)
    }
    ajustar()
    window.addEventListener('resize', ajustar)

    const laco = () => {
      const dt = Math.min(0.05, relogio.getDelta())
      const agora = performance.now()
      const r = ronin
      if (r.obj) {
        if (!r.tarefa && !r.rota.length && r.tarefas.length) {
          r.tarefa = r.tarefas.shift()
          r.rota = rotaAte(r.tarefa.destino)
        }
        if (r.rota.length) {
          const alvo = r.rota[0]
          const dir = alvo.clone().sub(r.pos)
          const dist = dir.length()
          const vel = 3.2 * dt
          if (dist <= vel) {
            r.pos.copy(alvo)
            r.rota.shift()
            if (!r.rota.length && r.tarefa) {
              r.ate = agora + r.tarefa.dur
              r.tarefa.aoChegar?.()
              tocar(r.tarefa.acao, { uma: ['ThumbsUp', 'Wave', 'Yes', 'No', 'Jump'].includes(r.tarefa.acao) })
            }
          } else {
            r.pos.addScaledVector(dir.normalize(), vel)
            r.rot = Math.atan2(dir.x, dir.z)
            tocar('Walking')
          }
        } else if (r.tarefa) {
          if (agora >= r.ate) { r.tarefa = null; if (!r.tarefas.length && r.atual?.getClip().name !== 'Idle') tocar('Idle') }
        } else {
          if (r.atual?.getClip().name === 'Walking') tocar('Idle')
          r.ocioso += dt
          // passeia sozinho de vez em quando para o mundo ficar vivo
          if (r.ocioso > 11) {
            r.ocioso = 0
            const t = sortear(TERRENOS)
            const extra = Math.random() < 0.35 ? 'Dance' : 'Wave'
            fazer(centroLote(t), extra, 2400, () => falar(Math.random() < 0.5 ? sortear(FALAS.passeio) : `Passando em ${t.title}`, 2200))
            fazer(PRACA, 'Idle', 0)
          }
        }
        r.obj.position.copy(r.pos)
        const alvoRot = r.rot
        let delta = alvoRot - r.obj.rotation.y
        delta = Math.atan2(Math.sin(delta), Math.cos(delta))
        r.obj.rotation.y += delta * Math.min(1, dt * 10)
        r.mixer.update(dt)
      }
      if (balaoAte && agora > balaoAte) { balao.style.display = 'none'; balaoAte = 0 }

      for (const n of nuvens.children) {
        n.userData.ang += n.userData.vel * dt * 0.012
        n.position.x = Math.cos(n.userData.ang) * n.userData.raio
        n.position.z = Math.sin(n.userData.ang) * n.userData.raio
      }
      nucleo.rotation.y += dt * 1.5
      parado += dt
      if (parado > 15) controles.autoRotate = true
      controles.update()
      render.render(cena, camera)
      rotulos.render(cena, camera)
      raf = requestAnimationFrame(laco)
    }
    raf = requestAnimationFrame(laco)

    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      desliga()
      window.removeEventListener('resize', ajustar)
      controles.dispose()
      malhas.forEach((m) => { m.dispose(); m.material.dispose() })
      render.dispose()
      caixa.innerHTML = ''
    }
  }, [])

  return (
    <>
      <div ref={caixaRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />
      <style>{`
        .mundo-placa {
          pointer-events: auto; cursor: pointer; white-space: nowrap;
          padding: 3px 8px; border-radius: 4px; border: 2px solid var(--cor);
          background: rgba(32, 24, 14, .82); color: #fff8e6;
          font: 11px 'DM Mono', monospace; letter-spacing: .04em;
          box-shadow: 0 2px 0 rgba(0,0,0,.35);
        }
        .mundo-placa .s { color: var(--cor) }
        .mundo-placa .n { opacity: .7 }
        .mundo-placa:hover, .mundo-placa.ativa { background: var(--cor); color: #10131a; transform: scale(1.08) }
        .mundo-placa.ativa .s { color: #10131a }
        .mundo-balao {
          display: none; white-space: nowrap; padding: 6px 10px; border-radius: 10px;
          background: #ffffff; color: #13202f; font: 12px 'DM Mono', monospace;
          box-shadow: 0 4px 14px rgba(0,0,0,.25); transform: translateY(-14px);
        }
      `}</style>
    </>
  )
}

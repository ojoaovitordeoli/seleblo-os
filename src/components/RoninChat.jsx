import React, { useCallback, useEffect, useRef, useState } from 'react'
import { abrirNota, avisarRonin } from '../pixel/roninEventos'
import { KNOWLEDGE_CATEGORIES } from '../knowledgeCategories'
import Markdown from '../ui/Markdown'
import '../ui/tema.css'

// Chat com o RONIN (IA local via Ollama), no tema "Ilha".
const SUGESTOES = [
  'O que eu salvei recentemente?',
  'Resuma o que tenho sobre Projetos',
  'Tem alguma copy guardada que eu possa reaproveitar?',
  'Quais ideias de conteúdo tenho no cofre?',
]
const STATUS = {
  checking: ['Verificando…', '#d9c27a'],
  ready: ['Pronto', '#7cc35a'],
  thinking: ['Pensando…', '#ffb52e'],
  'model-missing': ['Modelo local não instalado', '#e0735b'],
  offline: ['Desligado', '#e0735b'],
}
const nomeDaNota = (path = '') => path.split('/').pop().replace(/\.md$/i, '')

export default function RoninChat({ open, onClose, pergunta }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('checking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [copiado, setCopiado] = useState(null)
  const [foco, setFoco] = useState(null) // nota escolhida no Cofre
  const conversationRef = useRef(null)
  const requestRef = useRef(null)
  const campoRef = useRef(null)

  const verificar = useCallback((signal) => {
    setStatus('checking')
    return fetch('/api/seleblo/status', { signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'erro')
        setStatus(data.available ? 'ready' : data.reason === 'model_not_installed' ? 'model-missing' : 'offline')
      })
      .catch((fetchError) => { if (fetchError.name !== 'AbortError') setStatus('offline') })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    verificar(controller.signal)
    setTimeout(() => campoRef.current?.focus(), 50)
    return () => controller.abort()
  }, [open, verificar])

  // Pergunta vinda do Cofre ("Perguntar ao RONIN")
  useEffect(() => {
    if (!pergunta?.texto) return
    setDraft(pergunta.texto)
    setFoco(pergunta.nota || null)
    if (pergunta.nota?.pasta && KNOWLEDGE_CATEGORIES.some((c) => c.id === pergunta.nota.pasta)) setCategory(pergunta.nota.pasta)
    setTimeout(() => campoRef.current?.focus(), 50)
  }, [pergunta])

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, error])

  // Cronômetro enquanto pensa (a IA local pode levar até 1 minuto)
  useEffect(() => {
    if (!loading) return undefined
    setSegundos(0)
    const inicio = Date.now()
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 500)
    return () => clearInterval(t)
  }, [loading])

  useEffect(() => {
    if (open) return undefined
    return () => {
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [open])

  async function enviar(textoBruto) {
    const message = (textoBruto ?? draft).trim()
    if (!message || loading || requestRef.current) return
    const priorMessages = messages.filter((item) => item.role === 'user' || item.role === 'assistant')
    const previousSources = [...new Set(priorMessages.filter((item) => item.role === 'assistant').slice(-2)
      .flatMap((item) => item.sources?.map((source) => source.path) || []))].concat(foco?.path ? [foco.path] : []).slice(-4)
    setMessages((current) => [...current, { role: 'user', content: message }])
    setDraft('')
    setError('')
    setLoading(true)
    avisarRonin({ estado: 'pensando' })
    const controller = new AbortController()
    requestRef.current = controller
    const inicio = Date.now()
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), 90000)
    try {
      const response = await fetch('/api/seleblo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history: priorMessages.slice(-4),
          previousSources,
          category: category && category !== 'sem-cofre' ? category : null,
          useKnowledge: category !== 'sem-cofre',
          focusPath: foco?.path || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não consegui uma resposta do RONIN.')
      if (requestRef.current !== controller) return
      avisarRonin({ estado: 'respondeu', pastas: (data.sources || []).map((source) => source.path) })
      setStatus('ready')
      setMessages((current) => [...current, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        knowledgeUsed: data.knowledgeUsed,
        contextSufficient: data.contextSufficient,
        segundos: Math.round((Date.now() - inicio) / 1000),
      }])
    } catch (requestError) {
      if (requestRef.current !== controller) return
      avisarRonin({ estado: 'erro' })
      if (controller.signal.aborted) {
        setError(controller.signal.reason?.message === 'timeout'
          ? 'O RONIN demorou mais de 90 segundos. Tente uma pergunta mais curta ou escolha uma pasta.'
          : 'Pergunta cancelada.')
      } else if (/ollama/i.test(requestError.message)) {
        setStatus('offline')
        setError('A IA local (Ollama) está desligada. Abra o app Ollama (ícone perto do relógio) e clique em "Tentar de novo".')
      } else setError(requestError.message || 'Falha ao conversar com o RONIN.')
      setMessages((current) => current[current.length - 1]?.role === 'user' ? current.slice(0, -1) : current)
      setDraft(message)
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  async function copiar(texto, i) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(i)
      setTimeout(() => setCopiado(null), 1500)
    } catch { /* sem permissão de área de transferência */ }
  }

  if (!open) return null
  const [rotulo, cor] = STATUS[loading ? 'thinking' : status] || STATUS.offline

  return <aside className="so-painel" aria-label="Chat com o RONIN" style={{ top: 132, right: 16, bottom: 16, width: 'min(440px, calc(100vw - 32px))' }}>
    <header className="so-topo">
      <div>
        <h2>🤖 RONIN</h2>
        <div className="so-sub" style={{ marginTop: 4 }}>
          <span className="so-status" style={{ '--cor': cor }}><i />{rotulo}</span>
          <span style={{ marginLeft: 8 }}>IA local · lê o seu cofre</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {messages.length > 0 && <button type="button" className="so-btn so-btn--icone" title="Nova conversa" aria-label="Nova conversa" onClick={() => { setMessages([]); setError('') }} disabled={loading}>⟲</button>}
        <button type="button" className="so-btn so-btn--icone" onClick={onClose} title="Fechar" aria-label="Fechar o chat">✕</button>
      </div>
    </header>

    <div ref={conversationRef} className="so-corpo" aria-live="polite">
      {(status === 'offline' || status === 'model-missing') && !loading && <div className="so-aviso so-aviso--erro" style={{ marginBottom: 12 }}>
        {status === 'offline'
          ? 'A IA local (Ollama) não está respondendo. Abra o app Ollama e tente de novo.'
          : 'O modelo de IA local não está instalado no Ollama.'}
        <div style={{ marginTop: 8 }}><button type="button" className="so-btn" onClick={() => verificar()}>Tentar de novo</button></div>
      </div>}

      {!messages.length && !loading && <div className="so-vazio" style={{ paddingTop: 12 }}>
        <span className="so-icone-grande">🤖</span>
        Oi! Pergunte qualquer coisa sobre o que você guardou no cofre.
        <div style={{ display: 'grid', gap: 8, marginTop: 16, textAlign: 'left' }}>
          {SUGESTOES.map((s) => <button type="button" key={s} className="so-item" style={{ minHeight: 44 }} disabled={status !== 'ready'} onClick={() => enviar(s)}>
            <span className="so-titulo" style={{ fontWeight: 700 }}>{s}</span><span className="so-seta">›</span>
          </button>)}
        </div>
      </div>}

      {messages.map((item, index) => item.role === 'user'
        ? <div key={index} className="so-msg so-msg--voce">{item.content}</div>
        : <div key={index} className="so-msg so-msg--ronin">
          <Markdown texto={item.content} />
          {item.knowledgeUsed && !item.contextSufficient && <div className="so-aviso so-aviso--atencao" style={{ marginTop: 8, fontSize: 12 }}>Não achei muito sobre isso no cofre — a resposta pode ser genérica.</div>}
          {item.sources?.length > 0 && <div style={{ marginTop: 10 }}>
            <div className="so-rotulo">Fontes no cofre</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {item.sources.map((source) => <button type="button" key={source.path} className="so-chip" title={source.excerpt || source.path} onClick={() => abrirNota(source.path)}>
                📄 {nomeDaNota(source.path)}
              </button>)}
            </div>
          </div>}
          <div className="so-msg-meta">
            <span>{item.knowledgeUsed ? `respondeu em ${item.segundos ?? '?'} s` : `resposta geral · ${item.segundos ?? '?'} s`}</span>
            <button type="button" className="so-chip" onClick={() => copiar(item.content, index)}>{copiado === index ? '✓ copiado' : 'Copiar'}</button>
          </div>
        </div>)}

      {loading && <div className="so-msg so-msg--ronin" role="status">
        <span className="so-pensando" aria-hidden="true"><i /><i /><i /></span>
        Pensando… <strong>{segundos}s</strong>
        <div style={{ fontSize: 12, color: 'var(--tinta-3)', marginTop: 4 }}>A IA roda no seu PC: pode levar até 1 minuto.</div>
        <button type="button" className="so-btn so-btn--leve" style={{ marginTop: 8 }} onClick={() => requestRef.current?.abort()}>Cancelar</button>
      </div>}
      {error && <div className="so-aviso so-aviso--erro" role="alert">{error}</div>}
    </div>

    <form className="so-rodape" onSubmit={(event) => { event.preventDefault(); enviar() }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <label htmlFor="ronin-onde" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tinta-2)', whiteSpace: 'nowrap' }}>Procurar em</label>
        <select id="ronin-onde" className="so-campo" style={{ minHeight: 34, padding: '4px 8px', fontSize: 13 }} value={category} onChange={(event) => setCategory(event.target.value)} disabled={loading}>
          <option value="">Todo o cofre</option>
          {KNOWLEDGE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          <option value="sem-cofre">Não usar o cofre (conversa livre)</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={campoRef}
          className="so-campo"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar() } }}
          maxLength={1800}
          rows={2}
          aria-label="Mensagem para o RONIN"
          placeholder="Pergunte ao RONIN… (Enter envia)"
          disabled={loading}
          style={{ minHeight: 48 }}
        />
        <button type="submit" className="so-btn so-btn--principal" disabled={loading || !draft.trim()} aria-label="Enviar">Enviar</button>
      </div>
    </form>
  </aside>
}

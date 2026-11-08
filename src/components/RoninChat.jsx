import React, { useEffect, useRef, useState } from 'react'
import { avisarRonin } from '../pixel/roninEventos'
import { KNOWLEDGE_CATEGORIES } from '../knowledgeCategories'

const MONO = "'DM Mono',monospace"
const panelStyle = {
  position: 'fixed',
  top: 122,
  right: 18,
  bottom: 18,
  width: 'min(430px, calc(100vw - 36px))',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  color: '#ecf7ff',
  background: 'rgba(2,13,29,.96)',
  border: '1px solid rgba(13,238,243,.28)',
  borderRadius: 16,
  boxShadow: '0 20px 70px rgba(0,0,0,.55)',
  backdropFilter: 'blur(22px)',
  fontFamily: "'DM Sans',sans-serif",
}
const buttonStyle = {
  border: '1px solid rgba(13,238,243,.35)',
  borderRadius: 8,
  background: 'rgba(13,238,243,.09)',
  color: '#0DEEF3',
  padding: '8px 11px',
  cursor: 'pointer',
  fontFamily: MONO,
  fontSize: 10,
}

export default function RoninChat({ open, onClose }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState('')
  const [useKnowledge, setUseKnowledge] = useState(true)
  const [status, setStatus] = useState('checking')
  const [model, setModel] = useState('qwen3:4b')
  const [fallbackUsed, setFallbackUsed] = useState(false)
  const [thinkingEnabled, setThinkingEnabled] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const conversationRef = useRef(null)
  const requestRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    setStatus('checking')
    fetch('/api/seleblo/status', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível verificar o modelo local.')
        setStatus(data.available ? 'ready' : data.reason === 'model_not_installed' ? 'model-missing' : 'offline')
        setModel(data.model || 'qwen3:4b')
        setFallbackUsed(Boolean(data.fallbackUsed))
        setThinkingEnabled(typeof data.thinkingEnabled === 'boolean' ? data.thinkingEnabled : null)
      })
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setStatus('offline')
      })
    return () => controller.abort()
  }, [open])

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, error])

  useEffect(() => {
    if (!open) {
      setLoading(false)
      return undefined
    }
    return () => {
      const hadPendingRequest = Boolean(requestRef.current)
      requestRef.current?.abort()
      requestRef.current = null
      if (hadPendingRequest) {
        setLoading(false)
        setMessages(current => current[current.length - 1]?.role === 'user' ? current.slice(0, -1) : current)
      }
    }
  }, [open])

  async function sendMessage(event) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || loading || requestRef.current) return
    const priorMessages = messages.filter(item => item.role === 'user' || item.role === 'assistant')
    const previousSources = [...new Set(priorMessages
      .filter(item => item.role === 'assistant')
      .slice(-2)
      .flatMap(item => item.sources?.map(source => source.path) || []))]
      .slice(-4)
    setMessages(current => [...current, { role: 'user', content: message }])
    setDraft('')
    setError('')
    setLoading(true)
    avisarRonin({ estado: 'pensando' })
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), 80000)
    try {
      const response = await fetch('/api/seleblo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history: priorMessages.slice(-4),
          previousSources,
          category: category || null,
          useKnowledge,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível obter uma resposta do RONIN.')
      if (requestRef.current !== controller) return
      avisarRonin({ estado: 'respondeu', pastas: (data.sources || []).map(source => source.path) })
      setMessages(current => [...current, {
        role: 'assistant',
        content: data.answer,
        model: data.model,
        sources: data.sources || [],
        timings: data.timings,
        contextSufficient: data.contextSufficient,
        knowledgeUsed: data.knowledgeUsed,
        reasoningEnabled: data.reasoningEnabled,
        fallbackUsed: data.fallbackUsed,
      }])
    } catch (requestError) {
      if (requestRef.current !== controller) return
      avisarRonin({ estado: 'erro' })
      if (controller.signal.aborted || requestError.name === 'AbortError' || requestError.name === 'TimeoutError') {
        setError(controller.signal.reason?.message === 'timeout'
          ? 'A solicitação excedeu o limite de 80 segundos.'
          : 'Solicitação cancelada.')
      } else {
        setError(requestError.message || 'Falha ao conversar com o RONIN local.')
      }
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  function cancelRequest() {
    requestRef.current?.abort()
  }

  if (!open) return null
  const statusLabel = status === 'ready' ? `${model.toUpperCase()} · ${fallbackUsed ? 'FALLBACK LOCAL' : 'PRIORITÁRIO'}`
    : status === 'checking' ? 'VERIFICANDO OLLAMA...'
      : status === 'model-missing' ? 'MODELO LOCAL NÃO INSTALADO'
        : 'OLLAMA INDISPONÍVEL'
  const statusColor = status === 'ready' ? '#6CE6BB' : status === 'checking' ? '#91aac5' : '#ff9e9e'

  return <aside aria-label="Chat com RONIN" style={panelStyle}>
    <header style={{ padding: '15px 16px 12px', borderBottom: '1px solid rgba(120,185,224,.18)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ font: `9px ${MONO}`, letterSpacing: '.13em', color: '#0DEEF3' }}>SELEBLO OS / AGENTE CONECTADO</div>
          <h2 style={{ margin: '5px 0 3px', font: "700 19px 'Syne',sans-serif" }}>RONIN</h2>
          <div style={{ font: `9px ${MONO}`, color: statusColor }}>● {statusLabel}{thinkingEnabled ? ' · RACIOCÍNIO ATIVO' : ''}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar chat" style={{ ...buttonStyle, padding: '5px 9px' }}>✕</button>
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.5, color: '#91aac5', margin: '10px 0 0' }}>
        {fallbackUsed
          ? 'Usando qwen2.5:3b local como fallback para priorizar respostas sem raciocínio prolongado.'
          : thinkingEnabled
          ? 'Ollama não permite desligar o raciocínio neste modelo; somente a resposta final é exibida.'
          : 'IA via Ollama local · somente leitura · documentos consultados aparecem como fontes.'}
      </p>
    </header>

    <div ref={conversationRef} aria-live="polite" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
      {!messages.length && !loading && <div style={{ padding: '24px 8px', color: '#91aac5', textAlign: 'center', fontSize: 12, lineHeight: 1.7 }}>
        {status === 'ready'
          ? 'Pergunte ao RONIN sobre o seu Segundo Cérebro ou faça uma pergunta geral.'
          : 'O chat está disponível, mas a geração só funcionará quando o Ollama e o modelo local estiverem prontos.'}
      </div>}
      {messages.map((item, index) => <article key={`${index}-${item.role}`} style={{
        marginBottom: 12,
        padding: 11,
        borderRadius: 11,
        background: item.role === 'user' ? 'rgba(13,238,243,.09)' : 'rgba(255,255,255,.045)',
        border: `1px solid ${item.role === 'user' ? 'rgba(13,238,243,.2)' : 'rgba(255,255,255,.07)'}`,
      }}>
        <div style={{ font: `9px ${MONO}`, letterSpacing: '.08em', color: item.role === 'user' ? '#0DEEF3' : '#a59bff', marginBottom: 6 }}>
          {item.role === 'user' ? 'VOCÊ' : `RONIN · ${item.model || 'QWEN3:4B'}`}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.65, color: '#e1edf6' }}>{item.content}</div>
        {item.role === 'assistant' && item.timings && <div style={{ marginTop: 7, font: `9px ${MONO}`, color: '#91aac5' }}>
          Busca {item.timings.retrievalMs} ms · modelo {item.timings.modelSelectionMs} ms · Ollama {item.timings.generationMs} ms · total {item.timings.totalMs} ms
        </div>}
        {item.role === 'assistant' && item.knowledgeUsed && !item.contextSufficient && <div style={{ marginTop: 8, color: '#ffd186', fontSize: 10 }}>
          Não encontrei conteúdo suficiente no cofre para fundamentar esta resposta.
        </div>}
        {item.role === 'assistant' && item.reasoningEnabled && <div style={{ marginTop: 8, color: '#91aac5', fontSize: 10 }}>
          O modelo exige raciocínio ativo; o traço interno não é exibido.
        </div>}
        {item.role === 'assistant' && item.fallbackUsed && <div style={{ marginTop: 8, color: '#91aac5', fontSize: 10 }}>
          Resposta gerada pelo fallback local {item.model}.
        </div>}
        {item.role === 'assistant' && item.knowledgeUsed && item.sources?.length > 0 && <div style={{ marginTop: 11, paddingTop: 9, borderTop: '1px solid rgba(120,185,224,.16)' }}>
          <div style={{ font: `9px ${MONO}`, color: '#0DEEF3', marginBottom: 6 }}>FONTES CONSULTADAS · {item.sources.length}</div>
          {item.sources.map(source => <div key={source.path} style={{ marginTop: 7, fontSize: 10, color: '#a9bfd2' }}>
            <div style={{ overflowWrap: 'anywhere', color: '#bdeff0' }}>{source.path}</div>
            {source.excerpt && <div style={{ marginTop: 3, lineHeight: 1.5 }}>{source.excerpt}</div>}
          </div>)}
        </div>}
        {item.role === 'assistant' && !item.knowledgeUsed && <div style={{ marginTop: 8, color: '#91aac5', fontSize: 10 }}>Resposta geral · cofre não consultado.</div>}
      </article>)}
      {loading && <div role="status" style={{ padding: 11, color: '#0DEEF3', font: `10px ${MONO}` }}>
        RONIN está consultando o modelo local…
      </div>}
    </div>

    {error && <div role="alert" style={{ margin: '0 14px 8px', padding: 9, borderRadius: 8, color: '#ffb1b1', background: 'rgba(255,80,80,.1)', fontSize: 11, overflowWrap: 'anywhere' }}>{error}</div>}

    <form onSubmit={sendMessage} style={{ padding: 13, borderTop: '1px solid rgba(120,185,224,.18)' }}>
      <label style={{ display: 'block', font: `9px ${MONO}`, color: '#91aac5', marginBottom: 6 }}>
        CONSULTAR
        <select value={category} onChange={event => setCategory(event.target.value)} disabled={loading} style={{
          display: 'block', width: '100%', marginTop: 5, padding: 8, borderRadius: 7,
          color: '#ecf7ff', background: '#061a2d', border: '1px solid rgba(120,185,224,.2)',
        }}>
          <option value="">Todo o Segundo Cérebro</option>
          {KNOWLEDGE_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '8px 0', color: '#91aac5', fontSize: 10 }}>
        <input type="checkbox" checked={useKnowledge} onChange={event => setUseKnowledge(event.target.checked)} disabled={loading}/>
        Buscar fontes no Obsidian
      </label>
      <textarea
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.form.requestSubmit()
          }
        }}
        maxLength={1800}
        rows={3}
        aria-label="Mensagem para RONIN"
        placeholder="Escreva sua pergunta…"
        disabled={loading}
        style={{
          width: '100%', resize: 'vertical', minHeight: 65, padding: 10,
          borderRadius: 9, outline: 'none', color: '#ecf7ff', background: '#061a2d',
          border: '1px solid rgba(120,185,224,.2)', font: '12px DM Sans,sans-serif',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ color: '#7296b5', font: `9px ${MONO}` }}>{draft.length}/1800 · Ollama local</span>
        {loading
          ? <button type="button" onClick={cancelRequest} style={buttonStyle}>CANCELAR</button>
          : <button type="submit" disabled={!draft.trim()} style={{ ...buttonStyle, opacity: draft.trim() ? 1 : .45 }}>ENVIAR ↗</button>}
      </div>
    </form>
  </aside>
}

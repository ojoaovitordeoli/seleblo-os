import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from '../ui/Markdown'
import '../ui/tema.css'
import './chat.css'

const BASE = '/api/seleblo'
const MAX_ANEXO = 12 * 1024 * 1024
const SUGESTOES = [
  'O que tem no meu cofre sobre automações?',
  'Me ajude a escrever uma copy para WhatsApp',
  'Organize minhas prioridades desta semana',
]

async function api(caminho, opcoes) {
  const resposta = await fetch(`${BASE}${caminho}`, opcoes)
  const dado = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error(dado.error || 'Não consegui concluir isso.')
  return dado
}
const emJson = (metodo, corpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

const paraBase64 = arquivo => new Promise((ok, falha) => {
  const leitor = new FileReader()
  leitor.onload = () => ok(String(leitor.result).split(',')[1] || '')
  leitor.onerror = () => falha(new Error('Não consegui abrir o arquivo.'))
  leitor.readAsDataURL(arquivo)
})

function grupoDaData(iso) {
  const dias = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000)
  if (dias <= 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  if (dias < 8) return 'Últimos 7 dias'
  return 'Mais antigas'
}

const idDoEndereco = () => window.location.hash.match(/^#c=([a-f0-9-]{36})$/)?.[1] || null

function Fontes({ fontes }) {
  if (!fontes?.length) return null
  return (
    <details className="ch-fontes">
      <summary>{fontes.length === 1 ? '1 fonte' : `${fontes.length} fontes`}</summary>
      <ul>
        {fontes.map((fonte, i) => (
          <li key={`${fonte.nome}-${i}`}>
            <span className="ch-fonte-tipo">{{ nota: 'Cofre', web: 'Internet', anexo: 'Anexo' }[fonte.tipo]}</span>
            {fonte.url
              ? <a href={fonte.url} target="_blank" rel="noopener noreferrer">{fonte.nome}</a>
              : <strong>{fonte.nome}</strong>}
            {fonte.trecho && <p>{fonte.trecho}</p>}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Memorias({ aoFechar }) {
  const [lista, setLista] = useState(null)
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => {
    api('/memorias').then(d => setLista(d.memorias)).catch(e => setErro(e.message))
  }, [])
  const adicionar = async evento => {
    evento.preventDefault()
    try {
      setLista((await api('/memorias', emJson('POST', { texto: novo }))).memorias)
      setNovo('')
    } catch (e) { setErro(e.message) }
  }
  const apagar = async id => {
    try { setLista((await api(`/memorias/${id}`, { method: 'DELETE' })).memorias) } catch (e) { setErro(e.message) }
  }
  return (
    <div className="ch-fundo" role="dialog" aria-modal="true" aria-labelledby="ch-mem-titulo" onKeyDown={e => e.key === 'Escape' && aoFechar()}>
      <section className="ch-dialogo">
        <header>
          <h2 id="ch-mem-titulo">O que o RONIN lembra</h2>
          <button type="button" className="ch-icone" onClick={aoFechar} aria-label="Fechar" autoFocus>×</button>
        </header>
        <p className="ch-ajuda">Vale em todas as conversas. Na conversa, é só escrever “lembra que…”.</p>
        {erro && <p className="ch-erro" role="alert">{erro}</p>}
        {lista === null && !erro && <p className="ch-ajuda">Carregando…</p>}
        {lista?.length === 0 && <p className="ch-ajuda">Nada guardado ainda.</p>}
        <ul className="ch-memorias">
          {lista?.map(m => (
            <li key={m.id}>
              <span>{m.texto}</span>
              <button type="button" className="ch-acao" onClick={() => apagar(m.id)}>Apagar</button>
            </li>
          ))}
        </ul>
        <form onSubmit={adicionar} className="ch-mem-form">
          <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Ex.: prefiro respostas curtas" aria-label="Novo fato para lembrar" maxLength={300} />
          <button type="submit" className="ch-primario" disabled={!novo.trim()}>Guardar</button>
        </form>
      </section>
    </div>
  )
}

export default function RoninTela() {
  const [conversas, setConversas] = useState([])
  const [busca, setBusca] = useState('')
  const [atual, setAtual] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [titulo, setTitulo] = useState('')
  const [rascunho, setRascunho] = useState('')
  const [anexos, setAnexos] = useState([])
  const [web, setWeb] = useState(false)
  const [cofre, setCofre] = useState(false)
  const [motor, setMotor] = useState('local')
  const [foco, setFoco] = useState(null)
  const [temOpenai, setTemOpenai] = useState(false)
  const [demo, setDemo] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [status, setStatus] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [parcial, setParcial] = useState('')
  const [fontesParciais, setFontesParciais] = useState([])
  const [erro, setErro] = useState('')
  const [podeRefazer, setPodeRefazer] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  const [verMemorias, setVerMemorias] = useState(false)
  const [editando, setEditando] = useState(null)
  const [textoEdicao, setTextoEdicao] = useState('')
  const [apagando, setApagando] = useState(null)
  const [renomeando, setRenomeando] = useState(false)
  const [copiado, setCopiado] = useState(null)
  const [modeloOk, setModeloOk] = useState(null)
  const [arrastando, setArrastando] = useState(false)

  const controle = useRef(null)
  const lista = useRef(null)
  const colado = useRef(true)
  const entrada = useRef(null)
  const seletor = useRef(null)

  const recarregarLista = useCallback(async q => {
    try { setConversas((await api(`/conversas${q ? `?q=${encodeURIComponent(q)}` : ''}`)).conversas) } catch { /* a lista volta na próxima ação */ }
  }, [])

  const abrir = useCallback(async id => {
    setErro('')
    setEditando(null)
    setRenomeando(false)
    setGaveta(false)
    if (!id) {
      setAtual(null); setMensagens([]); setTitulo('')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      return
    }
    try {
      const conversa = await api(`/conversas/${id}`)
      setAtual(conversa.id); setMensagens(conversa.mensagens); setTitulo(conversa.titulo)
      window.history.replaceState(null, '', `#c=${conversa.id}`)
      colado.current = true
    } catch (e) { setErro(e.message) }
  }, [])

  useEffect(() => {
    const inicio = setTimeout(() => {
      void abrir(idDoEndereco())
      void recarregarLista('')
      try {
        // Pergunta que veio do botão "Perguntar ao RONIN" de uma nota.
        const veio = JSON.parse(sessionStorage.getItem('ronin:pergunta') || 'null')
        sessionStorage.removeItem('ronin:pergunta')
        if (veio?.texto) { setRascunho(veio.texto); setFoco(veio.nota?.path || null); entrada.current?.focus() }
      } catch { /* segue sem a pergunta pronta */ }
    }, 0)
    api('/status').then(d => setModeloOk(Boolean(d.available))).catch(() => setModeloOk(false))
    api('/motores').then(d => { setTemOpenai(d.openai); setDemo(Boolean(d.demo)) }).catch(() => setTemOpenai(false))
    return () => clearTimeout(inicio)
  }, [abrir, recarregarLista])

  useEffect(() => {
    const espera = setTimeout(() => void recarregarLista(busca), 250)
    return () => clearTimeout(espera)
  }, [busca, recarregarLista])

  useEffect(() => {
    if (!gerando) return undefined
    const relogio = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(relogio)
  }, [gerando])

  useEffect(() => {
    if (colado.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight
  }, [mensagens, parcial, status, erro])

  const enviar = useCallback(async ({ texto = '', regenerar = false, editar = null, ids = [], comWeb = false, comCofre = false, comFoco = null }) => {
    setErro(''); setParcial(''); setFontesParciais([]); setStatus('Enviando'); setSegundos(0); setGerando(true); setPodeRefazer(false)
    colado.current = true
    const ctrl = new AbortController()
    controle.current = ctrl
    let conversaId = atual
    try {
      const resposta = await fetch(`${BASE}/conversas/enviar`, {
        ...emJson('POST', { conversa: atual, texto, regenerar, editar, anexos: ids, web: comWeb, cofre: comCofre, motor, foco: comFoco }),
        signal: ctrl.signal,
      })
      if (!resposta.ok) throw new Error((await resposta.json().catch(() => ({}))).error || 'Não consegui enviar.')
      const decodificador = new TextDecoder()
      const leitor = resposta.body.getReader()
      let resto = ''
      const tratar = evento => {
        if (evento.tipo === 'inicio') {
          conversaId = evento.conversa
          setAtual(evento.conversa); setTitulo(evento.titulo); setMensagens(evento.mensagens)
          window.history.replaceState(null, '', `#c=${evento.conversa}`)
          void recarregarLista('')
        } else if (evento.tipo === 'status') setStatus(evento.texto)
        else if (evento.tipo === 'fontes') setFontesParciais(evento.fontes)
        else if (evento.tipo === 'token') { setStatus(''); setParcial(p => p + evento.texto) } else if (evento.tipo === 'fim') { setMensagens(m => [...m, evento.mensagem]); setParcial('') } else if (evento.tipo === 'erro' && !evento.interrompida) { setErro(evento.erro); setPodeRefazer(true) }
      }
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        resto += decodificador.decode(value, { stream: true })
        const linhas = resto.split('\n')
        resto = linhas.pop()
        linhas.filter(Boolean).forEach(l => tratar(JSON.parse(l)))
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // O servidor guarda o que já foi escrito; a conversa é relida em seguida.
        await new Promise(r => setTimeout(r, 500))
        if (conversaId) { const c = await api(`/conversas/${conversaId}`).catch(() => null); if (c) setMensagens(c.mensagens) }
        setParcial('')
      } else {
        setErro(e.message === 'Failed to fetch' ? 'Perdi a conexão com o RONIN.' : e.message)
        setPodeRefazer(Boolean(conversaId))
      }
    } finally {
      setGerando(false); setStatus(''); setFontesParciais([])
      controle.current = null
      void recarregarLista('')
      entrada.current?.focus()
    }
  }, [atual, motor, recarregarLista])

  const submeter = () => {
    const texto = rascunho.trim()
    if (!texto || gerando || anexos.some(a => a.enviando)) return
    const ids = anexos.filter(a => a.id).map(a => a.id)
    setRascunho(''); setAnexos([])
    if (entrada.current) entrada.current.style.height = 'auto'
    setFoco(null)
    void enviar({ texto, ids, comWeb: web, comCofre: cofre, comFoco: foco })
  }

  const parar = () => controle.current?.abort()

  const anexar = async arquivos => {
    for (const arquivo of arquivos) {
      const chave = `${arquivo.name}-${arquivo.lastModified}`
      if (arquivo.size > MAX_ANEXO) { setErro(`"${arquivo.name}" passa de 12 MB.`); continue }
      setAnexos(a => [...a, { chave, nome: arquivo.name, enviando: true }])
      try {
        const salvo = await api('/anexos', emJson('POST', { nome: arquivo.name, dados: await paraBase64(arquivo) }))
        setAnexos(a => a.map(item => item.chave === chave ? { ...item, id: salvo.id, enviando: false } : item))
      } catch (e) {
        setAnexos(a => a.filter(item => item.chave !== chave))
        setErro(`${arquivo.name}: ${e.message}`)
      }
    }
  }

  const copiar = async (id, texto) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(id)
      setTimeout(() => setCopiado(c => (c === id ? null : c)), 1500)
    } catch { setErro('Não consegui copiar.') }
  }

  const salvarTitulo = async evento => {
    evento.preventDefault()
    const novo = titulo.trim()
    setRenomeando(false)
    if (!novo || !atual) return
    try { await api(`/conversas/${atual}`, emJson('PATCH', { titulo: novo })); void recarregarLista(busca) } catch (e) { setErro(e.message) }
  }

  const apagar = async id => {
    try {
      await api(`/conversas/${id}`, { method: 'DELETE' })
      setApagando(null)
      if (id === atual) void abrir(null)
      void recarregarLista(busca)
    } catch (e) { setErro(e.message) }
  }

  const grupos = []
  for (const item of conversas) {
    const nome = grupoDaData(item.atualizada)
    if (grupos.at(-1)?.nome !== nome) grupos.push({ nome, itens: [] })
    grupos.at(-1).itens.push(item)
  }
  const ultimaAssistente = mensagens.findLastIndex(m => m.papel === 'assistente')
  const vazio = !mensagens.length && !gerando

  return (
    <div className="ch-app">
      {gaveta && <button type="button" className="ch-veu" aria-label="Fechar lista de conversas" onClick={() => setGaveta(false)} />}
      <aside className={`ch-lateral${gaveta ? ' ch-lateral--aberta' : ''}`} aria-label="Conversas">
        <div className="ch-marca"><img src="/ronin-logo.png" alt="" width="28" height="28" /> RONIN</div>
        <button type="button" className="ch-nova" onClick={() => { void abrir(null); entrada.current?.focus() }}>+ Nova conversa</button>
        <input className="ch-busca" type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nas conversas" aria-label="Buscar nas conversas" />
        <nav className="ch-lista">
          {!conversas.length && <p className="ch-lista-vazia">{busca ? 'Nada encontrado.' : 'Suas conversas aparecem aqui.'}</p>}
          {grupos.map(grupo => (
            <section key={grupo.nome}>
              <h3>{grupo.nome}</h3>
              {grupo.itens.map(item => apagando === item.id
                ? (
                  <div className="ch-confirma" key={item.id} role="alert">
                    <span>Apagar de vez?</span>
                    <button type="button" onClick={() => apagar(item.id)}>Apagar</button>
                    <button type="button" onClick={() => setApagando(null)}>Não</button>
                  </div>
                )
                : (
                  <div className={`ch-item${item.id === atual ? ' ch-item--atual' : ''}`} key={item.id}>
                    <button type="button" className="ch-item-abrir" disabled={gerando} aria-current={item.id === atual ? 'true' : undefined} onClick={() => abrir(item.id)}>{item.titulo}</button>
                    <button type="button" className="ch-item-apagar" disabled={gerando} aria-label={`Apagar ${item.titulo}`} onClick={() => setApagando(item.id)}>×</button>
                  </div>
                ))}
            </section>
          ))}
        </nav>
        <div className="ch-rodape-lateral">
          {!demo && <button type="button" onClick={() => setVerMemorias(true)}>O que o RONIN lembra</button>}
          <a href={window.location.pathname}>Voltar para a ilha</a>
        </div>
      </aside>

      <main
        className={`ch-principal${arrastando ? ' ch-principal--arrastando' : ''}`}
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={e => { if (e.currentTarget === e.target) setArrastando(false) }}
        onDrop={e => { e.preventDefault(); setArrastando(false); if (!demo) void anexar([...e.dataTransfer.files]) }}
      >
        <header className="ch-topo">
          <button type="button" className="ch-icone ch-menu" aria-label="Abrir lista de conversas" onClick={() => setGaveta(true)}>☰</button>
          {renomeando
            ? <form onSubmit={salvarTitulo} className="ch-renomear"><input autoFocus value={titulo} maxLength={80} aria-label="Título da conversa" onChange={e => setTitulo(e.target.value)} onBlur={salvarTitulo} /></form>
            : <button type="button" className="ch-titulo" disabled={!atual} title={atual ? 'Clique para renomear' : undefined} onClick={() => setRenomeando(true)}>{titulo || 'Nova conversa'}</button>}
          {temOpenai
            ? (
              <div className="ch-motor" role="group" aria-label="Qual IA responde">
                <button type="button" aria-pressed={motor === 'local'} disabled={gerando} onClick={() => setMotor('local')}>IA local</button>
                <button type="button" aria-pressed={motor === 'openai'} disabled={gerando} onClick={() => setMotor('openai')}>OpenAI</button>
              </div>
            )
            : <span className={`ch-modelo${modeloOk === false ? ' ch-modelo--off' : ''}`}>{modeloOk === false ? 'Ollama desligado' : 'IA local'}</span>}
        </header>

        <div className="ch-rolagem" ref={lista} onScroll={e => { const a = e.currentTarget; colado.current = a.scrollHeight - a.scrollTop - a.clientHeight < 80 }}>
          <div className="ch-coluna" aria-live="polite">
            {vazio && (
              <div className="ch-vazio">
                <h1>No que posso ajudar?</h1>
                <div className="ch-sugestoes">
                  {SUGESTOES.map(s => <button type="button" key={s} onClick={() => { setRascunho(s); entrada.current?.focus() }}>{s}</button>)}
                </div>
              </div>
            )}
            {mensagens.map((m, i) => m.papel === 'usuario'
              ? (
                <article className="ch-msg-usuario" key={m.id}>
                  {editando === m.id
                    ? (
                      <div className="ch-edicao">
                        <textarea value={textoEdicao} autoFocus aria-label="Editar mensagem" onChange={e => setTextoEdicao(e.target.value)} />
                        <div>
                          <button type="button" className="ch-acao" onClick={() => setEditando(null)}>Cancelar</button>
                          <button type="button" className="ch-primario" disabled={!textoEdicao.trim()} onClick={() => { setEditando(null); void enviar({ texto: textoEdicao.trim(), editar: m.id }) }}>Enviar</button>
                        </div>
                      </div>
                    )
                    : (
                      <>
                        {m.anexos?.length > 0 && <div className="ch-anexos-msg">{m.anexos.map(a => <span key={a.id}>{a.nome}</span>)}</div>}
                        <div className="ch-balao">{m.texto}</div>
                        {!gerando && <div className="ch-acoes"><button type="button" className="ch-acao" onClick={() => { setEditando(m.id); setTextoEdicao(m.texto) }}>Editar</button><button type="button" className="ch-acao" onClick={() => copiar(m.id, m.texto)}>{copiado === m.id ? 'Copiado' : 'Copiar'}</button></div>}
                      </>
                    )}
                </article>
              )
              : (
                <article className="ch-msg-ronin" key={m.id}>
                  <Markdown texto={m.texto} />
                  {m.interrompida && <p className="ch-aviso">Resposta interrompida.</p>}
                  {m.avisos?.map(a => <p className="ch-aviso" key={a}>{a}</p>)}
                  <Fontes fontes={m.fontes} />
                  {!(gerando && i === ultimaAssistente) && (
                    <div className="ch-acoes">
                      <button type="button" className="ch-acao" onClick={() => copiar(m.id, m.texto)}>{copiado === m.id ? 'Copiado' : 'Copiar'}</button>
                      {i === ultimaAssistente && !gerando && <button type="button" className="ch-acao" onClick={() => enviar({ regenerar: true })}>Refazer</button>}
                      {m.motor === 'openai' && <span className="ch-via">via OpenAI</span>}
                    </div>
                  )}
                </article>
              ))}
            {gerando && (
              <article className="ch-msg-ronin">
                {parcial && <Markdown texto={parcial} />}
                {status && <p className="ch-status"><span className="ch-ponto" aria-hidden="true" />{status}… {segundos}s</p>}
                <Fontes fontes={fontesParciais} />
              </article>
            )}
            {erro && (
              <div className="ch-erro" role="alert">
                {erro}
                {podeRefazer && !gerando && <button type="button" className="ch-acao" onClick={() => enviar({ regenerar: true })}>Tentar de novo</button>}
              </div>
            )}
          </div>
        </div>

        <footer className="ch-rodape">
          <div className="ch-composer">
            {(anexos.length > 0 || foco) && (
              <div className="ch-anexos">
                {foco && <span>Sobre a nota: {foco.split('/').pop()}<button type="button" aria-label="Não usar esta nota" onClick={() => setFoco(null)}>×</button></span>}
                {anexos.map(a => (
                  <span key={a.chave}>{a.nome}{a.enviando ? ' · lendo…' : ''}
                    {!a.enviando && <button type="button" aria-label={`Remover ${a.nome}`} onClick={() => setAnexos(l => l.filter(x => x.chave !== a.chave))}>×</button>}
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={entrada}
              rows={1}
              value={rascunho}
              maxLength={20000}
              placeholder="Pergunte qualquer coisa ao RONIN"
              aria-label="Mensagem para o RONIN"
              onChange={e => {
                setRascunho(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submeter() }
                if (e.key === 'Escape' && gerando) parar()
              }}
            />
            <div className="ch-ferramentas">
              <input ref={seletor} type="file" hidden multiple accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv" onChange={e => { void anexar([...e.target.files]); e.target.value = '' }} />
              {!demo && (
                <>
              <button type="button" className="ch-ferramenta" onClick={() => seletor.current?.click()}>Anexar</button>
              <button type="button" className={`ch-ferramenta${web ? ' ch-ferramenta--ativa' : ''}`} aria-pressed={web} onClick={() => setWeb(v => !v)}>Buscar na web</button>
              <button type="button" className={`ch-ferramenta${cofre ? ' ch-ferramenta--ativa' : ''}`} aria-pressed={cofre} title="O RONIN já consulta o cofre quando você fala dele. Ligue para obrigar." onClick={() => setCofre(v => !v)}>Usar o cofre</button>
                </>
              )}
              <span className="ch-espaco" />
              {gerando
                ? <button type="button" className="ch-enviar ch-enviar--parar" onClick={parar}>Parar</button>
                : <button type="button" className="ch-enviar" disabled={!rascunho.trim() || anexos.some(a => a.enviando)} onClick={submeter}>Enviar</button>}
            </div>
          </div>
          {demo && <p className="ch-nota ch-nota--nuvem">Demonstração: aqui o RONIN só conversa e não acessa dados de ninguém.</p>}
          {!demo && motor === 'openai'
            ? <p className="ch-nota ch-nota--nuvem">Modo OpenAI: o que for usado nesta resposta sai do seu PC e tem custo. Evite dados de clientes.</p>
            : !demo && <p className="ch-nota">O RONIN roda no seu PC e pode errar. Confira o que for importante.</p>}
        </footer>
      </main>
      {verMemorias && <Memorias aoFechar={() => setVerMemorias(false)} />}
    </div>
  )
}

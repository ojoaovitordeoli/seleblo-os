import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KNOWLEDGE_CATEGORIES } from '../knowledgeCategories'
import Markdown from '../ui/Markdown'
import { perguntarAoRonin } from '../pixel/roninEventos'
import '../ui/tema.css'

// SELEBLO V4 - experiência de setores + biblioteca real do cofre Obsidian.
// A leitura continua pela API local /api/seleblo configurada na V3.
const kinds = {
  video:['YouTube','▶','#FF7485'], instagram:['Instagram','◎','#FF92D0'], github:['GitHub','⌘','#D1E4F1'],
  roteiro:['Roteiro','✎','#83CFFF'], copy:['Copy','✦','#FFD18E'], analise:['Análise IA','✧','#C5A8FF'], nota:['Nota','▤','#84DEC9'],
  skill:['Skill','⬡','#A59BFF'], reference:['Referência','↗','#83CFFF'], project:['Projeto','⌘','#51E6AC'],
  idea:['Ideia','✦','#FFD18E'], document:['Documento','▤','#84DEC9']
}
const clean = name => (name||'').replace(/\.md$/i,'').replace(/ - IA-[a-f\d]+$/i,'')
const trecho = text => (text||'').replace(/\[![^\]]*\][-+]?/g,'').replace(/[#>*`_]/g,'').replace(/\s+/g,' ').trim()
const date = ms => ms ? new Date(ms).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''
const safeUrl = value => {try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}}
const count = (folder, notes) => notes.filter(n=>n.path.startsWith(folder+'/')).length

export default function KnowledgePanel({command,onFocusFolder,onResetView}) {
  const [open,setOpen]=useState(false)
  const [view,setView]=useState('universe')
  const [folder,setFolder]=useState(null)
  const [notes,setNotes]=useState([])
  const [indexStatus,setIndexStatus]=useState(null)
  const [selectedIndex,setSelectedIndex]=useState(null)
  const [error,setError]=useState('')
  const [lastUpdate,setLastUpdate]=useState(null)
  const [loading,setLoading]=useState(false)
  const [search,setSearch]=useState('')
  const [kind,setKind]=useState('Todos')
  const [selectedPath,setSelectedPath]=useState(null)
  const [content,setContent]=useState('')
  const [captureUrl,setCaptureUrl]=useState('')
  const [captureTitle,setCaptureTitle]=useState('')
  const [captureText,setCaptureText]=useState('')
  const [captureJobs,setCaptureJobs]=useState([])
  const [captureError,setCaptureError]=useState('')
  const [captureBusy,setCaptureBusy]=useState(false)
  const [watchedFolders,setWatchedFolders]=useState([])
  const [folderSyncStatus,setFolderSyncStatus]=useState(null)
  const [folderSyncError,setFolderSyncError]=useState('')
  const [clipToken,setClipToken]=useState('')
  const [bookmarklet,setBookmarklet]=useState('')
  const [bookmarkletMessage,setBookmarkletMessage]=useState('')
  const folderInput=useRef(null)
  const running=useRef(false)

  const refresh=useCallback(async(show=false)=>{
    if(running.current)return
    running.current=true
    if(show)setLoading(true)
    try {
      const response=await fetch('/api/seleblo/library',{cache:'no-store'})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Não foi possível consultar o cofre')
      setNotes(data.notes||[])
      setError('')
      setLastUpdate(Date.now())
      try {
        const indexResponse=await fetch('/api/seleblo/index',{cache:'no-store'})
        const indexData=await indexResponse.json()
        if(indexResponse.ok)setIndexStatus(indexData)
        else setIndexStatus({status:'error',error:indexData.error||'Índice indisponível',indexed:0,analyzed:0,pending:0,errors:0})
      } catch(indexError) {
        setIndexStatus({status:'error',error:indexError.message||'Índice indisponível',indexed:0,analyzed:0,pending:0,errors:0})
      }
    }catch(e){setError(e.message)}
    finally{running.current=false;if(show)setLoading(false)}
  },[])

  useEffect(()=>{
    if(!open)return
    refresh(true)
    const timer=setInterval(()=>refresh(),5000)
    const onFocus=()=>refresh()
    window.addEventListener('focus',onFocus)
    return ()=>{clearInterval(timer);window.removeEventListener('focus',onFocus)}
  },[open,refresh])

  useEffect(()=>{
    if(!open||view!=='capture')return undefined
    let active=true
    const loadCaptureTools=async()=>{
      try{
        const [foldersResponse,configResponse]=await Promise.all([
          fetch('/api/seleblo/folder-sync',{cache:'no-store'}),
          fetch('/api/seleblo/clip/config',{cache:'no-store'}),
        ])
        const foldersData=await foldersResponse.json()
        const configData=await configResponse.json()
        if(!active)return
        if(!foldersResponse.ok)throw Error(foldersData.error||'Não foi possível consultar as pastas.')
        if(!configResponse.ok)throw Error(configData.error||'Não foi possível preparar o clipper.')
        setFolderSyncStatus(foldersData)
        setWatchedFolders(foldersData.folders||[])
        setClipToken(configData.token||'')
        setFolderSyncError('')
      }catch(loadError){
        if(active)setFolderSyncError(loadError.message)
      }
    }
    void loadCaptureTools()
    const timer=setInterval(loadCaptureTools,5000)
    return()=>{active=false;clearInterval(timer)}
  },[open,view])

  useEffect(()=>{
    const receiveBrowserCapture=async event=>{
      const data=event.data
      if(data?.type!=='seleblo-page-capture'||typeof data.nonce!=='string'||typeof data.url!=='string'||typeof data.text!=='string')return
      let source
      try{source=new URL(data.url)}catch{return}
      if(!['http:','https:'].includes(source.protocol)||source.origin!==event.origin||data.text.length>25000)return
      const acknowledge=(ok,error='')=>{
        event.source?.postMessage({type:'seleblo-page-capture-result',nonce:data.nonce,ok,error},event.origin)
      }
      const sections=[]
      if(typeof data.selection==='string'&&data.selection.trim())sections.push(`## Trecho selecionado\n\n${data.selection.slice(0,10000)}`)
      if(data.text.trim())sections.push(`## Texto disponível na página\n\n${data.text}`)
      if(typeof data.notes==='string'&&data.notes.trim())sections.push(`## Anotações pessoais\n\n${data.notes.slice(0,10000)}`)
      if(!sections.length){acknowledge(false,'A página não forneceu texto nem anotações.');return}
      try{
        const response=await fetch('/api/seleblo/clip/inbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          token:data.token,
          title:typeof data.title==='string'?data.title.slice(0,200):'Página capturada',
          url:source.href,
          text:data.text.slice(0,25000),
          selection:typeof data.selection==='string'?data.selection.slice(0,10000):'',
          notes:typeof data.notes==='string'?data.notes.slice(0,10000):'',
          course:typeof data.course==='string'?data.course.slice(0,300):'',
          module:typeof data.module==='string'?data.module.slice(0,300):'',
          lesson:typeof data.lesson==='string'?data.lesson.slice(0,300):'',
        })})
        const result=await response.json()
        if(!response.ok)throw Error(result.error||'Não foi possível salvar a página.')
        setCaptureJobs(previous=>[{...result,status:'received',title:typeof data.title==='string'?data.title:'Página capturada'},...previous.filter(job=>job.id!==result.id)].slice(0,12))
        setOpen(true)
        setView('capture')
        acknowledge(true)
      }catch(captureFailure){acknowledge(false,captureFailure.message)}
    }
    window.addEventListener('message',receiveBrowserCapture)
    return()=>window.removeEventListener('message',receiveBrowserCapture)
  },[])

  useEffect(()=>{
    if(!open || !selectedPath){setSelectedIndex(null);return undefined}
    let active=true
    const load=async()=>{
      try{
        const response=await fetch(`/api/seleblo/index/document?path=${encodeURIComponent(selectedPath)}`,{cache:'no-store'})
        const data=await response.json()
        if(active)setSelectedIndex(response.ok?data:{error:data.error||'Metadados ainda não disponíveis'})
      }catch(loadError){
        if(active)setSelectedIndex({error:loadError.message})
      }
    }
    void load()
    const timer=setInterval(load,5000)
    return ()=>{active=false;clearInterval(timer)}
  },[open,selectedPath])

  useEffect(()=>{
    const abrir=event=>{const path=event.detail?.path;if(!path)return;setOpen(true);setView('library');setFolder(null);setSearch('');setSelectedPath(path)}
    window.addEventListener('seleblo:abrir-nota',abrir)
    return()=>window.removeEventListener('seleblo:abrir-nota',abrir)
  },[])

  useEffect(()=>{
    if(!command?.folder)return
    setFolder(command.folder);setView('library');setSearch('');setKind('Todos');setSelectedPath(null);setOpen(true)
  },[command])

  useEffect(()=>{
    if(folderInput.current){
      folderInput.current.setAttribute('webkitdirectory','')
      folderInput.current.setAttribute('directory','')
    }
  },[])

  const captureIds=captureJobs.map(job=>job.id).join(',')
  useEffect(()=>{
    if(!open||view!=='capture'||!captureIds)return undefined
    let active=true
    const poll=async()=>{
      const updates=await Promise.all(captureIds.split(',').filter(Boolean).map(async id=>{
        try{
          const response=await fetch(`/api/seleblo/capture/status?id=${encodeURIComponent(id)}`,{cache:'no-store'})
          const data=await response.json()
          return response.ok?data:null
        }catch{return null}
      }))
      if(!active)return
      let completed=false
      setCaptureJobs(previous=>previous.map(job=>{
        const update=updates.find(item=>item?.id===job.id)
        if(!update)return job
        if(update.status==='completed'&&job.status!=='completed')completed=true
        return {...job,...update}
      }))
      if(completed)void refresh()
    }
    const timer=setInterval(()=>void poll(),1800)
    void poll()
    return()=>{active=false;clearInterval(timer)}
  },[captureIds,open,view,refresh])

  useEffect(()=>{
    if(!open||view!=='capture'||!clipToken)return undefined
    let active=true
    const pollClipInbox=async()=>{
      try{
        const response=await fetch(`/api/seleblo/clip/inbox?token=${encodeURIComponent(clipToken)}`,{cache:'no-store'})
        const data=await response.json()
        if(!response.ok)throw Error(data.error||'Não foi possível consultar capturas do navegador.')
        const known=new Set(captureJobs.map(job=>job.id))
        const updates=await Promise.all((data.ids||[]).filter(id=>!known.has(id)).map(async id=>{
          try{
            const statusResponse=await fetch(`/api/seleblo/capture/status?id=${encodeURIComponent(id)}`,{cache:'no-store'})
            return statusResponse.ok?await statusResponse.json():null
          }catch{return null}
        }))
        if(active){
          const received=updates.filter(Boolean)
          if(received.length){
            setCaptureJobs(previous=>[...received.filter(job=>!previous.some(item=>item.id===job.id)),...previous].slice(0,12))
            if(received.some(job=>job.status==='completed'))void refresh()
          }
        }
      }catch(pollError){
        if(active)setBookmarkletMessage(pollError.message)
      }
    }
    void pollClipInbox()
    const timer=setInterval(pollClipInbox,3000)
    return()=>{active=false;clearInterval(timer)}
  },[open,view,clipToken,captureJobs,refresh])

  const chosen=notes.find(n=>n.path===selectedPath)
  useEffect(()=>{
    if(!selectedPath)return
    const controller=new AbortController()
    setContent('Carregando nota...')
    fetch(`/api/seleblo/note?path=${encodeURIComponent(selectedPath)}`,{signal:controller.signal,cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na leitura');setContent(d.content||'')})
      .catch(e=>{if(e.name!=='AbortError')setContent('Erro: '+e.message)})
    return ()=>controller.abort()
  },[selectedPath,chosen?.updatedAt])

  const current=KNOWLEDGE_CATEGORIES.find(category=>category.id===folder)
  const filtered=useMemo(()=>notes.filter(n=>{
    if(folder && !n.path.startsWith(folder+'/'))return false
    if(kind!=='Todos' && n.kind!==kind)return false
    const q=search.toLocaleLowerCase('pt-BR').trim()
    return !q||`${n.name} ${n.folder} ${n.excerpt} ${n.source}`.toLocaleLowerCase('pt-BR').includes(q)
  }).sort((a,b)=>b.updatedAt-a.updatedAt),[notes,folder,kind,search])

  function enter(folderName){
    setFolder(folderName);setView('library');setKind('Todos');setSelectedPath(null);setSearch('')
    onFocusFolder?.(folderName)
  }
  function overview(){
    setFolder(null);setView('universe');setSelectedPath(null);setSearch('');setKind('Todos')
    onResetView?.()
  }
  function globalSearch(value){
    setSearch(value);setSelectedPath(null)
    if(value.trim()){setFolder(null);setView('library');setKind('Todos')}
  }
  const source=chosen?safeUrl(chosen.source):null
  const originalPath=chosen?.source.match(/^Arquivo local: ((?:[A-Za-z]:[\\/]|\\\\).+)$/)?.[1]||''

  async function submitCapture(payload){
    setCaptureError('')
    setCaptureBusy(true)
    try{
      const response=await fetch('/api/seleblo/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Não foi possível receber o material.')
      setCaptureJobs(previous=>[data,...previous.filter(job=>job.id!==data.id)].slice(0,12))
      if(payload.url)setCaptureUrl('')
      if(payload.text){setCaptureTitle('');setCaptureText('')}
    }catch(captureFailure){
      setCaptureError(captureFailure.message)
    }finally{
      setCaptureBusy(false)
    }
  }

  async function openOriginalFile(){
    try{
      const response=await fetch('/api/seleblo/folder-sync/open-original',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:originalPath})})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Não foi possível abrir o original.')
      setFolderSyncError('')
    }catch(openError){setFolderSyncError(openError.message)}
  }

  async function uploadFiles(fileList,folderOnly=false){
    const selected=[...fileList]
    if(!selected.length)return
    setCaptureError('')
    const files=selected.map(file=>({file,relativePath:file.webkitRelativePath||file.name}))
    if(folderOnly&&files.some(item=>!item.file.name.toLowerCase().endsWith('.md'))){
      setCaptureError('Pastas de skills aceitam somente arquivos Markdown.')
      return
    }
    const total=files.reduce((sum,item)=>sum+item.file.size,0)
    if(total>5*1024*1024){
      setCaptureError('Os arquivos selecionados excedem o limite total de 5 MiB.')
      return
    }
    setCaptureBusy(true)
    try{
      const encoded=[]
      for(const item of files){
        if(!['.md','.txt','.pdf','.png','.jpg','.jpeg','.webp','.gif'].includes(item.file.name.slice(item.file.name.lastIndexOf('.')).toLowerCase())){
          throw Error(`Tipo de arquivo não permitido: ${item.file.name}`)
        }
        if(files.some(file=>/\.(?:png|jpe?g|webp|gif)$/i.test(file.file.name))&&files.length!==1){
          throw Error('Envie uma captura de tela ou imagem por vez.')
        }
        const bytes=new Uint8Array(await item.file.arrayBuffer())
        let binary=''
        for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000))
        encoded.push({name:item.file.name,relativePath:item.relativePath,content:btoa(binary)})
      }

      await submitCapture({files:encoded})
    }catch(uploadFailure){
      setCaptureError(uploadFailure.message)
      setCaptureBusy(false)
    }
  }

  async function selectWatchedFolder(){
    setFolderSyncError('')
    try{
      const response=await fetch('/api/seleblo/folder-sync/select',{method:'POST'})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Não foi possível selecionar a pasta.')
      if(data.cancelled)return
      setWatchedFolders(data.folders||[])
      const statusResponse=await fetch('/api/seleblo/folder-sync',{cache:'no-store'})
      if(statusResponse.ok)setFolderSyncStatus(await statusResponse.json())
    }catch(folderError){setFolderSyncError(folderError.message)}
  }

  async function removeWatchedFolder(folderPath){
    setFolderSyncError('')
    try{
      const response=await fetch('/api/seleblo/folder-sync/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:folderPath})})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Não foi possível remover a pasta.')
      setWatchedFolders(data.folders||[])
    }catch(folderError){setFolderSyncError(folderError.message)}
  }

  async function syncWatchedFolders(){
    try{
      const response=await fetch('/api/seleblo/folder-sync/sync',{method:'POST'})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Não foi possível iniciar a sincronização.')
      setFolderSyncStatus(data)
    }catch(folderError){setFolderSyncError(folderError.message)}
  }

  async function prepareBookmarklet(){
    setBookmarkletMessage('')
    if(!clipToken){setBookmarkletMessage('A chave local do clipper ainda está carregando.');return}
    const appOrigin=window.location.origin
    const appUrl=`${appOrigin}/?seleblo-capture=1`
    const code=`javascript:(()=>{if(!/^https?:$/.test(location.protocol)){alert("Use somente uma página HTTP ou HTTPS.");return}const target=window.open(${JSON.stringify(appUrl)},"_blank");if(!target){alert("Permita a abertura do SELEBLO para concluir a captura.");return}const parts=(prompt("Curso | módulo | aula (opcional):")||"").split("|");const notes=prompt("Anotação pessoal (opcional):")||"";const nonce=Date.now().toString(36)+Math.random().toString(36).slice(2);const payload={type:"seleblo-page-capture",nonce,token:${JSON.stringify(clipToken)},title:document.title||"Página capturada",url:location.href,text:(document.body?.innerText||"").slice(0,25000),selection:String(window.getSelection()||"").slice(0,10000),notes,course:parts[0]||"",module:parts[1]||"",lesson:parts[2]||""};let attempts=0;const finish=event=>{if(event.origin!==${JSON.stringify(appOrigin)}||event.data?.type!=="seleblo-page-capture-result"||event.data.nonce!==nonce)return;clearInterval(timer);window.removeEventListener("message",finish);alert(event.data.ok?"Página enviada ao SELEBLO.":"Falha ao capturar: "+(event.data.error||"erro local"))};window.addEventListener("message",finish);const timer=setInterval(()=>{if(target.closed){clearInterval(timer);window.removeEventListener("message",finish);return}target.postMessage(payload,${JSON.stringify(appOrigin)});if(++attempts>=30){clearInterval(timer);window.removeEventListener("message",finish);alert("A página do SELEBLO não respondeu. Confirme a URL HTTPS privada do Tailscale.")}},500)})()`
    setBookmarklet(code)
    try{
      await navigator.clipboard.writeText(code)
      setBookmarkletMessage('Bookmarklet copiado. Crie um favorito no navegador e cole o conteúdo no campo URL/endereço.')
    }catch{
      setBookmarkletMessage('Copie o código exibido e cole no campo URL/endereço de um novo favorito.')
    }
  }

  const vaultName='SEGUNDO SELEBLO'
  const obsidianLink=path=>`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/i,''))}`
  const kindsPresent=[...new Set(notes.filter(n=>!folder||n.path.startsWith(folder+'/')).map(n=>n.kind))].filter(k=>kinds[k])
  const tab=view==='capture'?'guardar':view==='universe'&&!search?'pastas':'recentes'
  const indexMsg=!indexStatus?'':indexStatus.error&&/ollama|fetch failed/i.test(indexStatus.error)
    ?'A IA local (Ollama) está desligada: a busca funciona, os resumos automáticos esperam ela voltar.'
    :indexStatus.pending>0?`O RONIN ainda está lendo ${indexStatus.pending} nota(s) para criar resumos.`
    :indexStatus.errors>0?`${indexStatus.errors} nota(s) não puderam ser resumidas.`:''
  const jobLabel={received:['Recebido','atencao'],processing:['Processando…','atencao'],completed:['Guardado','ok'],error:['Erro','erro']}

  return <>
    <button type="button" className="so-placa" style={{left:16}} aria-pressed={open} aria-expanded={open} onClick={()=>setOpen(x=>!x)}>
      📖 Cofre
    </button>
    {open && <aside className="so-painel" aria-label="Cofre do segundo cérebro" style={{top:132,bottom:16,left:16,width:'min(460px,calc(100vw - 32px))'}}>
      <header className="so-topo">
        <div>
          <h2>{selectedPath?'Nota':current?current.title:tab==='guardar'?'Guardar no cofre':'Segundo cérebro'}</h2>
          <div className="so-sub">{error?'Cofre indisponível':`${notes.length} notas${lastUpdate?` · atualizado às ${new Date(lastUpdate).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:''}`}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button type="button" className="so-btn so-btn--icone" onClick={()=>refresh(true)} title="Atualizar agora" aria-label="Atualizar agora">{loading?'…':'↻'}</button>
          <button type="button" className="so-btn so-btn--icone" onClick={()=>setOpen(false)} title="Fechar" aria-label="Fechar o cofre">✕</button>
        </div>
      </header>
      {!selectedPath && <nav className="so-abas" role="tablist" aria-label="Seções do cofre">
        <button type="button" role="tab" className="so-aba" aria-selected={tab==='pastas'} onClick={overview}>Pastas</button>
        <button type="button" role="tab" className="so-aba" aria-selected={tab==='recentes'} onClick={()=>{setView('library');setFolder(null);setSelectedPath(null);onResetView?.()}}>Recentes</button>
        <button type="button" role="tab" className="so-aba" aria-selected={tab==='guardar'} onClick={()=>{setView('capture');setFolder(null);setSelectedPath(null);setSearch('')}}>Guardar</button>
      </nav>}
      <main className="so-corpo">
        {error && <div className="so-aviso so-aviso--erro" role="alert" style={{marginBottom:12}}>Não consegui ler o cofre: {error}</div>}
        {!selectedPath && view!=='capture' && <>
          <input className="so-campo" type="search" value={search} onChange={e=>globalSearch(e.target.value)} placeholder="Buscar em todo o cofre…" aria-label="Buscar no cofre" style={{marginBottom:12}}/>
          {indexMsg && <div className="so-aviso so-aviso--atencao" style={{marginBottom:12}}>{indexMsg}</div>}
        </>}

        {selectedPath ? <>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
            <button type="button" className="so-btn so-btn--leve" onClick={()=>setSelectedPath(null)}>← Voltar</button>
            {chosen && <a className="so-btn" href={obsidianLink(chosen.path)}>Abrir no Obsidian</a>}
            {source && <a className="so-btn" href={source} target="_blank" rel="noopener noreferrer">Ver fonte ↗</a>}
            {chosen && <button type="button" className="so-btn so-btn--principal" onClick={()=>perguntarAoRonin(`Me explique a nota "${clean(chosen.name)}" e como posso usar isso no meu negócio.`,{path:chosen.path,pasta:chosen.path.split('/')[0]})}>Perguntar ao RONIN</button>}
          </div>
          {chosen ? <>
            {chosen.youtubeId && <img src={`https://i.ytimg.com/vi/${chosen.youtubeId}/hqdefault.jpg`} alt="Miniatura do vídeo" referrerPolicy="no-referrer" style={{width:'100%',maxHeight:200,objectFit:'cover',borderRadius:6,border:'3px solid var(--madeira-escura)',marginBottom:12}}/>}
            <h3 style={{margin:'0 0 6px',font:'600 20px var(--fonte-titulo)',color:'var(--tinta)',lineHeight:1.25,overflowWrap:'anywhere'}}>{clean(chosen.name)}</h3>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
              <span className="so-chip"><i style={{'--cor':(kinds[chosen.kind]||kinds.nota)[2]}}/>{(kinds[chosen.kind]||kinds.nota)[0]}</span>
              <span className="so-chip">{chosen.folder||'Raiz'}</span>
              {chosen.updatedAt>0 && <span className="so-chip">{date(chosen.updatedAt)}</span>}
            </div>
            {originalPath && <button type="button" className="so-btn so-btn--leve" style={{marginBottom:12}} onClick={()=>void openOriginalFile()}>Mostrar arquivo original no Windows</button>}
            {selectedIndex?.document?.analysis?.source==='ollama' && <section className="so-aviso so-aviso--ok" style={{marginBottom:14}}>
              <strong>Resumo do RONIN</strong>
              <p style={{margin:'4px 0 0'}}>{selectedIndex.document.analysis.summary}</p>
              {selectedIndex.document.analysis.keywords?.length>0 && <div style={{marginTop:6,fontSize:12}}>Palavras-chave: {selectedIndex.document.analysis.keywords.join(', ')}</div>}
            </section>}
            {selectedIndex?.relations?.length>0 && <section className="so-secao">
              <h3>Notas relacionadas</h3>
              <div className="so-lista">{selectedIndex.relations.filter((relation,index,all)=>all.findIndex(other=>other.otherPath===relation.otherPath)===index).map((relation,index)=><button type="button" key={`${relation.otherPath}-${index}`} className="so-item" onClick={()=>setSelectedPath(relation.otherPath)}>
                <div style={{minWidth:0}}><div className="so-titulo">{relation.otherTitle}</div>{!/^Refer[eê]ncia registrada/i.test(relation.reason||'') && <div className="so-desc">{relation.reason}</div>}</div><span className="so-seta">›</span>
              </button>)}</div>
            </section>}
            <Markdown texto={content}/>
          </> : <div className="so-vazio">Essa nota foi movida ou apagada no Obsidian.</div>}
        </> : view==='capture' ? <>
          <section className="so-secao">
            <h3>Um link</h3>
            <form onSubmit={event=>{event.preventDefault();void submitCapture({url:captureUrl.trim()})}} style={{display:'flex',gap:8}}>
              <input className="so-campo" type="url" value={captureUrl} onChange={event=>setCaptureUrl(event.target.value)} placeholder="Cole aqui: página, YouTube ou GitHub" aria-label="Link para guardar" required/>
              <button type="submit" className="so-btn so-btn--principal" disabled={captureBusy}>{captureBusy?'…':'Guardar'}</button>
            </form>
          </section>
          <section className="so-secao">
            <h3>Uma ideia ou texto</h3>
            <form onSubmit={event=>{event.preventDefault();void submitCapture({title:captureTitle,text:captureText})}} style={{display:'grid',gap:8}}>
              <input className="so-campo" value={captureTitle} onChange={event=>setCaptureTitle(event.target.value)} maxLength={200} placeholder="Título (opcional)" aria-label="Título"/>
              <textarea className="so-campo" value={captureText} onChange={event=>setCaptureText(event.target.value)} maxLength={120000} rows={4} required placeholder="Escreva ou cole o texto…" aria-label="Texto ou ideia"/>
              <button type="submit" className="so-btn so-btn--principal" style={{justifySelf:'start'}} disabled={captureBusy}>{captureBusy?'Guardando…':'Guardar ideia'}</button>
            </form>
          </section>
          <section className="so-secao">
            <h3>Arquivos</h3>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              <label className="so-btn" style={{cursor:captureBusy?'wait':'pointer'}}>
                PDF, texto ou imagem
                <input type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.gif" multiple disabled={captureBusy} onChange={event=>{void uploadFiles(event.target.files);event.target.value=''}} style={{display:'none'}}/>
              </label>
              <button type="button" className="so-btn" disabled={captureBusy} onClick={()=>folderInput.current?.click()}>Pasta de skill</button>
              <input ref={folderInput} type="file" accept=".md,text/markdown" multiple disabled={captureBusy} onChange={event=>{void uploadFiles(event.target.files,true);event.target.value=''}} style={{display:'none'}}/>
            </div>
            <p style={{fontSize:12,color:'var(--tinta-2)',margin:'8px 0 0'}}>Até 5 MB por envio. Os originais nunca são alterados.</p>
          </section>
          {captureError && <div className="so-aviso so-aviso--erro" role="alert" style={{marginBottom:12}}>{captureError}</div>}
          {captureJobs.length>0 && <section className="so-secao">
            <h3>Últimas capturas</h3>
            <div className="so-lista">{captureJobs.map(job=>{
              const [rotulo,tipo]=jobLabel[job.status]||[job.status,'atencao']
              return <div key={job.id} className={`so-aviso so-aviso--${tipo}`}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong style={{overflowWrap:'anywhere'}}>{job.title||job.source||'Novo material'}</strong><span>{rotulo}</span></div>
                {job.duplicate && <div style={{fontSize:12,marginTop:4}}>Já estava no cofre — reaproveitei o conteúdo.</div>}
                {job.error && <div style={{fontSize:12,marginTop:4}}>{job.error}</div>}
                {job.path && <button type="button" className="so-btn so-btn--leve" style={{marginTop:8}} onClick={()=>{setSelectedPath(job.path);setView('library');setFolder(null)}}>Abrir nota</button>}
              </div>
            })}</div>
          </section>}
          <details className="so-detalhes">
            <summary>Avançado: pastas do PC e favorito do navegador</summary>
            <section className="so-secao" style={{marginTop:8}}>
              <p style={{fontSize:13,color:'var(--tinta-2)',margin:'0 0 8px'}}>Escolha pastas do computador para o cofre copiar sozinho o que entrar nelas (verifica a cada 45 s).</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
                <button type="button" className="so-btn" onClick={()=>void selectWatchedFolder()}>＋ Escolher pasta</button>
                <button type="button" className="so-btn so-btn--leve" onClick={()=>void syncWatchedFolders()}>Sincronizar agora</button>
              </div>
              {watchedFolders.length===0 ? <div style={{fontSize:13,color:'var(--tinta-3)'}}>Nenhuma pasta escolhida.</div> : <div className="so-lista">{watchedFolders.map(folderPath=><div key={folderPath} className="so-item" style={{cursor:'default'}}>
                <span style={{fontSize:12,overflowWrap:'anywhere'}}>{folderPath}</span>
                <button type="button" className="so-btn so-btn--perigo" style={{marginLeft:'auto'}} onClick={()=>void removeWatchedFolder(folderPath)}>Parar</button>
              </div>)}</div>}
              {folderSyncStatus && <div style={{fontSize:12,color:'var(--tinta-2)',marginTop:8}}>{folderSyncStatus.syncing?'Sincronizando…':`Última verificação: ${folderSyncStatus.lastRun?date(folderSyncStatus.lastRun):'ainda não'} · ${folderSyncStatus.indexed||0} arquivo(s) novo(s)`}</div>}
              {folderSyncError && <div className="so-aviso so-aviso--erro" role="alert" style={{marginTop:8}}>{folderSyncError}</div>}
            </section>
            <section className="so-secao">
              <p style={{fontSize:13,color:'var(--tinta-2)',margin:'0 0 8px'}}>Para salvar uma aula ou página que exige login: crie um favorito com o código abaixo e clique nele quando estiver na página.</p>
              <button type="button" className="so-btn" onClick={()=>void prepareBookmarklet()}>Copiar favorito de captura</button>
              {bookmarkletMessage && <div role="status" style={{fontSize:12,color:'var(--tinta-2)',marginTop:6}}>{bookmarkletMessage}</div>}
              {bookmarklet && <textarea className="so-campo" readOnly value={bookmarklet} rows={3} onFocus={event=>event.target.select()} aria-label="Código do favorito" style={{marginTop:8,fontSize:11}}/>}
            </section>
          </details>
        </> : view==='universe' && !search ? <>
          <div className="so-lista">{KNOWLEDGE_CATEGORIES.map(category=>{
            const total=count(category.id,notes)
            return <button type="button" key={category.id} className={`so-item${total?'':' so-item--vazio'}`} onClick={()=>enter(category.id)} title={category.description}>
              <span className="so-bloco-cor" style={{'--cor':category.color}} aria-hidden="true">{category.symbol}</span>
              <span style={{minWidth:0}}><span className="so-titulo" style={{display:'block'}}>{category.title}</span><span className="so-desc" style={{display:'block'}}>{total?category.description:'Vazia — guarde algo aqui'}</span></span>
              <span className="so-contador">{total}</span><span className="so-seta" aria-hidden="true">›</span>
            </button>
          })}</div>
        </> : <>
          {current && <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <button type="button" className="so-btn so-btn--leve" onClick={overview}>← Pastas</button>
            <span className="so-chip"><i style={{'--cor':current.color}}/>{current.description}</span>
          </div>}
          {kindsPresent.length>1 && <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}} role="group" aria-label="Filtrar por tipo">
            {['Todos',...kindsPresent].map(k=><button type="button" key={k} className="so-chip" aria-pressed={kind===k} onClick={()=>setKind(k)}>{k==='Todos'?'Todos':kinds[k][0]}</button>)}
          </div>}
          <div style={{fontSize:12,color:'var(--tinta-3)',marginBottom:8}}>{search?`${filtered.length} resultado(s) para “${search}”`:current?`${filtered.length} nota(s)`:`${filtered.length} nota(s), mais recentes primeiro`}</div>
          {filtered.length ? <div className="so-lista">{filtered.map(note=>{
            const k=kinds[note.kind]||kinds.nota
            return <button type="button" key={note.path} className="so-item" onClick={()=>setSelectedPath(note.path)}>
              <span className="so-bloco-cor" style={{'--cor':k[2],color:'var(--tinta)'}} aria-hidden="true">{k[1]}</span>
              <span style={{minWidth:0}}><span className="so-titulo" style={{display:'block'}}>{clean(note.name)}</span><span className="so-desc" style={{display:'block'}}>{trecho(note.excerpt)||note.folder||'Nota do Obsidian'}</span></span>
              <span style={{marginLeft:'auto',flexShrink:0,fontSize:11,color:'var(--tinta-3)'}}>{date(note.updatedAt).split(' ')[0]}</span>
            </button>
          })}</div> : <div className="so-vazio"><span className="so-icone-grande">📭</span>{search?'Nada encontrado. Tente outra palavra.':'Essa pasta ainda está vazia.'}<div style={{marginTop:10}}><button type="button" className="so-btn so-btn--principal" onClick={()=>{setView('capture');setFolder(null);setSearch('')}}>Guardar algo</button></div></div>}
        </>}
      </main>
    </aside>}
  </>
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KNOWLEDGE_CATEGORIES } from '../knowledgeCategories'

// SELEBLO V4 - experiência de setores + biblioteca real do cofre Obsidian.
// A leitura continua pela API local /api/seleblo configurada na V3.
const BLUE = '#0DEEF3'
const FG = '#ecf7ff'
const MUTED = '#91aac5'
const LINE = 'rgba(120,185,224,.18)'
const MONO = "'DM Mono',monospace"
const UI = "'DM Sans',sans-serif"
const btn = { background:'rgba(10,37,60,.95)',color:FG,border:`1px solid ${LINE}`,borderRadius:9,padding:'8px 11px',cursor:'pointer',fontFamily:UI,fontSize:12 }
const kinds = {
  video:['YouTube','▶','#FF7485'], instagram:['Instagram','◎','#FF92D0'], github:['GitHub','⌘','#D1E4F1'],
  roteiro:['Roteiro','✎','#83CFFF'], copy:['Copy','✦','#FFD18E'], analise:['Análise IA','✧','#C5A8FF'], nota:['Nota','▤','#84DEC9'],
  skill:['Skill','⬡','#A59BFF'], reference:['Referência','↗','#83CFFF'], project:['Projeto','⌘','#51E6AC'],
  idea:['Ideia','✦','#FFD18E'], document:['Documento','▤','#84DEC9']
}
const clean = name => (name||'').replace(/\.md$/i,'').replace(/ - IA-[a-f\d]+$/i,'')
const date = ms => ms ? new Date(ms).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''
const safeUrl = value => {try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}}
const count = (folder, notes) => notes.filter(n=>n.path.startsWith(folder+'/')).length

function NoteCard({ note, onClick, display }) {
  const kind=kinds[note.kind]||kinds.nota
  const list=display==='list'
  return <button onClick={onClick} style={{...btn,padding:0,textAlign:'left',overflow:'hidden',minWidth:0,display:'flex',flexDirection:list?'row':'column',background:'#071d33',borderRadius:14}}>
    <div style={{height:list?94:115,width:list?124:'100%',flexShrink:0,background:`radial-gradient(circle at 70% 15%,${kind[2]}3a,transparent 56%),linear-gradient(145deg,#0c2c46,#061326)`,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}>
      {note.youtubeId ? <img src={`https://i.ytimg.com/vi/${note.youtubeId}/hqdefault.jpg`} loading="lazy" alt="Miniatura do YouTube" referrerPolicy="no-referrer" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span style={{fontSize:36,color:kind[2],textShadow:`0 0 25px ${kind[2]}99`}}>{kind[1]}</span>}
      <span style={{position:'absolute',left:9,bottom:8,borderRadius:5,background:'#031425e8',color:kind[2],font:`9px ${MONO}`,padding:'4px 6px'}}>{kind[0].toUpperCase()}</span>
    </div>
    <div style={{padding:12,width:'100%',minWidth:0}}>
      <div style={{fontSize:12,fontWeight:700,lineHeight:1.45,overflowWrap:'anywhere'}}>{clean(note.name)}</div>
      <p style={{fontSize:10,color:MUTED,marginTop:7,lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',overflowWrap:'anywhere'}}>{note.excerpt||'Abrir conteúdo do Obsidian'}</p>
      <div style={{font:`9px ${MONO}`,color:'#7296b5',marginTop:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{date(note.updatedAt)} · {note.folder||'Raiz'}</div>
    </div>
  </button>
}

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
  const [layout,setLayout]=useState('grid')
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

  return <>
    <button style={{...btn,position:'fixed',top:77,left:20,zIndex:55,font:`10px ${MONO}`,letterSpacing:'.05em',background:'#03192deb',borderColor:'#0deef370',color:BLUE,backdropFilter:'blur(12px)'}} onClick={()=>setOpen(x=>!x)}>
      ◈ {open?'FECHAR SELEBLO OS':'EXPLORAR SEGUNDO CÉREBRO'}
    </button>
    {open && <aside aria-label="Universo de conhecimento SELEBLO OS" style={{position:'fixed',top:119,bottom:16,left:14,zIndex:54,width:'min(700px,calc(100vw - 28px))',display:'flex',flexDirection:'column',overflow:'hidden',background:'rgba(2,13,29,.97)',border:`1px solid ${LINE}`,borderRadius:17,backdropFilter:'blur(24px)',boxShadow:'0 25px 80px #000c',fontFamily:UI,color:FG}}>
      <header style={{flexShrink:0,padding:'17px 18px 14px',borderBottom:`1px solid ${LINE}`}}>
        <div style={{font:`10px ${MONO}`,letterSpacing:'.12em',color:BLUE}}>SELEBLO OS / UNIVERSO INTERATIVO V4</div>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',marginTop:7,flexWrap:'wrap'}}>
          <h1 style={{font:"700 20px 'Syne',sans-serif",margin:0}}>{view==='universe'?'Seu universo de conhecimento':view==='capture'?'Central de captura':current?.[1]||'Biblioteca de conhecimento'}</h1>
          <button style={btn} onClick={()=>refresh(true)}>{loading?'Atualizando...':'↻ Atualizar'}</button>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:9,font:`10px ${MONO}`,color:MUTED}}>
          <span>{notes.length} notas</span><span>16 setores</span>
          <span style={{color:error?'#FF9F9F':'#6CE6BB'}}>● {error?'Conexão indisponível':'Atualização automática · 5s'}</span>
          {lastUpdate && <span>Última: {date(lastUpdate)}</span>}
        </div>
        {indexStatus && <div aria-live="polite" style={{display:'flex',flexWrap:'wrap',gap:9,marginTop:8,font:`9px ${MONO}`,color:indexStatus.error?'#ffb1b1':MUTED}}>
          <span>ÍNDICE {indexStatus.indexed||0}</span>
          <span>ANALISADOS {indexStatus.analyzed||0}</span>
          <span>PENDENTES {indexStatus.pending||0}</span>
          {indexStatus.linksOnly>0 && <span>LINKS SEM ANÁLISE {indexStatus.linksOnly}</span>}
          <span style={{color:indexStatus.status==='ready'&&!indexStatus.errors?'#6CE6BB':indexStatus.error||indexStatus.errors?'#ff9e9e':'#ffd186'}}>● {indexStatus.error||`${indexStatus.status==='initializing'?'Iniciando':indexStatus.status==='indexing'?'Indexando':indexStatus.status==='limited'?'Limite de varredura':'Indexação local'}${indexStatus.errors?` · ${indexStatus.errors} avisos`:''}`}</span>
        </div>}
        <div style={{display:'flex',gap:7,marginTop:13}}>
          <button onClick={overview} style={{...btn,flex:1,background:view==='universe'?'#0a4b62':'transparent',color:view==='universe'?BLUE:MUTED,borderColor:view==='universe'?'#0deef370':LINE}}>◈ Universo 3D</button>
          <button onClick={()=>{setView('library');setFolder(null);setSelectedPath(null)}} style={{...btn,flex:1,background:view==='library'?'#0a4b62':'transparent',color:view==='library'?BLUE:MUTED,borderColor:view==='library'?'#0deef370':LINE}}>▦ Biblioteca</button>
          <button onClick={()=>{setView('capture');setFolder(null);setSelectedPath(null)}} style={{...btn,flex:1,background:view==='capture'?'#0a4b62':'transparent',color:view==='capture'?BLUE:MUTED,borderColor:view==='capture'?'#0deef370':LINE}}>＋ Capturar</button>
        </div>
        {view!=='capture'&&<input value={search} onChange={e=>globalSearch(e.target.value)} placeholder="Buscar vídeos, skills, roteiros, referências..." aria-label="Buscar conhecimento" style={{width:'100%',marginTop:11,padding:'11px 12px',borderRadius:9,outline:'none',border:`1px solid ${LINE}`,background:'#061a2d',fontSize:12,color:FG}}/>}
      </header>
      {error && <div style={{fontSize:11,color:'#ff9e9e',padding:'8px 18px',borderBottom:`1px solid ${LINE}`}}>{error}</div>}
      <main style={{flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden',padding:15}}>
        {selectedPath ? <>
          <div style={{display:'flex',gap:8,justifyContent:'space-between',flexWrap:'wrap',marginBottom:14}}>
            <button onClick={()=>setSelectedPath(null)} style={btn}>← Voltar aos conteúdos</button>
            {source && <a href={source} target="_blank" rel="noopener noreferrer" style={{...btn,textDecoration:'none',color:BLUE}}>Abrir fonte ↗</a>}
          </div>
          {chosen ? <>
            {chosen.youtubeId && <img src={`https://i.ytimg.com/vi/${chosen.youtubeId}/hqdefault.jpg`} alt="Prévia do YouTube" style={{width:'100%',maxHeight:210,objectFit:'cover',borderRadius:12,marginBottom:15}}/>}
            <h2 style={{fontSize:18,marginBottom:7,lineHeight:1.4,overflowWrap:'anywhere'}}>{clean(chosen.name)}</h2>
            <p style={{font:`10px ${MONO}`,color:MUTED,marginBottom:14,overflowWrap:'anywhere'}}>{chosen.path}</p>
            {chosen?.source.startsWith('Arquivo local: ')&&<div style={{marginBottom:14}}>
              <p style={{font:`9px ${MONO}`,color:MUTED,overflowWrap:'anywhere'}}>Original: {chosen.source.slice('Arquivo local: '.length)}</p>
              {originalPath&&<button type="button" onClick={()=>void openOriginalFile()} style={{...btn,color:BLUE}}>Revelar original no Windows ↗</button>}
            </div>}
            {selectedIndex?.document && <section style={{border:`1px solid ${LINE}`,background:'rgba(8,35,56,.7)',borderRadius:10,padding:11,marginBottom:13}}>
              <div style={{font:`9px ${MONO}`,color:BLUE,marginBottom:7}}>MEMÓRIA DERIVADA · {selectedIndex.document.analysisState==='analyzed'?'ANÁLISE LOCAL':selectedIndex.document.analysisState==='skipped_link_only'?'SOMENTE URL':'AGUARDANDO ANÁLISE'}</div>
              {selectedIndex.document.analysis?.source==='ollama' && <>
                <div style={{fontSize:12,fontWeight:700}}>{selectedIndex.document.analysis.descriptiveTitle||clean(chosen.name)}</div>
                <p style={{fontSize:11,lineHeight:1.55,color:FG,margin:'6px 0'}}>{selectedIndex.document.analysis.summary}</p>
                <div style={{fontSize:10,color:MUTED}}>Tipo sugerido: {selectedIndex.document.analysis.type} · Palavras-chave: {selectedIndex.document.analysis.keywords.join(', ')||'—'}</div>
                {selectedIndex.document.analysis.researchNotes.length>0 && <div style={{fontSize:10,color:MUTED,marginTop:5}}>Pistas para pesquisa: {selectedIndex.document.analysis.researchNotes.join(' · ')}</div>}
              </>}
              {selectedIndex.document.analysis?.source==='extracted' && <div style={{fontSize:10,color:MUTED}}>{selectedIndex.document.analysis.summary} {selectedIndex.document.analysis.urls?.join(' · ')}</div>}
              {selectedIndex.error && <div style={{fontSize:10,color:'#ffd186'}}>{selectedIndex.error}</div>}
              {selectedIndex.relations?.length>0 && <div style={{marginTop:9,paddingTop:8,borderTop:`1px solid ${LINE}`}}>
                <div style={{font:`9px ${MONO}`,color:BLUE,marginBottom:5}}>RELAÇÕES ENCONTRADAS · {selectedIndex.relations.length}</div>
                {selectedIndex.relations.map((relation,index)=><button key={`${relation.from}-${relation.to}-${relation.origin}-${index}`} onClick={()=>setSelectedPath(relation.otherPath)} style={{...btn,display:'block',width:'100%',textAlign:'left',marginTop:5,padding:'7px 8px',fontSize:10}}>
                  {relation.otherTitle} · {relation.origin==='explicit'?'referência explícita':'sugestão da IA'}<span style={{display:'block',color:MUTED,fontSize:9,marginTop:3}}>{relation.reason}</span>
                </button>)}
              </div>}
            </section>}
            <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:UI,fontSize:12,lineHeight:1.7,color:'#C6DEEC',userSelect:'text'}}>{content}</pre>
          </> : <p>O arquivo foi movido ou removido no Obsidian.</p>}
        </> : view==='capture' ? <>
          <section style={{maxWidth:560,margin:'0 auto'}}>
            <p style={{fontSize:12,color:MUTED,lineHeight:1.65,marginTop:0}}>Salve ideias, páginas, aulas e prints ou acompanhe pastas escolhidas. A captura e o índice permanecem locais; os originais nunca são movidos ou alterados.</p>
            <form onSubmit={event=>{event.preventDefault();void submitCapture({title:captureTitle,text:captureText})}} style={{display:'grid',gap:8,marginBottom:14}}>
              <input value={captureTitle} onChange={event=>setCaptureTitle(event.target.value)} maxLength={200} placeholder="Título (opcional)" aria-label="Título da ideia" style={{...btn,textAlign:'left',background:'#061a2d'}}/>
              <textarea value={captureText} onChange={event=>setCaptureText(event.target.value)} maxLength={120000} placeholder="Escreva uma ideia ou texto para guardar…" aria-label="Texto ou ideia para capturar" required rows={5} style={{...btn,textAlign:'left',background:'#061a2d',resize:'vertical',lineHeight:1.6}}/>
              <button type="submit" disabled={captureBusy} style={{...btn,justifySelf:'start',color:BLUE,opacity:captureBusy?0.6:1}}>{captureBusy?'Enviando…':'Salvar ideia'}</button>
            </form>
            <form onSubmit={event=>{event.preventDefault();void submitCapture({url:captureUrl.trim()})}} style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              <input type="url" value={captureUrl} onChange={event=>setCaptureUrl(event.target.value)} placeholder="https://… página, YouTube ou GitHub público" aria-label="URL pública para captura" required style={{...btn,flex:'1 1 280px',textAlign:'left',background:'#061a2d'}}/>
              <button type="submit" disabled={captureBusy} style={{...btn,color:BLUE,opacity:captureBusy?0.6:1}}>{captureBusy?'Enviando…':'Capturar URL'}</button>
            </form>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:15}}>
              <label style={{...btn,display:'inline-flex',alignItems:'center',cursor:captureBusy?'wait':'pointer',color:BLUE}}>
                Selecionar PDF / TXT / Markdown / imagem
                <input type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,text/plain,text/markdown,application/pdf,image/png,image/jpeg,image/webp,image/gif" multiple disabled={captureBusy} onChange={event=>{void uploadFiles(event.target.files);event.target.value=''}} style={{display:'none'}}/>
              </label>
              <button type="button" disabled={captureBusy} onClick={()=>folderInput.current?.click()} style={{...btn,color:'#A59BFF'}}>Selecionar pasta de skill (.md)</button>
              <input ref={folderInput} type="file" accept=".md,text/markdown" multiple disabled={captureBusy} onChange={event=>{void uploadFiles(event.target.files,true);event.target.value=''}} style={{display:'none'}}/>
            </div>
            <section style={{border:`1px solid ${LINE}`,background:'rgba(8,35,56,.7)',borderRadius:11,padding:12,marginBottom:13}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <strong style={{fontSize:12,color:BLUE}}>Pastas do computador</strong>
                <div style={{display:'flex',gap:7}}>
                  <button type="button" onClick={()=>void syncWatchedFolders()} style={{...btn,padding:'6px 8px'}}>Sincronizar agora</button>
                  <button type="button" onClick={()=>void selectWatchedFolder()} style={{...btn,padding:'6px 8px',color:BLUE}}>＋ Selecionar pasta</button>
                </div>
              </div>
              <p style={{fontSize:10,color:MUTED,lineHeight:1.6,margin:'8px 0'}}>Somente pastas escolhidas são verificadas automaticamente a cada 45 s. Markdown, texto, PDF, imagens e arquivos comuns de áudio/vídeo; limite de 5 MiB por arquivo. Pastas sensíveis/de sistema e credenciais são ignoradas. Remover uma pasta interrompe a sincronização e mantém originais e capturas já feitas.</p>
              {watchedFolders.length===0&&<div style={{fontSize:10,color:MUTED}}>Nenhuma pasta acompanhada.</div>}
              {watchedFolders.map(folderPath=><div key={folderPath} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,borderTop:`1px solid ${LINE}`,paddingTop:7,marginTop:7}}>
                <span title={folderPath} style={{font:`9px ${MONO}`,overflowWrap:'anywhere',color:FG}}>{folderPath}</span>
                <button type="button" onClick={()=>void removeWatchedFolder(folderPath)} style={{...btn,flexShrink:0,padding:'5px 7px',color:'#FF9F9F'}}>Remover</button>
              </div>)}
              {folderSyncStatus&&<div style={{font:`9px ${MONO}`,color:folderSyncStatus.errors?.length?'#ffb1b1':MUTED,marginTop:8}}>
                {folderSyncStatus.syncing?'Sincronização em andamento':`Última verificação: ${folderSyncStatus.lastRun?date(folderSyncStatus.lastRun):'aguardando'} · ${folderSyncStatus.indexed||0} novos arquivos desde a inicialização`}
                {folderSyncStatus.limited?' · limite por execução/quantidade atingido':''}
                {folderSyncStatus.skipped?` · ${folderSyncStatus.skipped} arquivo(s) acima do limite ignorados`:''}
                {folderSyncStatus.errors?.slice(0,3).map((item,index)=><div key={index}>{item}</div>)}
              </div>}
            </section>
            <section style={{border:`1px solid ${LINE}`,background:'rgba(8,35,56,.7)',borderRadius:11,padding:12,marginBottom:13}}>
              <strong style={{fontSize:12,color:'#A59BFF'}}>Salvar uma página ou aula autenticada</strong>
              <p style={{fontSize:10,color:MUTED,lineHeight:1.6,margin:'7px 0'}}>Acesse a página normalmente e use o favorito SELEBLO no navegador autenticado. Ele envia título, URL, texto visível, seleção e uma anotação opcional; não lê senhas, não tenta contornar restrições e não envia o conteúdo a serviços externos. Para capturar, use o SELEBLO pela URL HTTPS privada do Tailscale.</p>
              <button type="button" onClick={()=>void prepareBookmarklet()} style={{...btn,color:'#A59BFF'}}>Copiar / preparar favorito de captura</button>
              {bookmarkletMessage&&<div role="status" style={{fontSize:10,color:bookmarkletMessage.startsWith('Não foi')?'#ffb1b1':MUTED,marginTop:7}}>{bookmarkletMessage}</div>}
              {bookmarklet&&<textarea readOnly value={bookmarklet} aria-label="Código do favorito de captura" rows={3} onFocus={event=>event.target.select()} style={{...btn,display:'block',width:'100%',boxSizing:'border-box',marginTop:8,textAlign:'left',fontSize:9,resize:'vertical',overflowWrap:'anywhere'}}/>}
            </section>
            {folderSyncError&&<div role="alert" style={{fontSize:11,color:'#ff9e9e',padding:'8px 10px',border:`1px solid #ff9e9e44`,borderRadius:8,marginBottom:12}}>{folderSyncError}</div>}
            {captureError&&<div role="alert" style={{fontSize:11,color:'#ff9e9e',padding:'9px 11px',border:'1px solid #ff9e9e44',borderRadius:9,marginBottom:12}}>{captureError}</div>}
            <div style={{font:`9px ${MONO}`,color:MUTED,lineHeight:1.6,marginBottom:16}}>Limite de 5 MiB por envio · OCR e análise visual locais indisponíveis nesta instalação · PDFs escaneados sem camada de texto e transcrições não acessíveis são informados sem inventar conteúdo · skills são catalogadas como texto e nunca executadas.</div>
            {captureJobs.length>0&&<div style={{display:'grid',gap:8}}>
              {captureJobs.map(job=>{
                const colors={received:'#83CFFF',processing:'#FFD186',completed:'#6CE6BB',error:'#FF9F9F'}
                const labels={received:'RECEBIDO',processing:'INDEXANDO',completed:'CAPTURADO',error:'ERRO'}
                return <article key={job.id} style={{border:`1px solid ${LINE}`,background:'rgba(8,35,56,.7)',borderRadius:10,padding:11}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <strong style={{fontSize:11,overflowWrap:'anywhere'}}>{job.title||job.source||'Novo material'}</strong>
                    <span style={{flexShrink:0,font:`9px ${MONO}`,color:colors[job.status]||MUTED}}>● {labels[job.status]||job.status}</span>
                  </div>
                  {job.kind&&kinds[job.kind]&&<div style={{font:`9px ${MONO}`,color:kinds[job.kind][2],marginTop:5}}>{kinds[job.kind][0]}</div>}
                  {job.duplicate&&<div style={{fontSize:10,color:MUTED,marginTop:5}}>Material duplicado; conteúdo existente reutilizado.</div>}
                  {job.status==='completed'&&job.analysisState&&job.analysisState!=='analyzed'&&job.analysisState!=='skipped_link_only'&&<div style={{fontSize:10,color:'#ffd186',marginTop:5}}>
                    {job.analysisError?`Conteúdo salvo e pesquisável; análise local pendente: ${job.analysisError}`:'Conteúdo salvo; análise local em andamento.'}
                  </div>}
                  {job.error&&<div style={{fontSize:10,color:'#ffb1b1',marginTop:5}}>{job.error}</div>}
                  {job.path&&<button type="button" onClick={()=>{setSelectedPath(job.path);setView('library');setFolder(null)}} style={{...btn,marginTop:8,padding:'6px 9px',fontSize:10,color:BLUE}}>Abrir material e análise ↗</button>}
                </article>
              })}
            </div>}
          </section>
        </> : view==='universe' ? <>
          <p style={{fontSize:12,color:MUTED,lineHeight:1.6,marginBottom:15}}>Explore um setor abaixo ou clique nos hologramas das mesas do escritório 3D. Cada setor abre seus conteúdos reais.</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(225px,1fr))',gap:10}}>
            {KNOWLEDGE_CATEGORIES.map(category=><button key={category.id} onClick={()=>enter(category.id)} style={{...btn,background:`radial-gradient(circle at 95% 5%,${category.color}30,transparent 55%),linear-gradient(145deg,#0a263d,#05182b)`,borderColor:`${category.color}55`,textAlign:'left',minHeight:119,padding:'16px',position:'relative',overflow:'hidden'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><span style={{font:`9px ${MONO}`,color:category.color}}>{category.id.slice(0,2)} / SETOR</span><span style={{fontSize:26,color:category.color}}>{category.symbol}</span></div>
              <div style={{fontWeight:750,fontSize:14,marginTop:4}}>{category.title}</div>
              <div style={{fontSize:10,color:MUTED,marginTop:5,lineHeight:1.5}}>{category.description}</div>
              <div style={{font:`10px ${MONO}`,color:category.color,marginTop:11}}>{count(category.id,notes)} conteúdos <span style={{float:'right'}}>ABRIR ↗</span></div>
            </button>)}
          </div>
        </> : <>
          {current && <div style={{border:`1px solid ${current.color}66`,background:`linear-gradient(120deg,${current.color}20,#061727)`,padding:14,borderRadius:12,marginBottom:12}}>
            <div style={{color:current.color,font:`10px ${MONO}`}}>SETOR {current.id.slice(0,2)}</div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:5}}>
              <div><strong style={{fontSize:16}}>{current.title}</strong><div style={{fontSize:11,color:MUTED,marginTop:4}}>{current.description}</div></div>
              <span style={{fontSize:26,color:current.color}}>{current.symbol}</span>
            </div>
          </div>}
          <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:6,marginBottom:13}}>
            {folder && <button onClick={()=>{setFolder(null);onResetView?.()}} style={{...btn,padding:'6px 9px',color:BLUE}}>← Todas as categorias</button>}
            <span style={{font:`10px ${MONO}`,color:MUTED}}>TIPO</span>
            {['Todos',...Object.keys(kinds)].map(k=><button key={k} onClick={()=>setKind(k)} style={{...btn,padding:'6px 9px',fontSize:10,color:kind===k?BLUE:MUTED,background:kind===k?'#0b364d':'transparent',borderColor:kind===k?'#0deef355':LINE}}>{k==='Todos'?'Todos':kinds[k][0]}</button>)}
            <button onClick={()=>setLayout(layout==='grid'?'list':'grid')} style={{...btn,marginLeft:'auto',color:BLUE}} title="Alternar grade/lista">{layout==='grid'?'☷ Lista':'▦ Cards'}</button>
          </div>
          <div style={{font:`10px ${MONO}`,color:MUTED,marginBottom:10}}>{filtered.length} conteúdos encontrados</div>
          {filtered.length ? <div style={{display:'grid',gridTemplateColumns:layout==='grid'?'repeat(auto-fit,minmax(min(100%,185px),1fr))':'1fr',gap:11}}>
            {filtered.map(note=><NoteCard key={note.path} note={note} display={layout} onClick={()=>setSelectedPath(note.path)}/>)}
          </div> : <div style={{textAlign:'center',padding:'35px 12px',color:MUTED,fontSize:12,lineHeight:1.6}}>Nenhum conteúdo encontrado neste setor. Adicione notas pelo Obsidian e elas aparecerão automaticamente.</div>}
        </>}
      </main>
      <footer style={{flexShrink:0,borderTop:`1px solid ${LINE}`,padding:'9px 14px',font:`9px ${MONO}`,color:MUTED}}>COFRE LOCAL · SOMENTE LEITURA · 16 SETORES INTERATIVOS · ATUALIZAÇÃO AUTOMÁTICA</footer>
    </aside>}
  </>
}

import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import net from 'node:net'
import { pathToFileURL } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const CAPTURE_DIRECTORY = '_SELEBLO Capturas'
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_UPLOAD_FILES = 24
const MAX_DOCUMENT_CHARS = 120_000
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 20_000
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000
const ALLOWED_FILE_EXTENSIONS = new Set(['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif'])
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const PRIVATE_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal'])
const TRACKING_PARAMETERS = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i

function publicIPv4(address) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [a, b, c] = octets
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
    || (a === 203 && b === 0 && c === 113)
  )
}

function publicIPv6(address) {
  const normalized = address.toLowerCase().split('%')[0]
  if (normalized.startsWith('::ffff:')) return false
  if (!/^[23][0-9a-f]{0,3}:/.test(normalized)) return false
  return !normalized.startsWith('2001:db8:')
}

async function assertPublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || PRIVATE_HOSTS.has(host)) throw new Error('A URL aponta para um destino local ou privado.')
  if (net.isIP(host)) {
    if (!(host.includes(':') ? publicIPv6(host) : publicIPv4(host))) throw new Error('A URL aponta para um endereço IP privado ou reservado.')
    return
  }
  const records = await dns.lookup(host, { all: true, verbatim: true })
  if (!records.length || records.some(record => !(record.family === 4 ? publicIPv4(record.address) : publicIPv6(record.address)))) {
    throw new Error('O domínio não resolve exclusivamente para endereços públicos.')
  }
}

function lookupPublic(hostname, options, callback) {
  // Validate the address used by the socket itself to prevent DNS-rebinding SSRF.
  dns.lookup(hostname, { all: true, verbatim: true }).then(records => {
    if (!records.length || records.some(record => !(record.family === 4 ? publicIPv4(record.address) : publicIPv6(record.address)))) {
      throw new Error('O domínio não resolve exclusivamente para endereços públicos.')
    }
    const requestedFamily = typeof options === 'object' ? options.family : 0
    const selected = records.find(record => !requestedFamily || record.family === requestedFamily)
    if (!selected) throw new Error('O domínio não possui um endereço público compatível.')
    if (typeof options === 'object' && options.all) callback(null, records)
    else callback(null, selected.address, selected.family)
  }).catch(error => callback(error))
}

function checkedUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Informe uma URL pública válida.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Somente URLs HTTP/HTTPS públicas sem credenciais são aceitas.')
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('A URL usa uma porta não permitida.')
  url.hash = ''
  return url
}

function canonicalUrl(value) {
  const url = checkedUrl(value)
  url.hostname = url.hostname.toLowerCase()
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url.href
}

function normalizeText(value) {
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length > MAX_DOCUMENT_CHARS) throw new Error(`O material excede o limite de ${MAX_DOCUMENT_CHARS.toLocaleString('pt-BR')} caracteres por captura.`)
  return text
}

function decodeEntities(value) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip);/gi, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…' }
    if (entity[0] !== '#') return named[entity.toLowerCase()] || match
    const number = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
    try {
      return Number.isFinite(number) ? String.fromCodePoint(number) : ''
    } catch {
      return ''
    }
  })
}

function htmlText(html) {
  return normalizeText(decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|svg|noscript|iframe|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<\/(article|section|main|p|h[1-6]|li|tr|blockquote|pre|div)\s*>/gi, '\n')
      .replace(/<br\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|#160);/gi, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n'))
}

function htmlAttribute(tag, name) {
  const expression = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = tag.match(expression)
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}

function htmlMetadata(html, sourceUrl) {
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || ''
  let title = decodeEntities(titleTag.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim()
  let description = ''
  let canonical = ''
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (htmlAttribute(tag, 'property') || htmlAttribute(tag, 'name')).toLowerCase()
    const value = htmlAttribute(tag, 'content')
    if (!title && ['og:title', 'twitter:title'].includes(key)) title = value
    if (!description && ['description', 'og:description', 'twitter:description'].includes(key)) description = value
  }
  const canonicalTag = html.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i)?.[0]
  if (canonicalTag) {
    try {
      canonical = checkedUrl(new URL(htmlAttribute(canonicalTag, 'href'), sourceUrl).href).href
    } catch {
      canonical = ''
    }
  }
  return { title: title.slice(0, 240), description: description.slice(0, 1200), canonical }
}

function requestPublicOnce(url, { method, headers, body, maxBytes }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const requestHeaders = { ...headers }
    if (body !== undefined && !Object.keys(requestHeaders).some(key => key.toLowerCase() === 'content-length')) {
      requestHeaders['Content-Length'] = Buffer.byteLength(body)
    }
    const request = client.request(url, {
      method,
      headers: requestHeaders,
      lookup: lookupPublic,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }, response => {
      const status = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location
        response.resume()
        resolve({ status, location, body: Buffer.alloc(0), contentType: '' })
        return
      }
      const declaredLength = Number(response.headers['content-length'] || 0)
      if (declaredLength > maxBytes) {
        const error = new Error('A origem excede o limite de tamanho permitido.')
        response.destroy(error)
        reject(error)
        return
      }
      const chunks = []
      let total = 0
      response.on('data', chunk => {
        total += chunk.length
        if (total > maxBytes) {
          const error = new Error('A origem excede o limite de tamanho permitido.')
          response.destroy(error)
          request.destroy(error)
          reject(error)
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        status,
        location: '',
        contentType: String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase(),
        body: Buffer.concat(chunks, total),
      }))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end(body)
  })
}

async function fetchPublic(value, {
  accept = 'text/html,application/xhtml+xml,text/plain,application/pdf,application/json',
  maxBytes = MAX_RESPONSE_BYTES,
  method = 'GET',
  body,
  headers = {},
} = {}) {
  let url = checkedUrl(value)
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicHost(url.hostname)
    const response = await requestPublicOnce(url, {
      method,
      maxBytes,
      body,
      headers: { Accept: accept, 'User-Agent': 'SELEBLO-OS/1.0 (public knowledge capture)', ...headers },
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location) throw new Error('A origem retornou um redirecionamento inválido.')
      if (redirects === MAX_REDIRECTS) throw new Error('A origem excedeu o limite de redirecionamentos.')
      url = checkedUrl(new URL(response.location, url).href)
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`A origem respondeu HTTP ${response.status}.`)
    }
    return { url: url.href, contentType: response.contentType, body: response.body }
  }
  throw new Error('Não foi possível acessar a origem pública.')
}

function videoIdFromUrl(value) {
  const url = checkedUrl(value)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (!YOUTUBE_HOSTS.has(host) && host !== 'youtube-nocookie.com') return null
  const id = host === 'youtu.be'
    ? url.pathname.split('/').filter(Boolean)[0]
    : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

function parseYoutubeCaptions(value) {
  try {
    const json = JSON.parse(value)
    const chunks = (json.events || []).flatMap(event => (event.segs || []).map(segment => segment.utf8 || ''))
    return normalizeText(chunks.join(' '))
  } catch {
    const xmlSegments = [...value.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/gi)]
      .map(match => decodeEntities(match[1].replace(/<[^>]*>/g, '')))
    if (xmlSegments.length) return normalizeText(xmlSegments.join(' '))
    return normalizeText(value
      .replace(/^WEBVTT[^\n]*\n/i, '')
      .replace(/^\d+\s*$/gm, '')
      .replace(/^\d{2}:\d{2}:\d{2}[.,]\d+\s+-->\s+.*$/gm, '')
      .replace(/^\d{2}:\d{2}[.,]\d+\s+-->\s+.*$/gm, '')
      .replace(/<[^>]*>/g, ' ')
      .split(/\r?\n/)
      .filter(line => line.trim())
      .join(' '))
  }
}

function extractAssignedObject(text, marker) {
  const markerIndex = text.indexOf(marker)
  const start = text.indexOf('{', markerIndex)
  if (markerIndex < 0 || start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
    } else if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, index + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function transcriptFromInnertube(value) {
  const segments = []
  function visit(item) {
    if (!item || typeof item !== 'object') return
    if (item.transcriptSegmentRenderer) {
      const runs = item.transcriptSegmentRenderer.snippet?.runs || []
      segments.push(...runs.map(run => run.text || '').filter(Boolean))
      return
    }
    for (const child of Object.values(item)) if (child && typeof child === 'object') visit(child)
  }
  try {
    visit(JSON.parse(value))
  } catch {
    return ''
  }
  return normalizeText(segments.join(' '))
}

async function importYoutube(value) {
  const id = videoIdFromUrl(value)
  if (!id) throw new Error('Link do YouTube inválido ou não suportado.')
  const watchUrl = `https://www.youtube.com/watch?v=${id}`
  const watch = await fetchPublic(watchUrl)
  if (!watch.contentType.includes('html')) throw new Error('Não foi possível ler a página pública do YouTube.')
  const html = watch.body.toString('utf8')
  const playerText = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;/)?.[1]
  if (!playerText) throw new Error('O YouTube não disponibilizou dados públicos de transcrição para este vídeo.')
  let player
  try {
    player = JSON.parse(playerText)
  } catch {
    throw new Error('Os metadados públicos do vídeo estão em formato inválido.')
  }
  const details = player.videoDetails || {}
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  const track = tracks.find(item => item.languageCode?.toLowerCase().startsWith('en') && item.kind !== 'asr')
    || tracks.find(item => item.languageCode?.toLowerCase().startsWith('en'))
    || tracks.find(item => item.kind !== 'asr')
    || tracks[0]
  let transcript = ''
  if (track?.baseUrl) {
    const captionUrl = checkedUrl(track.baseUrl)
    captionUrl.searchParams.set('fmt', 'json3')
    const captions = await fetchPublic(captionUrl.href, { accept: 'application/json,text/plain,application/xml,text/vtt' })
    transcript = parseYoutubeCaptions(captions.body.toString('utf8'))
  }
  if (!transcript) {
    const context = extractAssignedObject(html, '"INNERTUBE_CONTEXT":')
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]
    const params = html.match(/"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/)?.[1]
    if (context?.client && apiKey && params) {
      const endpoint = `https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(apiKey)}`
      try {
        const response = await fetchPublic(endpoint, {
          method: 'POST',
          accept: 'application/json',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://www.youtube.com',
            Referer: watchUrl,
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': context.client.clientVersion || '',
            ...(context.client.visitorData ? { 'X-Goog-Visitor-Id': context.client.visitorData } : {}),
          },
          body: JSON.stringify({ context, params: JSON.parse(`"${params}"`) }),
        })
        transcript = transcriptFromInnertube(response.body.toString('utf8'))
      } catch (error) {
        console.warn('[seleblo-capture] Legendas públicas do YouTube indisponíveis nesta origem:', error.message)
      }
    }
  }
  if (!transcript) throw new Error('Este vídeo não disponibilizou uma transcrição pública acessível. Nenhum texto foi inventado.')
  const title = details.title || 'Vídeo do YouTube'
  const description = details.shortDescription || ''
  return {
    source: watchUrl,
    title,
    description,
    kind: 'video',
    content: `Transcrição pública (${track.languageCode || 'idioma não informado'}):\n\n${transcript}`,
    metadata: { durationSeconds: Number(details.lengthSeconds) || null },
  }
}

async function githubFile(url, owner, repository, branch, filePath) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
  const raw = await fetchPublic(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(branch)}/${encodedPath}`, {
    accept: 'text/plain,text/markdown,application/octet-stream',
  })
  const text = raw.body.toString('utf8')
  if (!text.trim()) throw new Error(`O arquivo público do GitHub está vazio: ${filePath}.`)
  return text
}

async function importGithub(value) {
  const url = checkedUrl(value)
  if (url.hostname.toLowerCase() !== 'github.com') throw new Error('Informe uma URL pública do GitHub.')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const owner = parts[0]
  const repository = parts[1]?.replace(/\.git$/i, '')
  if (!owner || !repository || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repository)) {
    throw new Error('Informe a URL pública de um repositório GitHub.')
  }
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
  const response = await fetchPublic(apiUrl, { accept: 'application/vnd.github+json' })
  const repositoryInfo = JSON.parse(response.body.toString('utf8'))
  if (repositoryInfo.private || repositoryInfo.disabled || !repositoryInfo.default_branch) {
    throw new Error('O repositório não está publicamente acessível.')
  }

  let filePath = ''
  let branch = repositoryInfo.default_branch
  if (parts[2] === 'blob' && parts.length > 4) {
    branch = parts[3]
    filePath = parts.slice(4).join('/')
  } else if (parts[2] === 'tree' && parts.length > 4) {
    throw new Error('Para importar documentação específica, use o link direto do arquivo Markdown no GitHub.')
  }

  const readmeUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/readme`
  const readmeResponse = await fetchPublic(readmeUrl, { accept: 'application/vnd.github.raw' })
  let content = readmeResponse.body.toString('utf8')
  if (filePath) {
    const selectedFile = await githubFile(url, owner, repository, branch, filePath)
    content = `${content}\n\n---\n\n## Arquivo selecionado: ${filePath}\n\n${selectedFile}`
  }
  content = normalizeText(content)
  if (content.length < 40) throw new Error('O repositório público não oferece README ou documentação textual acessível.')
  return {
    source: `https://github.com/${owner}/${repository}${filePath ? `/blob/${branch}/${filePath}` : ''}`,
    title: repositoryInfo.full_name || `${owner}/${repository}`,
    description: repositoryInfo.description || '',
    kind: 'project',
    content,
    metadata: { defaultBranch: branch, language: repositoryInfo.language || '' },
  }
}

async function importWebPage(value) {
  const url = checkedUrl(value)
  const response = await fetchPublic(url.href)
  if (response.contentType === 'application/pdf') {
    return importPdfBuffer(response.body, response.url, path.posix.basename(url.pathname) || 'documento.pdf')
  }
  if (!response.contentType.includes('html') && !response.contentType.startsWith('text/')) {
    throw new Error(`Tipo de conteúdo não suportado para páginas públicas: ${response.contentType || 'desconhecido'}.`)
  }
  const body = response.body.toString('utf8')
  const meta = htmlMetadata(body, response.url)
  const text = response.contentType.includes('html') ? htmlText(body) : normalizeText(body)
  if (text.length < 80) throw new Error('A página não oferece conteúdo textual público suficiente para captura.')
  return {
    source: meta.canonical || response.url,
    title: meta.title || new URL(response.url).hostname,
    description: meta.description,
    kind: 'reference',
    content: text,
    metadata: {},
  }
}

async function importUrl(value) {
  const id = videoIdFromUrl(value)
  if (id) return importYoutube(value)
  const host = checkedUrl(value).hostname.toLowerCase()
  if (host === 'github.com') return importGithub(value)
  return importWebPage(value)
}

async function extractPdf(buffer) {
  let loadingTask
  let document
  try {
    loadingTask = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true })
    document = await loadingTask.promise
    if (document.numPages > 100) throw new Error('O PDF excede o limite de 100 páginas.')
    const pages = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const text = await page.getTextContent()
      pages.push(text.items.map(item => typeof item.str === 'string' ? item.str : '').filter(Boolean).join(' '))
      page.cleanup()
    }
    const result = normalizeText(pages.join('\n\n'))
    if (result.length < 40) throw new Error('O PDF não contém texto extraível; PDFs somente com imagem não são processados por OCR.')
    return result
  } catch (error) {
    if (error.message.includes('limite') || error.message.includes('OCR')) throw error
    throw new Error(`Não foi possível extrair texto do PDF: ${error.message}`)
  } finally {
    await loadingTask?.destroy()
  }
}

async function importPdfBuffer(buffer, source, filename) {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('O arquivo não possui uma assinatura PDF válida.')
  }
  return {
    source,
    title: path.basename(filename, path.extname(filename)) || 'Documento PDF',
    description: '',
    kind: 'document',
    content: await extractPdf(buffer),
    metadata: { format: 'pdf' },
  }
}

function safeFilename(value) {
  const basename = path.posix.basename(String(value || '').replace(/\\/g, '/'))
  const cleaned = basename.normalize('NFKC').replace(/[<>:"/\\|?*]/g, '-').replace(/^\.+$/, '').trim()
  if (!cleaned || cleaned.length > 180 || [...cleaned].some(character => character.charCodeAt(0) < 32)) throw new Error('Nome de arquivo inválido.')
  return cleaned
}

function parseUploadedFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_UPLOAD_FILES) {
    throw new Error(`Selecione entre 1 e ${MAX_UPLOAD_FILES} arquivos compatíveis.`)
  }
  let total = 0
  const parsed = files.map(file => {
    if (!file || typeof file.content !== 'string') throw new Error('O arquivo enviado está em formato inválido.')
    const filename = safeFilename(file.name)
    const extension = path.extname(filename).toLowerCase()
    if (!ALLOWED_FILE_EXTENSIONS.has(extension)) throw new Error(`Tipo de arquivo não permitido: ${extension || filename}.`)
    if (files.length > 1 && extension !== '.md') throw new Error('Pastas de skills devem conter apenas arquivos Markdown.')
    const relativePath = String(file.relativePath || filename).replace(/\\/g, '/')
    if (relativePath.startsWith('/') || relativePath.split('/').includes('..') || relativePath.split('/').length > 8) {
      throw new Error('O caminho relativo do arquivo é inválido.')
    }
    if (relativePath.length > 500 || [...relativePath].some(character => character.charCodeAt(0) < 32)) {
      throw new Error('O caminho relativo do arquivo é inválido.')
    }
    if (!/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(file.content)) {
      throw new Error(`Arquivo inválido: ${filename}.`)
    }
    const buffer = Buffer.from(file.content, 'base64')
    if (!buffer.length) {
      throw new Error(`Arquivo inválido: ${filename}.`)
    }
    total += buffer.length
    if (buffer.length > MAX_UPLOAD_BYTES || total > MAX_UPLOAD_BYTES) {
      throw new Error('Os arquivos excedem o limite total de 5 MiB.')
    }
    const originalPath = typeof file.originalPath === 'string' ? file.originalPath.trim().slice(0, 2000) : ''
    if ([...originalPath].some(character => character.charCodeAt(0) < 32)) {
      throw new Error('A referência ao arquivo original é inválida.')
    }
    return { filename, relativePath, originalPath, extension, buffer }
  })
  return parsed
}

async function importFiles(files) {
  const parsed = parseUploadedFiles(files)
  if (parsed.some(file => ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(file.extension))) {
    if (parsed.length !== 1) throw new Error('Envie uma imagem por vez para preservar e catalogar o original.')
    const file = parsed[0]
    const signatureValid = file.extension === '.png' ? file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : ['.jpg', '.jpeg'].includes(file.extension) ? file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff
        : file.extension === '.gif' ? /^GIF8[79]a$/.test(file.buffer.subarray(0, 6).toString('ascii'))
          : file.extension === '.webp' ? file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WEBP'
            : false
    if (!signatureValid) throw new Error(`O conteúdo não corresponde a uma imagem ${file.extension}.`)
    const digest = crypto.createHash('sha256').update(file.buffer).digest('hex')
    return {
      source: `Arquivo de imagem: ${file.relativePath}`,
      title: path.basename(file.filename, file.extension),
      description: 'Imagem original preservada como anexo. Não foi realizada análise visual nem OCR local.',
      kind: 'reference',
      content: `Imagem anexada: ${file.filename}\nSHA-256: ${digest}\n\nA imagem foi preservada sem interpretação visual. Use a prévia do anexo para consultá-la.`,
      metadata: { files: [file.relativePath], format: file.extension.slice(1), visualAnalysis: 'indisponível' },
      attachment: { extension: file.extension, buffer: file.buffer, filename: file.filename },
    }
  }
  const sources = parsed.map(file => `Arquivo local: ${file.originalPath || file.relativePath}`).join('\n')
  const source = parsed.length === 1 ? sources : `Pasta de skills: ${parsed.length} arquivos Markdown`
  const pieces = []
  let kind = parsed.length > 1 ? 'skill' : 'document'
  for (const file of parsed) {
    let text
    if (file.extension === '.pdf') {
      text = await extractPdf(file.buffer)
    } else {
      const decoded = file.buffer.toString('utf8')
      if (!Buffer.from(decoded, 'utf8').equals(file.buffer)) {
        throw new Error(`O arquivo não é texto UTF-8 válido: ${file.filename}.`)
      }
      text = normalizeText(decoded)
      if (!text) throw new Error(`O arquivo está vazio ou não contém texto UTF-8: ${file.filename}.`)
    }
    if (file.extension === '.md' && /(?:^|\n)(?:name|description):\s/m.test(text.slice(0, 400)) && /skill|competenc|ferramenta/i.test(`${file.filename}\n${text.slice(0, 1000)}`)) {
      kind = 'skill'
    }
    const origin = file.originalPath ? `Origem local: ${file.originalPath}\n\n` : ''
    pieces.push(`## ${file.relativePath}\n\n${origin}${text}`)
  }
  return {
    source,
    title: parsed.length === 1 ? path.basename(parsed[0].filename, parsed[0].extension) : `Skill local (${parsed.length} arquivos)`,
    description: `Importação de ${parsed.length} arquivo${parsed.length === 1 ? '' : 's'} local${parsed.length === 1 ? '' : 'is'}.`,
    kind,
    content: normalizeText(pieces.join('\n\n')),
    metadata: {
      files: parsed.map(file => file.relativePath),
      originalPaths: parsed.filter(file => file.originalPath).map(file => file.originalPath),
      format: parsed.length === 1 ? parsed[0].extension.slice(1) : 'skill-folder',
    },
  }
}

function importText(body) {
  if (typeof body?.text !== 'string') throw new Error('Informe o texto ou a ideia que deseja guardar.')
  const content = normalizeText(body.text)
  if (!content) throw new Error('O texto da ideia não pode ficar vazio.')
  const title = typeof body.title === 'string' ? body.title.trim().replace(/[\r\n]+/g, ' ').slice(0, 200) : ''
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : ''
  let source = 'Ideia digitada'
  if (sourceUrl) {
    let parsedUrl
    try { parsedUrl = new URL(sourceUrl) } catch { throw new Error('A URL de origem da captura é inválida.') }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('A origem da captura deve usar HTTP ou HTTPS.')
    source = parsedUrl.href
  } else if (typeof body.source === 'string' && /^Arquivo local: /.test(body.source)) {
    source = body.source.slice(0, 2000)
  }
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? Object.fromEntries(Object.entries(body.metadata).slice(0, 12).map(([key, value]) => [
      String(key).slice(0, 80),
      [...String(value ?? '')].filter(character => character.charCodeAt(0) >= 32).join('').slice(0, 500),
    ]))
    : {}
  return {
    source,
    title: title || content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 120) || 'Ideia sem título',
    description: typeof body.description === 'string' ? body.description.slice(0, 1000) : '',
    kind: ['idea', 'document', 'reference', 'project', 'skill', 'video'].includes(body.kind) ? body.kind : 'idea',
    content,
    metadata: { format: 'text', ...metadata },
  }
}

function yamlString(value) {
  return JSON.stringify(String(value || '').slice(0, 2000))
}

function inferAnalysisType(kind) {
  return ({
    project: 'projeto',
    skill: 'skill',
    reference: 'inspiração',
    video: 'vídeo',
    idea: 'ideia',
    document: 'outro',
  })[kind] || 'outro'
}

function createNote(material, id, contentHash, relatedPaths) {
  const relations = relatedPaths.map(notePath => `- "[[${notePath.replace(/\.md$/i, '')}]]"`).join('\n')
  const description = material.description ? `\n\n${material.description}` : ''
  const metadata = material.metadata && Object.keys(material.metadata).length
    ? `\nDetalhes extraídos: ${yamlString(JSON.stringify(material.metadata))}`
    : ''
  const localPath = material.source.startsWith('Arquivo local: ')
    ? material.source.slice('Arquivo local: '.length)
    : ''
  const source = /^https?:\/\//i.test(material.source)
    ? `[${material.source}](${material.source})`
    : localPath && path.isAbsolute(localPath)
      ? `[${localPath}](${pathToFileURL(localPath).href})`
      : material.source
  const type = inferAnalysisType(material.kind)
  return [
    '---',
    `capture_id: ${id}`,
    `capture_content_sha256: ${contentHash}`,
    `capture_kind: ${type}`,
    `capture_source: ${yamlString(material.source)}`,
    '---',
    '',
    `# ${String(material.title || 'Material capturado').replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
    '',
    `Tipo inicial: ${type}`,
    `\nFonte: ${source}${description}${metadata}`,
    ...(material.attachment ? [`\n\n![${material.attachment.filename}](./${id}${material.attachment.extension})`] : []),
    '',
    ...(relations ? ['\nConteúdos relacionados no SELEBLO:', relations, ''] : []),
    '## Conteúdo capturado',
    '',
    material.content,
    '',
  ].join('\n')
}

export function createCaptureService({ vault, knowledgeIndex }) {
  const root = path.resolve(vault)
  const captureDirectory = path.resolve(root, CAPTURE_DIRECTORY)
  const jobs = new Map()
  const activeKeys = new Map()

  function jobStatus(job) {
    return {
      id: job.id,
      status: job.status,
      title: job.title || '',
      path: job.path || '',
      source: job.source || '',
      kind: job.kind || '',
      analysisState: job.analysisState || '',
      analysisError: job.analysisError || null,
      error: job.error || null,
      duplicate: Boolean(job.duplicate),
    }
  }

  async function submit(body) {
    const hasUrl = typeof body?.url === 'string' && body.url.trim()
    const hasFiles = Array.isArray(body?.files) && body.files.length
    const hasText = typeof body?.text === 'string'
    if ([hasUrl, hasFiles, hasText].filter(Boolean).length !== 1) throw new Error('Envie uma ideia, uma URL pública ou arquivos locais.')
    if (hasUrl) checkedUrl(body.url.trim())
    if (hasFiles) parseUploadedFiles(body.files)
    if (hasText) importText(body)

    const id = crypto.randomUUID()
    const job = { id, status: 'received', title: '', source: hasUrl ? body.url.trim() : '', path: '', error: null }
    jobs.set(id, job)
    setImmediate(() => { void processJob(job, body) })
    return jobStatus(job)
  }

  async function processJob(job, body) {
    let lockKey = ''
    try {
      job.status = 'processing'
      const material = body.url ? await importUrl(body.url.trim()) : body.files ? await importFiles(body.files) : importText(body)
      job.title = material.title
      job.source = material.source
      job.kind = material.kind
      const contentHash = crypto.createHash('sha256').update(material.content).digest('hex')
      const canonicalSource = /^https?:/i.test(material.source) ? canonicalUrl(material.source) : ''
      lockKey = canonicalSource || contentHash
      if (activeKeys.has(lockKey)) {
        job.status = 'processing'
        job.duplicateOf = activeKeys.get(lockKey)
        job.duplicate = true
        return
      }
      activeKeys.set(lockKey, job.id)
      const duplicate = knowledgeIndex.findDuplicate({ source: canonicalSource, contentHash })
      if (duplicate) {
        job.status = 'completed'
        job.title = duplicate.title || material.title
        job.path = duplicate.path
        job.source = material.source
        job.duplicate = true
        return
      }

      fs.mkdirSync(captureDirectory, { recursive: true })
      const realRoot = fs.realpathSync(root)
      const realCaptureDirectory = fs.realpathSync(captureDirectory)
      const relative = path.relative(realRoot, realCaptureDirectory)
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('A pasta de capturas não está dentro do cofre configurado.')
      }
      const related = knowledgeIndex.search(`${material.title} ${material.description} ${material.content.slice(0, 3000)}`, null, [])
      const relatedPaths = []
      const candidateNames = new Set()
      for (const item of related) {
        if (item.path.startsWith(`${CAPTURE_DIRECTORY}/`)) continue
        const basename = path.posix.basename(item.path, '.md')
        if (candidateNames.has(basename.toLocaleLowerCase('pt-BR'))) continue
        candidateNames.add(basename.toLocaleLowerCase('pt-BR'))
        relatedPaths.push(basename)
        if (relatedPaths.length >= 4) break
      }
      const notePath = path.join(realCaptureDirectory, `${job.id}.md`)
      const note = createNote(material, job.id, contentHash, relatedPaths)
      const noteBytes = Buffer.byteLength(note, 'utf8')
      if (noteBytes > 1024 * 1024) throw new Error('O material processado excede o limite de 1 MiB por nota.')
      const attachmentPath = material.attachment
        ? path.join(realCaptureDirectory, `${job.id}${material.attachment.extension}`)
        : null
      if (attachmentPath) fs.writeFileSync(attachmentPath, material.attachment.buffer, { flag: 'wx', mode: 0o600 })
      try {
        fs.writeFileSync(notePath, note, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      } catch (error) {
        if (attachmentPath) fs.rmSync(attachmentPath, { force: true })
        throw error
      }
      job.path = `${CAPTURE_DIRECTORY}/${job.id}.md`
      void knowledgeIndex.scan()
    } catch (error) {
      job.status = 'error'
      job.error = error.message || 'Falha ao capturar o material.'
      console.warn('[seleblo-capture] Captura recusada ou falhou:', job.error)
    } finally {
      if (lockKey && activeKeys.get(lockKey) === job.id) activeKeys.delete(lockKey)
    }
  }

  function status(id) {
    const job = jobs.get(id)
    if (!job) {
      const relativePath = `${CAPTURE_DIRECTORY}/${id}.md`
      const details = knowledgeIndex.documentDetails(relativePath)
      if (!details) return null
      const document = details.document
      return {
        id,
        status: 'completed',
        title: document.analysis?.descriptiveTitle || document.facts?.title || document.name,
        path: relativePath,
        source: document.facts?.urls?.[0] || '',
        kind: '',
        analysisState: document.analysisState,
        analysisError: document.analysisError || null,
        error: null,
        duplicate: false,
      }
    }
    if (job.duplicateOf) {
      const original = status(job.duplicateOf)
      if (original) return { ...original, id: job.id, duplicate: true }
    }
    if (job.path) {
      const details = knowledgeIndex.documentDetails(job.path)
      if (details) {
        const document = details.document
        job.status = 'completed'
        job.analysisState = document.analysisState
        job.analysisError = document.analysisError || null
        job.title = document.analysis?.descriptiveTitle || document.facts?.title || job.title
      }
    }
    return jobStatus(job)
  }

  function pruneJobs() {
    const cutoff = Date.now() - JOB_RETENTION_MS
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) jobs.delete(id)
    }
  }

  return {
    submit: async body => {
      pruneJobs()
      const job = await submit(body)
      job.createdAt = Date.now()
      jobs.get(job.id).createdAt = job.createdAt
      return job
    },
    status,
  }
}

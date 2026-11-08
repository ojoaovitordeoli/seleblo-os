import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const MAX_FOLDERS = 12
const MAX_DEPTH = 7
const MAX_FILES_PER_FOLDER = 1200
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_IMPORTS_PER_PASS = 6
const SYNC_INTERVAL_MS = 45_000
const ALLOWED_EXTENSIONS = new Set([
  '.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.mp4', '.mov', '.m4v', '.mp3', '.wav', '.m4a',
])
const BLOCKED_DIRECTORY_NAMES = new Set([
  '.git', '.obsidian', '.ssh', '.gnupg', '.aws', '.azure', '.config',
  'appdata', 'windows', 'program files', 'program files (x86)', 'programdata',
  '$recycle.bin', 'system volume information', 'node_modules', 'vendor',
  'temp', 'tmp',
])
const SENSITIVE_FILE = /(?:^|[._-])(?:secrets?|credentials?|passwords?|passwd|tokens?|private.?key)(?:[._-]|$)|^(?:\.env|id_rsa|id_ed25519|authorized_keys)(?:\.|$)|\.(?:pem|key|p12|pfx|kdbx|keystore)$/i
const EXTENSION_KIND = new Map([
  ['.md', 'Markdown'], ['.txt', 'texto'], ['.pdf', 'PDF'],
  ['.png', 'imagem'], ['.jpg', 'imagem'], ['.jpeg', 'imagem'], ['.webp', 'imagem'], ['.gif', 'imagem'],
  ['.mp4', 'vídeo'], ['.mov', 'vídeo'], ['.m4v', 'vídeo'],
  ['.mp3', 'áudio'], ['.wav', 'áudio'], ['.m4a', 'áudio'],
])

function isInside(parent, target) {
  const relative = path.relative(parent, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function isSensitiveName(name) {
  return SENSITIVE_FILE.test(name) || name.startsWith('.')
}

function selectedFolder(input, vault) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Selecione uma pasta válida.')
  const requested = path.resolve(input.trim())
  const real = fs.realpathSync(requested)
  const stat = fs.statSync(real)
  if (!stat.isDirectory()) throw new Error('O caminho selecionado não é uma pasta.')
  const parsed = path.parse(real)
  const parts = real.slice(parsed.root.length).split(path.sep).filter(Boolean)
  if (parts.length < 3) throw new Error('Escolha uma pasta específica, não uma raiz ampla do computador.')
  const vaultReal = fs.realpathSync(vault)
  if (isInside(real, vaultReal) || isInside(vaultReal, real)) {
    throw new Error('Escolha uma pasta fora do cofre Obsidian para evitar recursão e preservar seus documentos originais.')
  }
  if (parts.some(part => BLOCKED_DIRECTORY_NAMES.has(part.toLowerCase()) || isSensitiveName(part))) {
    throw new Error('Essa pasta de sistema, oculta ou de configuração não pode ser sincronizada.')
  }
  return real
}

function chooseWindowsFolder() {
  if (process.platform !== 'win32') return Promise.reject(new Error('A seleção automática de pastas está disponível nesta instalação do Windows.'))
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dialog.Description = "Escolha uma pasta específica para sincronizar com o SELEBLO OS"',
    '$dialog.ShowNewFolderButton = $false',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
  ].join('; ')
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
      windowsHide: false,
      timeout: 600_000,
      maxBuffer: 16 * 1024,
      encoding: 'utf8',
    }, (error, stdout) => {
      if (error) return reject(new Error(`Não foi possível abrir o seletor de pastas do Windows: ${error.message}`))
      const selected = stdout.trim()
      resolve(selected || null)
    })
  })
}

function listAllowedFiles(root) {
  const files = []
  let exceeded = false
  let skipped = 0
  function visit(directory, depth) {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES_PER_FOLDER) {
      exceeded = true
      return
    }
    let entries
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch (error) {
      throw new Error(`Não foi possível ler ${directory}: ${error.message}`)
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || isSensitiveName(entry.name)) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (BLOCKED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) continue
        visit(absolute, depth + 1)
      } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(absolute)
        if (stat.size <= MAX_FILE_BYTES) files.push({ absolute, name: entry.name, size: stat.size, modifiedAt: stat.mtimeMs })
        else {
          skipped += 1
          exceeded = true
        }
        if (files.length >= MAX_FILES_PER_FOLDER) {
          exceeded = true
          return
        }
      }
      if (exceeded) return
    }
  }
  visit(root, 0)
  return { files, exceeded, skipped }
}

export function createFolderSyncService({ vault, knowledgeIndex, captureService }) {
  let timer
  let running = false
  const status = { syncing: false, indexed: 0, skipped: 0, errors: [], lastRun: null, limited: false }

  function folders() {
    return knowledgeIndex.getWatchedFolders()
  }

  function revealOriginal(requestedPath) {
    if (process.platform !== 'win32') return Promise.reject(new Error('A abertura do arquivo original está disponível no Windows.'))
    if (typeof requestedPath !== 'string' || !requestedPath.trim()) return Promise.reject(new Error('Caminho do original inválido.'))
    const target = path.resolve(requestedPath)
    const root = folders().find(folder => isInside(folder, target))
    if (!root) return Promise.reject(new Error('O arquivo não está dentro de uma pasta autorizada para sincronização.'))
    const linkStat = fs.lstatSync(target)
    const real = fs.realpathSync(target)
    if (!linkStat.isFile() || linkStat.isSymbolicLink() || !isInside(root, real) || !ALLOWED_EXTENSIONS.has(path.extname(real).toLowerCase())) {
      return Promise.reject(new Error('O caminho original não é um arquivo permitido da pasta sincronizada.'))
    }
    return new Promise((resolve, reject) => {
      execFile('explorer.exe', [`/select,${real}`], { windowsHide: false, timeout: 15_000 }, error => {
        if (error) return reject(new Error(`Não foi possível abrir a pasta do original: ${error.message}`))
        resolve(true)
      })
    })
  }

  async function addFolder(requested) {
    const real = selectedFolder(requested, vault)
    const current = folders()
    if (current.includes(real)) return { path: real, duplicate: true, folders: current }
    if (current.length >= MAX_FOLDERS) throw new Error(`O limite é de ${MAX_FOLDERS} pastas monitoradas.`)
    return { path: real, duplicate: false, folders: knowledgeIndex.setWatchedFolders([...current, real]) }
  }

  function removeFolder(requested) {
    const current = folders()
    const target = current.find(folder => folder === requested)
    if (!target) throw new Error('A pasta não está cadastrada para sincronização.')
    const remaining = knowledgeIndex.setWatchedFolders(current.filter(folder => folder !== target))
    knowledgeIndex.forgetWatchedFiles(target)
    return remaining
  }

  function waitForCapture(jobId) {
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const poll = () => {
        const result = captureService.status(jobId)
        if (result?.status === 'completed') return resolve(result)
        if (result?.status === 'error') return reject(new Error(result.error || 'Falha ao importar arquivo.'))
        if (Date.now() - started > 120_000) return reject(new Error('Tempo limite ao aguardar a indexação do arquivo.'))
        setTimeout(poll, 1000)
      }
      poll()
    })
  }

  async function importFile(root, file) {
    const realRoot = fs.realpathSync(root)
    const linkStat = fs.lstatSync(file.absolute)
    const realFile = fs.realpathSync(file.absolute)
    if (linkStat.isSymbolicLink() || !isInside(realRoot, realFile)) {
      throw new Error('O arquivo foi substituído por um link ou saiu da pasta autorizada; ignorado.')
    }
    const extension = path.extname(file.name).toLowerCase()
    const signature = `${file.size}:${file.modifiedAt}`
    const previous = knowledgeIndex.getWatchedFile(file.absolute)
    if (previous === signature) return false
    const bytes = await fs.promises.readFile(realFile)
    const digest = crypto.createHash('sha256').update(bytes).digest('hex')
    const subject = EXTENSION_KIND.get(extension)
    let job
    if (['.md', '.txt', '.pdf'].includes(extension)) {
      job = await captureService.submit({
        files: [{
          name: file.name,
          relativePath: path.relative(path.dirname(file.absolute), file.absolute),
          originalPath: file.absolute,
          content: bytes.toString('base64'),
        }],
      })
    } else {
      const content = [
        `${subject} acompanhado em ${file.absolute}`,
        `Tamanho: ${file.size} bytes`,
        `Modificado: ${new Date(file.modifiedAt).toISOString()}`,
        `SHA-256: ${digest}`,
        extension === '.png' || extension === '.jpg' || extension === '.jpeg' || extension === '.webp' || extension === '.gif'
          ? 'OCR/análise visual local não disponível; o significado da imagem não foi inferido.'
          : 'Transcrição local não disponível; o conteúdo do arquivo não foi inferido.',
      ].join('\n')
      job = await captureService.submit({
        title: path.basename(file.name, extension),
        text: content,
        source: `Arquivo local: ${file.absolute}`,
        kind: 'reference',
        metadata: { filePath: file.absolute, format: extension.slice(1), sha256: digest },
      })
    }
    await waitForCapture(job.id)
    knowledgeIndex.recordWatchedFile(file.absolute, signature)
    return true
  }

  async function sync() {
    if (running) return
    running = true
    status.syncing = true
    status.errors = []
    status.skipped = 0
    status.limited = false
    let imported = 0
    let processed = 0
    const configuredFolders = folders()
    try {
      for (const folder of configuredFolders) {
        if (!fs.existsSync(folder)) {
          status.errors.push(`Pasta indisponível: ${folder}`)
          continue
        }
        const realFolder = selectedFolder(folder, vault)
        if (realFolder !== folder) throw new Error(`O caminho da pasta mudou desde a seleção: ${folder}`)
        const { files, exceeded, skipped } = listAllowedFiles(realFolder)
        status.skipped += skipped
        status.limited ||= exceeded
        knowledgeIndex.retainWatchedFiles(realFolder, files.map(file => file.absolute))
        for (const file of files) {
          const previous = knowledgeIndex.getWatchedFile(file.absolute)
          if (previous === `${file.size}:${file.modifiedAt}`) continue
          if (processed >= MAX_IMPORTS_PER_PASS) {
            status.limited = true
            break
          }
          processed += 1
          try {
            if (await importFile(realFolder, file)) imported += 1
          } catch (error) {
            status.errors.push(`${file.absolute}: ${error.message}`)
          }
        }
        if (processed >= MAX_IMPORTS_PER_PASS) break
      }
      status.indexed += imported
      status.lastRun = Date.now()
      if (status.errors.length) console.warn('[seleblo-folder-sync] Alguns arquivos não foram sincronizados:', status.errors.slice(0, 5))
    } catch (error) {
      status.errors.push(error.message)
      console.error('[seleblo-folder-sync] Falha na varredura:', error)
    } finally {
      status.syncing = false
      running = false
    }
  }

  function start() {
    if (timer) return
    void sync()
    timer = setInterval(() => void sync(), SYNC_INTERVAL_MS)
    timer.unref?.()
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  return {
    addFolder,
    chooseFolder: chooseWindowsFolder,
    revealOriginal,
    folders,
    removeFolder,
    status: () => ({ ...status, folders: folders(), intervalMs: SYNC_INTERVAL_MS }),
    start,
    stop,
    sync,
  }
}

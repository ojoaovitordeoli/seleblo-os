import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createFolderSyncService } from './folderSyncService.js'

test('sincroniza somente arquivos permitidos, detecta alterações e não remove originais', async () => {
  const base = fs.mkdtempSync(path.join(path.join(process.env.USERPROFILE, 'Downloads'), 'seleblo-folder-sync-'))
  const vault = path.join(base, 'vault')
  const selected = path.join(base, 'selected', 'course-files')
  fs.mkdirSync(vault, { recursive: true })
  fs.mkdirSync(path.join(selected, 'private'), { recursive: true })
  const textFile = path.join(selected, 'lesson.md')
  const secretFile = path.join(selected, '.env')
  const privateFile = path.join(selected, 'private', 'passwords.txt')
  fs.writeFileSync(textFile, '# Lesson\nUnique watched phrase')
  fs.writeFileSync(secretFile, 'do not index')
  fs.writeFileSync(privateFile, 'do not index')

  const roots = []
  const recorded = new Map()
  const submissions = []
  const index = {
    getWatchedFolders: () => [...roots],
    setWatchedFolders: value => { roots.splice(0, roots.length, ...value); return [...roots] },
    getWatchedFile: filePath => recorded.get(filePath) || null,
    recordWatchedFile: (filePath, signature) => recorded.set(filePath, signature),
    forgetWatchedFiles: root => {
      for (const filePath of recorded.keys()) {
        if (path.relative(root, filePath) && !path.relative(root, filePath).startsWith(`..${path.sep}`)) recorded.delete(filePath)
      }
    },
    retainWatchedFiles: (root, files) => {
      const active = new Set(files)
      for (const filePath of recorded.keys()) {
        if (path.relative(root, filePath) && !path.relative(root, filePath).startsWith(`..${path.sep}`) && !active.has(filePath)) recorded.delete(filePath)
      }
    },
  }
  const capture = {
    submit: async body => {
      submissions.push(body)
      return { id: `job-${submissions.length}` }
    },
    status: () => ({ status: 'completed' }),
  }
  const sync = createFolderSyncService({ vault, knowledgeIndex: index, captureService: capture })
  try {
    await assert.rejects(sync.addFolder(vault), /fora do cofre Obsidian/)
    await assert.rejects(sync.addFolder(path.parse(selected).root), /pasta específica/)
    await sync.addFolder(selected)
    await sync.sync()
    assert.equal(submissions.length, 1)
    assert.equal(submissions[0].files[0].originalPath, textFile)
    assert.equal(fs.readFileSync(textFile, 'utf8'), '# Lesson\nUnique watched phrase')
    assert.equal(recorded.has(secretFile), false)
    assert.equal(recorded.has(privateFile), false)

    await sync.sync()
    assert.equal(submissions.length, 1, 'arquivo inalterado não deve ser importado novamente')
    fs.writeFileSync(textFile, '# Lesson\nUpdated unique watched phrase')
    await sync.sync()
    assert.equal(submissions.length, 2, 'arquivo modificado deve ser importado')

    sync.removeFolder(selected)
    assert.equal(roots.length, 0)
    assert.equal(fs.existsSync(textFile), true, 'remover a sincronização não apaga o original')
  } finally {
    sync.stop()
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('cataloga imagem sem inferir conteúdo visual e mantém origem local', async () => {
  const base = fs.mkdtempSync(path.join(path.join(process.env.USERPROFILE, 'Downloads'), 'seleblo-image-sync-'))
  const vault = path.join(base, 'vault')
  const selected = path.join(base, 'selected', 'screenshots')
  fs.mkdirSync(vault, { recursive: true })
  fs.mkdirSync(selected, { recursive: true })
  const imagePath = path.join(selected, 'chart.png')
  fs.writeFileSync(imagePath, Buffer.from('sample image bytes'))
  const roots = [selected]
  const recorded = new Map()
  const index = {
    getWatchedFolders: () => [...roots],
    setWatchedFolders: value => value,
    getWatchedFile: filePath => recorded.get(filePath) || null,
    recordWatchedFile: (filePath, signature) => recorded.set(filePath, signature),
    forgetWatchedFiles: () => {},
    retainWatchedFiles: () => {},
  }
  let submitted
  const capture = {
    submit: async body => { submitted = body; return { id: 'image-job' } },
    status: () => ({ status: 'completed' }),
  }
  const sync = createFolderSyncService({ vault, knowledgeIndex: index, captureService: capture })
  try {
    await sync.sync()
    assert.equal(submitted.source, `Arquivo local: ${imagePath}`)
    assert.match(submitted.text, /OCR\/análise visual local não disponível/)
    assert.match(submitted.text, new RegExp(crypto.createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex')))
  } finally {
    sync.stop()
    fs.rmSync(base, { recursive: true, force: true })
  }
})

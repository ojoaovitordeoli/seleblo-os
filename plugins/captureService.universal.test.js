import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createCaptureService } from './captureService.js'

async function waitForFile(filePath) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`A nota de captura não foi criada: ${filePath}`)
}

test('captura de imagem preserva anexo e metadados sem inventar OCR', async () => {
  const root = fs.mkdtempSync(path.join(path.join(process.env.USERPROFILE, 'Downloads'), 'seleblo-capture-image-'))
  fs.mkdirSync(root, { recursive: true })
  const original = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from('test image bytes'),
  ])
  const capture = createCaptureService({
    vault: root,
    knowledgeIndex: {
      findDuplicate: () => null,
      search: () => [],
      scan: async () => {},
      documentDetails: () => null,
    },
  })
  try {
    const job = await capture.submit({
      files: [{ name: 'screen.png', relativePath: 'course/module/screen.png', content: original.toString('base64') }],
    })
    const notePath = path.join(root, '_SELEBLO Capturas', `${job.id}.md`)
    const attachmentPath = path.join(root, '_SELEBLO Capturas', `${job.id}.png`)
    await waitForFile(notePath)
    assert.deepEqual(fs.readFileSync(attachmentPath), original)
    const note = fs.readFileSync(notePath, 'utf8')
    assert.match(note, /Arquivo de imagem: course\/module\/screen\.png/)
    assert.match(note, /Não foi realizada análise visual nem OCR local/)
    assert.match(note, /SHA-256/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('captura de navegador guarda URL e hierarquia de curso informadas pelo usuário', async () => {
  const root = fs.mkdtempSync(path.join(path.join(process.env.USERPROFILE, 'Downloads'), 'seleblo-capture-page-'))
  fs.mkdirSync(root, { recursive: true })
  const capture = createCaptureService({
    vault: root,
    knowledgeIndex: {
      findDuplicate: () => null,
      search: () => [],
      scan: async () => {},
      documentDetails: () => null,
    },
  })
  try {
    const job = await capture.submit({
      title: 'Aula de sistemas',
      text: 'Texto visível da página e anotação pessoal.',
      sourceUrl: 'https://courses.example/lesson',
      kind: 'document',
      metadata: { course: 'Sistemas', module: 'Módulo 2', lesson: 'Aula 4' },
    })
    const notePath = path.join(root, '_SELEBLO Capturas', `${job.id}.md`)
    await waitForFile(notePath)
    const note = fs.readFileSync(notePath, 'utf8')
    assert.match(note, /https:\/\/courses\.example\/lesson/)
    assert.match(note, /Sistemas/)
    assert.match(note, /Módulo 2/)
    assert.match(note, /Aula 4/)
    assert.match(note, /Texto visível da página/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * Guarda a chave da OpenAI do RONIN só neste PC, fora do repositório.
 *   node scripts/definir-chave-openai.mjs
 * O que é colado não aparece na tela. A chave só é salva se a OpenAI aceitar.
 * Para remover, apague o arquivo %LOCALAPPDATA%\SELEBLO-OS\ronin\openai.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

const PASTA = join(process.env.LOCALAPPDATA || os.homedir(), 'SELEBLO-OS', 'ronin')

function pedir(texto) {
  return new Promise((ok) => {
    process.stdout.write(texto)
    let valor = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    const aoDigitar = (pedaco) => {
      for (const c of pedaco) {
        if (c === '\u0003') {
          process.stdout.write('\n')
          process.exit(1)
        }
        if (c === '\r' || c === '\n') {
          if (!valor) continue
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', aoDigitar)
          process.stdout.write('\n')
          return ok(valor.trim())
        }
        if (c === '\u007f' || c === '\b') valor = valor.slice(0, -1)
        else if (c >= ' ') valor += c
      }
      process.stdout.write(`\r${texto}${'*'.repeat(Math.min(valor.length, 30))}`)
    }
    process.stdin.on('data', aoDigitar)
  })
}

if (!process.stdin.isTTY) {
  console.error('Rode isto em um terminal.')
  process.exit(1)
}

for (;;) {
  const chave = await pedir('Cole a chave da OpenAI e aperte Enter: ')
  let situacao
  try {
    const resposta = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(20000) })
    situacao = resposta.status
  } catch {
    console.log('Não consegui falar com a OpenAI. Veja a internet e tente de novo.\n')
    continue
  }
  if (situacao === 200) {
    mkdirSync(PASTA, { recursive: true })
    writeFileSync(join(PASTA, 'openai.json'), JSON.stringify({ chave }), { encoding: 'utf8', mode: 0o600 })
    console.log('\nChave aceita e salva. Pode fechar esta aba.')
    process.exit(0)
  }
  console.log(`A OpenAI recusou essa chave (código ${situacao}). Confira e cole de novo.\n`)
}

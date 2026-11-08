// Canal simples entre o chat do RONIN / painel de conhecimento e o escritório pixel-art.
// estados: 'pensando' | 'respondeu' (com pastas) | 'erro' | 'ir' (para uma pasta) | 'casa'
const NOME = 'seleblo:ronin'

export function avisarRonin(detalhe) {
  window.dispatchEvent(new CustomEvent(NOME, { detail: detalhe }))
}

export function ouvirRonin(fn) {
  const h = (e) => fn(e.detail)
  window.addEventListener(NOME, h)
  return () => window.removeEventListener(NOME, h)
}

// Atalhos entre painéis: abrir uma nota no Cofre, ou mandar uma pergunta ao chat do RONIN.
export const abrirNota = (path) => window.dispatchEvent(new CustomEvent('seleblo:abrir-nota', { detail: { path } }))
// nota: { path, pasta } opcional — o RONIN procura primeiro nessa nota/pasta
export const perguntarAoRonin = (texto, nota = null) => window.dispatchEvent(new CustomEvent('seleblo:perguntar', { detail: { texto, nota } }))

/** "05 - Copies/sub/nota.md" -> "05 - Copies" */
export function pastaDoCaminho(caminho = '') {
  return String(caminho).replace(/\\/g, '/').split('/')[0]
}

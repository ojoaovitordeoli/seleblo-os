import React from 'react'

/*
 * Renderizador de Markdown simples e seguro (gera elementos React, sem HTML cru).
 * Cobre o que as notas do cofre usam: títulos, listas, citações/callouts, código,
 * negrito, itálico, código inline, links e [[wikilinks]]. Esconde o frontmatter.
 */

const linkSeguro = (url) => {
  try {
    const u = new URL(url)
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

function inline(texto, chave = 'i') {
  const partes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g
  let ultimo = 0
  let m
  let n = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    const t = m[0]
    const k = `${chave}-${n++}`
    if (t.startsWith('**')) partes.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) partes.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[[')) partes.push(<strong key={k}>{t.slice(2, -2).split('|').pop()}</strong>)
    else if (t.startsWith('[')) {
      const [, rotulo, url] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || []
      const ok = linkSeguro(url)
      partes.push(ok ? <a key={k} href={ok} target="_blank" rel="noopener noreferrer">{rotulo}</a> : rotulo)
    } else if (t.startsWith('http')) {
      const ok = linkSeguro(t)
      partes.push(ok ? <a key={k} href={ok} target="_blank" rel="noopener noreferrer">{t.length > 60 ? t.slice(0, 57) + '…' : t}</a> : t)
    } else partes.push(<em key={k}>{t.slice(1, -1)}</em>)
    ultimo = m.index + t.length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

export default function Markdown({ texto = '' }) {
  let linhas = String(texto).replace(/\r/g, '').split('\n')
  if (linhas[0]?.trim() === '---') {
    const fim = linhas.indexOf('---', 1)
    if (fim > 0) linhas = linhas.slice(fim + 1)
  }
  const blocos = []
  let i = 0
  let k = 0
  while (i < linhas.length) {
    const l = linhas[i]
    if (l.startsWith('```')) {
      const corpo = []
      i++
      while (i < linhas.length && !linhas[i].startsWith('```')) corpo.push(linhas[i++])
      i++
      blocos.push(<pre key={k++}>{corpo.join('\n')}</pre>)
      continue
    }
    const h = l.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      const Tag = `h${h[1].length}`
      blocos.push(<Tag key={k++}>{inline(h[2], `h${k}`)}</Tag>)
      i++
      continue
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordenada = /^\s*\d/.test(l)
      const itens = []
      while (i < linhas.length && /^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*([-*+]|\d+[.)])\s+(\[[ x]\]\s*)?/, ''))
        i++
      }
      const Tag = ordenada ? 'ol' : 'ul'
      blocos.push(<Tag key={k++}>{itens.map((t, j) => <li key={j}>{inline(t, `l${k}-${j}`)}</li>)}</Tag>)
      continue
    }
    if (l.startsWith('>')) {
      const corpo = []
      while (i < linhas.length && linhas[i].startsWith('>')) corpo.push(linhas[i++].replace(/^>\s?/, '').replace(/^\[!\w+\][-+]?\s*/, ''))
      blocos.push(<blockquote key={k++}>{corpo.map((t, j) => <div key={j}>{inline(t, `q${k}-${j}`)}</div>)}</blockquote>)
      continue
    }
    if (!l.trim()) { i++; continue }
    const par = []
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,3}\s|```|>|\s*([-*+]|\d+[.)])\s)/.test(linhas[i])) par.push(linhas[i++])
    blocos.push(<p key={k++}>{inline(par.join(' '), `p${k}`)}</p>)
  }
  return <div className="so-md">{blocos}</div>
}

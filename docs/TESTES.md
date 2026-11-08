# Testes

## Automatizados existentes
`node --test plugins/*.test.js` — 4 testes (captura de imagem, clip de navegador, folder sync, imagem em folder sync).
07/11/2026: 4/4 passam (Linux, Node 22). No Linux, `USERPROFILE` deve apontar para pasta sem `tmp` no caminho e com `Downloads`.

## Sondas da auditoria de 07/11/2026 (reproduzíveis com cofre sintético, sem Ollama)
| Sonda | Resultado |
|---|---|
| "campanha Black Friday" / "campanhas de black friday" | encontra a nota ✅ |
| "custo por lead" (nota diz "CPL") | nada ❌ (sem semântica) |
| termo raro no fim de nota longa ("Zeiss") | nada ❌ (C2) |
| editar arquivo monitorado | 2 notas; busca retorna valor novo **e** antigo ❌ (C1) |
| apagar arquivo monitorado | nota permanece sem marcação ❌ (C1) |

## Lacunas
Sem teste para: `retrieveDocuments`, `/chat`, `importWebPage`, `importYoutube`, `importGithub`, PDF, persistência após reinício.
Desempenho real (latência, uso de RAM/GPU) ainda não medido nesta fase.

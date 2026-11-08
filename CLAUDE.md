# CLAUDE.md — SELEBLO OS / RONIN (Segundo Cérebro da Aceleradora de Óticas)

Leia isto antes de qualquer alteração. Depois leia `docs/ESTADO_ATUAL.md`.

## O que é
Base de conhecimento local da Aceleradora de Óticas. Fonte da verdade = cofre Obsidian
(`C:\Users\Usuario\Downloads\2\SEGUNDO SELEBLO`, override `SELEBLO_VAULT`).
Este repositório é um fork do projeto open-source `Gaurav2693/ai-office` (cena 3D) ao qual
foram adicionados: índice persistente, captura universal, sincronização de pastas e o chat RONIN.

## Arquitetura real (resumo)
- **Não há backend separado.** Toda a API (`/api/seleblo/*`) roda como plugin do Vite
  (`plugins/vaultPlugin.js`), em `vite dev` (5173) ou `vite preview` (4173), sempre em `127.0.0.1`.
- `plugins/knowledgeIndex.js` — índice lexical persistente em `%LOCALAPPDATA%\SELEBLO-OS\knowledge-index.json`;
  varre o cofre a cada 15 s; análise em segundo plano com Ollama `qwen2.5:3b`.
- `plugins/captureService.js` — captura de texto/URL/YouTube (legendas públicas)/GitHub (README)/PDF (texto)/imagem (só anexo).
  Escreve notas novas em `<cofre>/_SELEBLO Capturas/<uuid>.md`. Nunca edita notas existentes.
- `plugins/folderSyncService.js` — monitora pastas externas a cada 45 s e gera capturas.
- `src/components/RoninChat.jsx` → `POST /api/seleblo/chat` → Ollama `127.0.0.1:11434` (primário `qwen2.5:3b`, fallback `qwen3:4b`).
- Acesso remoto: `tailscale serve` → 127.0.0.1:4173. Inicialização: `scripts/start-seleblo-preview.vbs` (pasta Startup).
- **Sistemas paralelos fora deste repo** (`C:\Users\Usuario\SegundoCerebro-Sistema`): Open WebUI (8080) + `oikb watch`
  para a base `celeblo` e `processador_segundo_cerebro.py`. O RONIN NÃO usa o Open WebUI.

## Comandos
```
npm ci
npm run lint
npm run build
node --test plugins/*.test.js     # no Linux: USERPROFILE=<dir sem "tmp" no caminho> com subpasta Downloads
```

## Regras do projeto (resumo do prompt mestre)
1. Inspecionar antes de modificar; mudanças pequenas e testáveis. 2. Não reconstruir do zero.
3. Nunca afirmar que funciona sem teste; nunca inventar resultado. 4. Não mover/renomear o cofre.
5. Nada destrutivo sem aprovação (exclusões, migrações, mudanças de caminho).
6. Não expor credenciais (webui.db contém hashes/chaves — não copiar para docs).
7. Nunca expor serviços fora de 127.0.0.1/tailnet; não usar Tailscale Funnel.
8. Funcionalidade > visual. Não investir na cena 3D até o núcleo estar estável.
9. Comunicação com a equipe em português do Brasil. Separar fato / hipótese / proposta.
10. Registrar decisões em `docs/DECISOES.md`.

## Armadilhas conhecidas
- Sem Git até 07/11/2026; backups eram cópias manuais em `backups/` (ignorado pelo lint).
- O teste de folder sync falha se o caminho temporário contiver `tmp` (bloqueio intencional).
- Filtro de categoria no chat exclui `_SELEBLO Capturas` (ver ESTADO_ATUAL).
- `package.json`/`README.md` ainda descrevem o projeto upstream "AI Office".

# Estado atual — auditoria de 07/11/2026

Método: leitura integral de `plugins/*.js`, configs e scripts; inspeção dos componentes React;
`npm ci` + lint + build + testes numa cópia isolada (Linux, Node 22); sondas próprias de busca e
de sincronização com cofre sintético; leitura somente-leitura de `OpenWebUI/data/webui.db`.
**Não verificado:** o cofre real (acesso não concedido nesta sessão), `%LOCALAPPDATA%\SELEBLO-OS`
(índice e logs), processos em execução, Ollama/modelos instalados, Tailscale, hardware.

Legenda: ✅ validado · 🟡 implementado sem validação suficiente · 🟠 parcial · ⚪ ausente · 🔴 falha confirmada · ⚫ obsoleto

## A. Inventário

| Componente | Onde | Estado | Evidência |
|---|---|---|---|
| Lint / build | `npm run lint`, `npm run build` | ✅ | 0 erros; build OK (bundle JS 817 kB, aviso de tamanho) |
| Testes automatizados | `plugins/*.test.js` (4 testes) | ✅ | 4/4 passam. Cobrem só captura de imagem, clip de navegador e folder sync. Busca e chat: **0 testes** |
| API local (plugin Vite) | `plugins/vaultPlugin.js` | 🟡 | Código coerente; restrição loopback + Host/Origin bem feita |
| Índice persistente | `plugins/knowledgeIndex.js` | 🟠 | Funciona; **🔴 perde termos raros em notas longas** (sonda) |
| Busca do RONIN | `retrieveDocuments` + `search` | 🟠 | Lexical com IDF; sem sinônimos/semântica ("custo por lead" ≠ "CPL") |
| Chat RONIN | `RoninChat.jsx` + `/chat` | 🟡 | Timeout, cancelamento, fallback e fontes implementados; não testado aqui (sem Ollama) |
| Análise IA em segundo plano | `knowledgeIndex.analyzeNext` | 🟡 | Pausa durante o chat; resultado marcado como "sugerido por IA" |
| Captura texto/ideia | `captureService.importText` | ✅ | teste 2 |
| Captura URL pública | `importWebPage` | 🟡 | Proteção SSRF sólida; sem teste |
| YouTube | `importYoutube` | 🟠 | Só legendas públicas; **prioriza legenda em inglês** antes de português |
| GitHub | `importGithub` | 🟠 | Só README + 1 arquivo; não analisa o repositório |
| PDF | `extractPdf` | 🟠 | Texto apenas, ≤100 páginas, ≤5 MiB; sem OCR |
| Imagem | `importFiles` | 🟠 | Preserva anexo + SHA-256; **sem OCR/descrição** (honesto) ✅ teste 1 |
| Vídeo/áudio local | folder sync | ⚪ | Só metadados; sem transcrição |
| Planilhas/DOCX | — | ⚪ | Extensões não aceitas |
| Captura de curso autenticado | bookmarklet + `/clip/inbox` | 🟡 | Usa texto visível da página aberta pelo usuário; não contorna login ✅ |
| Sincronização de pastas | `folderSyncService.js` | 🔴 | Edição gera duplicata; exclusão deixa órfã (sonda) |
| Memória por cliente/projeto | — | ⚪ | Tudo num índice global; sem entidades nem isolamento |
| Memória de conversa | — | ⚪ | Só as últimas 4 mensagens da sessão, no navegador |
| Cena 3D / 16 setores | `OfficeScene.js` (1.568 linhas), `knowledgeCategories.js` | ✅ | 16 setores = 16 pastas do cofre (`01`–`16`) |
| Acesso Tailscale | `vite.config.js`, script `.ps1` | 🟡 | Configurado no código (`<seu-pc>.<sua-tailnet>.ts.net:4173`); estado do serve não verificado |
| Autostart SELEBLO | `scripts/start-seleblo-preview.vbs/.ps1` | 🟡 | Script robusto (evita duplicata, health check); não sei se está na pasta Startup |
| Open WebUI | `SegundoCerebro-Sistema/Iniciar-WebUI.*`, `OpenWebUI/data` | 🟠 | Base `celeblo` (ID confere) com **10 arquivos, quase todos de teste**; último upload 17/10; 2 chats no total |
| oikb watch | `Iniciar-Sync.cmd` | 🟡 | Comando existe; base parada desde 17/10 sugere que não está rodando ou não sobe para lá |
| `processador_segundo_cerebro.py` | `SegundoCerebro-Sistema` | ⚫/🟡 | Terceiro pipeline de análise (qwen3:4b), escreve `_Analises IA` dentro do cofre; sem autostart |
| Instaladores V1–V4 | `SegundoCerebro-Sistema/Instalador-*` | ⚫ | Pacotes de patch antigos, superados pelo código atual |
| `backups/` (15 snapshots) | `SELEBLO-OS/backups` | 🟡 | Cópias manuais 15–18/10; mesma máquina; não substituem Git |
| `ai-office-main` | `C:\Users\Usuario\ai-office-main` | ⚫ | Upstream original intacto (30/03/2026) |
| Controle de versão | — | 🔴 | **Não há `.git`** |

## B. O que realmente funciona (com evidência)
- Build e lint limpos; 4 testes passam.
- Captura de ideia, de página de navegador com hierarquia de curso e de imagem (preservando original e sem inventar OCR).
- Indexação persistente fora do cofre, com detecção de alteração por tamanho/mtime + SHA-256.
- Busca lexical encontra termos presentes em notas curtas, inclusive plurais simples quando outros termos casam.
- Proteções de segurança da API (loopback, Host/Origin, limite de corpo, SSRF, token do clip com comparação em tempo constante).

## C. Quebrado ou incompleto (por criticidade)

### 🔴 C1 — Sincronização de pastas duplica e desatualiza conhecimento
- **Evidência:** sonda `foldersync.mjs`: original "Verba R$ 3.000" → editado para "R$ 5.000" → 2 notas; busca devolve **as duas**. Após apagar o original, a nota continua.
- **Impacto:** o RONIN pode responder com valor antigo de cliente — o pior tipo de erro para o negócio.
- **Correção:** chave estável por arquivo de origem (hash do caminho) → atualizar a mesma nota; marcar como `origem_removida` quando o original sumir (sem apagar).
- **Risco:** baixo; altera só notas em `_SELEBLO Capturas` geradas por sync.

### 🔴 C2 — Termos raros somem do índice em notas longas
- **Evidência:** `createRecord` guarda só os 1.800 termos mais frequentes. Sonda: nota longa com "Zeiss" no fim → busca "cliente Zeiss" retorna **nada**.
- **Impacto:** PDFs e transcrições (até 120 mil caracteres) ficam parcialmente invisíveis; justamente nomes próprios (clientes, marcas) são os primeiros cortados.
- **Correção:** indexar por trechos (chunks) com todos os termos, em vez de top-N por nota.
- **Verificação:** a mesma sonda passa a encontrar "Zeiss".

### 🔴 C3 — Sem Git
- **Impacto:** nenhuma rastreabilidade; backups manuais na mesma máquina.
- **Correção:** `git init` + `.gitignore` (excluindo `node_modules`, `dist`, `backups`) + commit inicial; repositório privado remoto opcional.

### 🟠 C4 — Filtro de categoria esconde todas as capturas
- `document.category` = primeira pasta do caminho → capturas ficam em `_SELEBLO Capturas` e nunca aparecem ao filtrar "Clientes".

### 🟠 C5 — Busca só lexical
- "custo por lead" não encontra nota que diz "CPL". Sem stemming, sinônimos ou embeddings.

### 🟠 C6 — Três pipelines de IA sobre o mesmo cofre
- SELEBLO (qwen2.5:3b), Open WebUI+oikb (embeddings próprios) e o script Python (qwen3:4b). Disputam a mesma CPU/GPU e o Python escreve dentro do cofre. Open WebUI está praticamente sem uso.

### 🟠 C7 — YouTube prefere inglês
- `importYoutube` escolhe primeiro `languageCode` "en". Para conteúdo brasileiro, pode trazer tradução automática.

### 🟠 C8 — Backend acoplado ao Vite
- Funciona, mas o servidor de produto é `vite preview`. Aceitável agora; vira limitação ao adicionar fila de jobs, OCR, transcrição.

### 🟠 C9 — Escrita do índice inteiro a cada mudança
- `save()` reescreve o JSON completo a cada mudança de estado de análise. Com 2.500 notas fica pesado; não medido.

### 🟡 C10 — Documentação desatualizada
- `README.md` e `package.json` ainda são do "AI Office" (autor, Vercel, agentes fictícios). Comentário "Somente leitura" no plugin é falso desde a captura.

### 🟡 C11 — Sem autenticação além da tailnet
- Qualquer dispositivo com acesso à tailnet pode capturar, abrir o seletor de pastas no PC e abrir arquivos no Explorer. Ok para tailnet de uma pessoa; precisa revisão se a equipe entrar.

### Comparação com o histórico
| Histórico | Hoje no código |
|---|---|
| Busca limitada a ~230 caracteres | 230 é só o tamanho do **trecho exibido**; a busca usa o índice inteiro |
| Contexto ~2.400 caracteres/documento | 1.800/documento, 3 documentos, 5.200 total, `num_ctx` 4096 |
| Divergência modelo do prompt × modelo real | Corrigido: prompt recebe o nome real do modelo |
| Sem retry após timeout | Intencional: fallback só em erro imediato, não após timeout |
| Cancelamento incompleto | Corrigido no servidor (aborta ao fechar conexão) |
| "Sincronização ~45 s" | 45 s é o **intervalo** do folder sync, não tempo de execução |
| 83 s → 9,6–12,2 s | Não reproduzido (sem Ollama nesta sessão) |

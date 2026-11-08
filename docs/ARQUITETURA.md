# Arquitetura (real, 07/11/2026)

```
Navegador (PC ou celular via Tailscale HTTPS)
  │  React: App.jsx → OfficeScene (3D) · KnowledgePanel (biblioteca/captura) · RoninChat
  ▼
vite preview 127.0.0.1:4173  ← tailscale serve (tailnet-only)
  └─ plugin seleblo-local-vault (plugins/vaultPlugin.js)  /api/seleblo/*
       ├─ knowledgeIndex  → %LOCALAPPDATA%\SELEBLO-OS\knowledge-index.json
       │     varredura 15 s · análise Ollama em fila (1 a cada 8 s)
       ├─ captureService  → grava <cofre>\_SELEBLO Capturas\<uuid>.md (+ anexo)
       ├─ folderSyncService (45 s) → pastas externas → captureService
       └─ /chat → Ollama 127.0.0.1:11434 (qwen2.5:3b → qwen3:4b)
Cofre Obsidian  C:\Users\Usuario\Downloads\2\SEGUNDO SELEBLO  (16 pastas 01–16)

Paralelo, independente do SELEBLO:
  Open WebUI 127.0.0.1:8080 (uvx, dados em ~/OpenWebUI/data) ← oikb watch (cofre → base "celeblo")
  processador_segundo_cerebro.py (manual) → escreve "16 - Caixa de Entrada/_Analises IA"
```

## Caminho de uma informação até a resposta
1. **Entrada:** nota escrita no Obsidian, ou captura (`POST /capture`), ou bookmarklet (`/clip/inbox`), ou arquivo em pasta monitorada.
2. **Gravação:** capturas viram nota Markdown nova com frontmatter (`capture_id`, `capture_content_sha256`, `capture_kind`, `capture_source`) e seção `## Conteúdo capturado`.
3. **Indexação:** em até 15 s o índice lê a nota, calcula SHA-256, conta termos (top 1.800), extrai títulos/URLs/links `[[ ]]`.
4. **Análise (opcional):** o Ollama gera título, tipo, resumo, palavras-chave e relações sugeridas; fica marcado como sugestão de IA.
5. **Pergunta:** o RONIN tokeniza, remove stopwords, pontua documentos (IDF + cobertura + metadados), relê o arquivo atual, confere o hash, escolhe os melhores trechos de 700 caracteres.
6. **Contexto:** até 3 documentos / 5.200 caracteres + 4 mensagens de histórico → Ollama (`num_ctx` 4096, até 384 tokens de resposta).
7. **Resposta:** texto + lista de fontes = exatamente os documentos enviados ao modelo + tempos medidos.

## Direção recomendada (incremental)
- Manter Obsidian como fonte da verdade e o índice fora do cofre.
- Manter o plugin Vite por ora; extrair para um processo Node próprio só quando entrar fila pesada (OCR/transcrição).
- Evoluir o índice para **trechos** (chunks) + busca híbrida: BM25 nos trechos + embeddings locais via Ollama, guardados em SQLite.
- Ter **um** pipeline de IA: SELEBLO. Open WebUI fica como interface opcional, sem sincronização automática, até ser decidido.
- Memória por cliente: começar pela convenção de pastas/frontmatter (`cliente:`) e filtro na busca, não por banco novo.

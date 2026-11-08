# Operação (extraído dos scripts; NÃO verificado no PC em 07/11/2026)

| Serviço | Como inicia | Endereço | Logs |
|---|---|---|---|
| SELEBLO (preview + API + índice) | `scripts/start-seleblo-preview.vbs` → `.ps1` → `node vite preview` | 127.0.0.1:4173 | `%LOCALAPPDATA%\SELEBLO-OS\preview-*.log` |
| Acesso privado | `tailscale serve --bg 4173` (persistente) | https://<seu-pc>.<sua-tailnet>.ts.net | Tailscale |
| Ollama | serviço do Ollama | 127.0.0.1:11434 (confirmar `OLLAMA_HOST`) | Ollama |
| Open WebUI | `SegundoCerebro-Sistema/Iniciar-WebUI.vbs` → `uvx --offline open-webui serve` | 127.0.0.1:8080 | nenhum configurado |
| oikb | `SegundoCerebro-Sistema/Iniciar-Sync.vbs` → `oikb watch <cofre> --kb-id 302e2bfe-…` | — | nenhum (janela oculta com `pause`) |

## Dados persistentes (fazer backup)
1. Cofre: `C:\Users\Usuario\Downloads\2\SEGUNDO SELEBLO` (inclui `_SELEBLO Capturas`).
2. Índice: `%LOCALAPPDATA%\SELEBLO-OS\knowledge-index.json` (reconstruível, mas contém análises IA e pastas monitoradas).
3. Open WebUI: `C:\Users\Usuario\OpenWebUI\data` (contém credenciais — backup cifrado).
4. Código: `C:\Users\Usuario\SELEBLO-OS` (sem `node_modules`/`dist`).

## Verificação rápida de saúde
`Invoke-RestMethod http://127.0.0.1:4173/api/seleblo/index` → `status: ready`
`Invoke-RestMethod http://127.0.0.1:4173/api/seleblo/status` → `available: true`

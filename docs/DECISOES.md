# Registro de decisões

Formato: data · decisão · motivo · status.

- 15–18/10/2026 · API local como plugin do Vite, sempre em 127.0.0.1 · evitar segundo servidor e exposição de rede · em vigor
- 15–18/10/2026 · Índice persistente fora do cofre (`%LOCALAPPDATA%\SELEBLO-OS`) · não poluir nem alterar o Obsidian · em vigor
- 15–18/10/2026 · Capturas como notas novas em `_SELEBLO Capturas`, nunca editando notas existentes · preservar originais · em vigor
- 15–18/10/2026 · Modelo primário `qwen2.5:3b`, fallback `qwen3:4b`; sem fallback após timeout · latência previsível · em vigor, reavaliar no passo 5
- 15–18/10/2026 · Sem OCR/transcrição: imagens e mídia guardam só metadados e hash · não inventar conteúdo · em vigor
- 15–18/10/2026 · Acesso remoto apenas via `tailscale serve` (sem Funnel, sem port forward) · privacidade · em vigor
- 07/11/2026 · Auditoria: Claude Code como ferramenta de engenharia, não como motor de inferência do RONIN · prompt mestre · em vigor
- PENDENTE · Destino do Open WebUI + oikb + `processador_segundo_cerebro.py` · três pipelines sobre o mesmo cofre · aguardando decisão

## 2026-11-08 — Visual pixel-art no lugar da cena 3D
- A cena 3D herdada do "AI Office" (escritório cinza, personagens fictícios, ticker e textos em inglês) saiu da tela.
- Novo `src/pixel/EscritorioPixel.jsx`: escritório pixel-art com 16 mesas = 16 pastas do cofre, contagem de notas por pasta,
  clique na mesa abre a pasta. O RONIN anda até a estante enquanto pensa e senta nas mesas das pastas usadas na resposta.
- Gráficos do projeto Pixel Agents (MIT) e personagens Metro City (JIK-A-4); créditos em `public/pixel/CREDITOS.md`.
- `src/scene/OfficeScene.js` continua no repositório, sem uso, para poder voltar atrás.

## 2026-11-08 — Ilha de blocos com o robô RONIN vira a tela principal (aprovado pelo usuário)
- `src/mundo/MundoVoxel.jsx`: ilha flutuante estilo voxel, 16 terrenos = 16 pastas, farol na praça,
  robô RobotExpressive (CC0) que anda, acena, faz joinha e dança conforme o chat do RONIN.
- O pixel-art continua disponível em `?visual=pixel`. Créditos em `public/mundo/CREDITOS.md`.

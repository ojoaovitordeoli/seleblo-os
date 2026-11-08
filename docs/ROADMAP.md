# Roadmap — próximos 10 passos (ordem de prioridade)

| # | Passo | Critério objetivo de conclusão |
|---|---|---|
| 1 | **Git + backup verificável** do repositório e do cofre | `git log` com commit inicial; cópia do cofre e do `knowledge-index.json` restaurada com sucesso em outra pasta (contagem de `.md` igual) |
| 2 | **Corrigir folder sync** (C1): atualizar a mesma nota quando o original muda; marcar `origem_removida` quando some | Teste novo: editar original → continua 1 nota com valor novo; apagar → nota marcada, não duplicada |
| 3 | **Corrigir perda de termos** (C2): índice por trechos com todos os termos | Teste novo: termo raro no fim de nota de 100 mil caracteres é encontrado |
| 4 | **Conjunto de avaliação do RONIN**: 30 perguntas reais com documento-resposta esperado | Script imprime acerto@3 da busca e tempo; resultado registrado em `docs/TESTES.md` |
| 5 | **Medir no PC real** (hardware, modelos, latência com cofre real) | Tabela com p50/p90 de tempo total para as 30 perguntas, por modelo |
| 6 | **Filtro de categoria incluir capturas** (C4) + campo `cliente:` no frontmatter | Filtrar "Clientes" retorna capturas classificadas; teste automatizado |
| 7 | **Busca híbrida** (embeddings locais via Ollama + BM25 por trecho) | Acerto@3 no conjunto do passo 4 melhora ≥15 pontos sem p90 piorar >2 s |
| 8 | **Decidir o destino do Open WebUI/oikb e do script Python** (C6) | Decisão em `DECISOES.md`; processos não usados desligados do autostart |
| 9 | **YouTube em pt-BR primeiro** (C7) + DOCX/XLSX na captura | Teste com vídeo de legenda pt; DOCX e XLSX importam texto |
| 10 | **Reescrever README/package.json** para o SELEBLO (C10) e criar `OPERACAO.md` verificado | Alguém sem contexto sobe o sistema seguindo só o README |

Depois disso: OCR (Tesseract local), transcrição local (whisper.cpp), memória por cliente com isolamento, reavaliar o 3D.

## Primeira entrega recomendada
**Passos 1 + 2 juntos.** O Git protege tudo que vem depois; a correção do folder sync elimina a
única falha confirmada que faz o RONIN responder **errado com fonte** (dado antigo de cliente).
Melhoria mensurável: número de notas duplicadas por arquivo de origem = 0 (hoje cresce a cada edição).
Antes de corrigir, medir quantas duplicatas já existem em `_SELEBLO Capturas` no cofre real.

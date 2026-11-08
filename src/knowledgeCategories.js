export const KNOWLEDGE_DISTRICTS = [
  {
    x: -8, z: -3, title: 'INTELIGÊNCIA', color: '#0DEEF3',
    categories: [
      { id: '01 - Regras e Instrucoes', label: 'REGRAS', title: 'Regras e instruções', description: 'Regras de trabalho e padrões da IA', symbol: '◈', color: '#0DEEF3' },
      { id: '02 - Skills e Agentes', label: 'AGENTES', title: 'Skills e agentes', description: 'Agentes, ferramentas e habilidades', symbol: '⬡', color: '#A59BFF' },
    ],
  },
  {
    x: -4, z: -3, title: 'LABORATÓRIO', color: '#53E6AC',
    categories: [
      { id: '03 - GitHub e Ferramentas', label: 'GITHUB', title: 'GitHub e ferramentas', description: 'Repositórios e softwares úteis', symbol: '⌘', color: '#51E6AC' },
      { id: '04 - Inspiracoes', label: 'INSPIRAÇÕES', title: 'Inspirações', description: 'Vídeos, anúncios, sites e design', symbol: '✦', color: '#FF83BE' },
    ],
  },
  {
    x: -8, z: 1.5, title: 'ESTÚDIO CRIATIVO', color: '#79C7FF',
    categories: [
      { id: '05 - Copies', label: 'COPYS', title: 'Copys', description: 'Biblioteca de textos e anúncios', symbol: '✎', color: '#FFD186' },
      { id: '06 - Roteiros', label: 'ROTEIROS', title: 'Roteiros', description: 'Roteiros de vídeos e atendimento', symbol: '▤', color: '#79C8FF' },
    ],
  },
  {
    x: -4, z: 1.5, title: 'RELACIONAMENTO', color: '#E88EFF',
    categories: [
      { id: '07 - Clientes', label: 'CLIENTES', title: 'Clientes', description: 'Materiais e conhecimento de clientes', symbol: '◎', color: '#50DDC4' },
      { id: '08 - Personas', label: 'PERSONAS', title: 'Personas', description: 'Públicos, avatares e comportamentos', symbol: '♙', color: '#D594FF' },
    ],
  },
  {
    x: 0, z: -3, title: 'PRODUÇÃO', color: '#7CB6FF',
    categories: [
      { id: '09 - Projetos', label: 'PROJETOS', title: 'Projetos', description: 'Projetos em produção e concluídos', symbol: '▣', color: '#80B8FF' },
      { id: '10 - Estudos e Conhecimentos', label: 'ESTUDOS', title: 'Estudos', description: 'Pesquisas, estudos e aprendizados', symbol: '◉', color: '#CDE897' },
    ],
  },
  {
    x: 0, z: 1.5, title: 'AUTOMAÇÃO', color: '#FFC480',
    categories: [
      { id: '11 - Prompts', label: 'PROMPTS', title: 'Prompts', description: 'Comandos e instruções testadas', symbol: '⌁', color: '#B7ACFF' },
      { id: '12 - Automacoes', label: 'AUTOMAÇÕES', title: 'Automações', description: 'Workflows, scripts e integrações', symbol: '⚡', color: '#FFC480' },
    ],
  },
  {
    x: -8, z: 6, title: 'ACERVO', color: '#80E1CB',
    categories: [
      { id: '13 - Biblioteca de Recursos', label: 'RECURSOS', title: 'Biblioteca de recursos', description: 'Packs, modelos, presets e assets', symbol: '◫', color: '#82E1CB' },
      { id: '14 - Estrategias e Metodos', label: 'MÉTODOS', title: 'Estratégias e métodos', description: 'Funis e métodos de trabalho', symbol: '◇', color: '#FF94C3' },
    ],
  },
  {
    x: -4, z: 6, title: 'OPERAÇÃO', color: '#FF9DC7',
    categories: [
      { id: '15 - Resultados e Cases', label: 'RESULTADOS', title: 'Resultados e cases', description: 'Testes e aprendizados de campanhas', symbol: '▥', color: '#9FD5FF' },
      { id: '16 - Caixa de Entrada', label: 'ENTRADA', title: 'Caixa de entrada', description: 'Referências aguardando organização', symbol: '↓', color: '#FFE3A5' },
    ],
  },
]

export const KNOWLEDGE_CATEGORIES = KNOWLEDGE_DISTRICTS.flatMap(district =>
  district.categories.map(category => ({ ...category, district: district.title, districtColor: district.color })),
)

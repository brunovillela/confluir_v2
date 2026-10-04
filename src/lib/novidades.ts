/**
 * "O QUE HÁ DE NOVO" (onda 2, U11): o que cada entrega mudou para quem usa,
 * em linguagem de usuário. A mais recente fica primeiro; o `id` (a data) é o
 * que o navegador guarda para avisar uma vez só. Acrescentar uma entrada a
 * cada deploy com mudança visível; detalhe técnico fica no git.
 */
export type Novidade = {
  /** Data da entrega (AAAA-MM-DD), também o identificador. */
  id: string
  titulo: string
  itens: string[]
}

export const NOVIDADES: Novidade[] = [
  {
    id: "2026-10-05",
    titulo: "Portal do associado no celular",
    itens: [
      "Carteirinha digital com QR Code verificável por qualquer portaria ou convênio, e declaração de filiação em PDF na hora.",
      "Minha contribuição: os descontos repassados mês a mês, a última contribuição e a situação da pessoa pela regra da entidade.",
      "Portal feito para o celular: barra de navegação inferior, página atual marcada e as tabelas viram cards em telas pequenas.",
      "Avisos no portal: sino do filiado e e-mail por preferência quando o hotel reserva o cupom, abre vaga na lista de espera, a inscrição é avaliada, o evento muda ou uma votação abre.",
      "Confluir no celular: instale como app (Adicionar à tela inicial), ligue \"Receber no celular\" em Meu perfil → Avisos e os avisos do sino chegam como notificação. Tela Aprovar com ordens, documentos e diárias em cards de um toque.",
      "Home do diretor: o que espera a sua decisão, a agenda da semana, votações, negociações, os números da entidade e os seus pedidos de viagem e diária, em uma tela só.",
      "Atendimento pelo portal: o filiado abre solicitação (jurídico, saúde, cadastro, reembolso, reclamação, outro) com anexo e acompanha a resposta; no painel ela vira Demanda com prazo, e a equipe responde pela Demanda ou por Filiados → Atendimentos, com indicadores de tempo de resposta.",
    ],
  },
  {
    id: "2026-10-04",
    titulo: "O painel passa a vir até você",
    itens: [
      "Caixa de entrada na home: tudo que espera a sua decisão, com contagem e atalho para cada fila. O contador ao lado do sino se atualiza sozinho.",
      "Avisos a quem precisa agir: pedido de férias, diária, reembolso, falta, ficha de filiação, espaço, viagem, ordem na sua alçada e fornecimento a receber chegam na hora, pelo sino, por e-mail e pelo Telegram. Lembrete diário do que ficou parado.",
      "Resumo diário de vencimentos: contratos, acordos, CNH, seguro, ASO, férias, treinamentos, faturas, ordens, mandatos e convênios vencendo nas áreas que você cuida.",
      "Meu perfil → Avisos: escolha, tipo a tipo, o que recebe por e-mail e por Telegram.",
      "Busca global com Ctrl+K: filiados, fornecedores, usuários, ordens, contratos, veículos e qualquer página do menu.",
      "Confirmações com contexto no lugar da caixa cinza do navegador; erros de formulário apontam o campo.",
      "\"Minha área\" no topo do menu lateral; menu de ajuda (?) no cabeçalho com o artigo desta tela, as novidades e um canal para relatar problemas ou sugerir.",
    ],
  },
  {
    id: "2026-10-03",
    titulo: "Conta mais protegida",
    itens: [
      "Verificação em duas etapas com aplicativo autenticador, em Meu perfil → Segurança da conta.",
      "Confirmação \"não sou um robô\" no login e nos acessos públicos, e bloqueio temporário após tentativas erradas de senha.",
      "Trilha de auditoria: quem alterou o quê e quando, nas tabelas sensíveis (Institucional → Auditoria).",
      "LGPD: o filiado baixa os próprios dados no portal; a gestão atende pedidos de exclusão com anonimização.",
      "Arquivos enviados são conferidos pelo conteúdo, não só pelo nome.",
    ],
  },
]

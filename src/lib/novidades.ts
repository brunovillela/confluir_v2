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
    id: "2026-10-19",
    titulo: "Privacidade e integridade das votações",
    itens: [
      "Política de privacidade da entidade em /privacidade, com o encarregado (DPO) e o contato preenchidos em Institucional → Organização. As telas de acesso, a ficha de filiação, a votação, as inscrições e a oposição passam a mostrar o link para ela.",
      "Institucional → Auditoria ganhou as abas Exportações e API: quem baixou listas com dados pessoais (planilhas, PDFs, CNAB), quando e quantas linhas, e cada consulta feita pela API pública. A chave da API agora tem escopos por tipo de dado e não é aceita no endereço (?chave=).",
      "Institucional → LGPD: prazos de guarda dos dados. Todo mês o sistema simula o que sairia em cada regra (fotos de inscrição em eventos, registros de tentativas de acesso, fichas de filiação não concluídas); só apaga de verdade a regra que a entidade ligar. Pessoas em processo podem ser bloqueadas contra qualquer descarte.",
      "Pedidos de saúde feitos no portal chegam só à equipe de saúde, com aviso genérico, sem nome nem CPF.",
      "Votações: no encerramento, o resultado é congelado, ganha um código de conferência (SHA-256) publicado na apuração, no relatório e no portal, e a votação é conferida automaticamente. Reabrir a apuração exige motivo e fica no livro da apuração. Os contatos que os eleitores deixam para receber o link são apagados 90 dias após a apuração (prazo ajustável na rodada), e o voto em separado é desligado da pessoa ao encerrar.",
    ],
  },
  {
    id: "2026-10-18",
    titulo: "Área do associado",
    itens: [
      "Filiados → Área do associado: habilite, suspenda ou desabilite cada parte do portal do associado — carteirinha, contribuição, hospedagem, convênios, saúde, votação, eventos, agenda, notícias, atendimento, O sindicato —, com uma mensagem ao associado e, se quiser, a data em que a parte volta sozinha. Suspensa, a parte fica para consulta e nada é enviado por ela; desabilitada, sai do menu, do Início, da ajuda e dos avisos.",
      "O portal inteiro também: em modo de consulta (o associado entra e vê tudo, mas nada é gravado) ou fora do ar (a entrada mostra a mensagem e os canais da entidade). A contribuição assistencial, a desistência da filiação coletiva, o link pessoal de voto e a verificação da carteirinha nunca param.",
      "Configure cada parte: o que o associado pode alterar em Meu cadastro, a declaração e o extrato em PDF, o prazo do Pix, os assuntos, os anexos e o prazo para reabrir do Atendimento, o resultado no histórico da Votação, o cancelamento de inscrição em eventos, a diretoria em O sindicato, o aviso da tela de entrada e os atalhos da barra do celular, entre outras. Tudo começa no comportamento de antes.",
      "Primeiro acesso: antes de usar o portal, o associado aceita o termo de privacidade em vigor e completa os dados que a entidade exige (e-mail, telefone, endereço, contato de emergência). Vale também para quem já usa o portal, no próximo acesso, e de novo quando um termo novo é publicado.",
      "Conferir como o associado vê: abre o portal de um filiado em somente leitura, com cada parte do jeito que ele a vê.",
    ],
  },
  {
    id: "2026-10-06",
    titulo: "Conciliação bancária",
    itens: [
      "API e webhooks (Institucional): chaves de leitura para o contador, o Power BI e o site (filiados, arrecadação, despesas, agenda, eventos) e webhooks assinados que avisam outros sistemas quando uma ordem é paga, uma filiação é aprovada, um cupom é reservado ou uma contribuição Pix entra — com reenvio automático e log de entregas.",
      "Assinatura gov.br verificada: ao receber a ficha de filiação, a carta de oposição ou a minuta assinada em PDF, o sistema confere integridade, assinatura, cadeia ICP-Brasil, validade e o CPF do signatário contra o cadastro, e mostra o selo na avaliação.",
      "Filiados → Cobranças Pix: quem paga a contribuição por Pix recebe, todo mês, um QR Code e um código copia e cola no portal (Contribuição), com aviso; a baixa vem do extrato (identificador no histórico) ou da tela, e vira recebimento na remessa da competência.",
      "Financeiro → Remessas bancárias: cadastre a conta da entidade e gere o arquivo CNAB 240 (Pix por chave, crédito em conta, TED e boleto) com as ordens a pagar; o retorno do banco marca cada ordem paga ou rejeitada com o motivo.",
      "Financeiro → Conciliação bancária: importe o extrato em OFX ou CSV e cada lançamento é casado com a ordem paga ou com o depósito da fonte pagadora — sozinho quando há um único candidato, com um clique quando há mais. Crédito sem depósito vira o depósito da fonte na hora; tarifas e transferências internas podem ser ignoradas com o motivo.",
    ],
  },
  {
    id: "2026-10-05",
    titulo: "Portal do associado no celular",
    itens: [
      "Carteirinha digital com QR Code verificável por qualquer portaria ou convênio, e declaração de filiação em PDF na hora.",
      "Minha contribuição: os descontos repassados mês a mês, a última contribuição e a situação da pessoa pela regra da entidade.",
      "Portal feito para o celular: barra de navegação inferior, página atual marcada e as tabelas viram cards em telas pequenas.",
      "Avisos no portal: sino do filiado e e-mail por preferência quando o hotel reserva o cupom, abre vaga na lista de espera, a inscrição é avaliada, o evento muda ou uma votação abre.",
      "Confluir no celular: instale como app (Adicionar à tela inicial), ligue \"Receber no celular\" em Meu perfil → Avisos e os avisos do sino chegam como notificação. Tela Aprovar com ordens, documentos e diárias em cards de um toque.",
      "Telegram com botões: a ordem que aguarda a sua autorização chega com Aprovar e Devolver na própria conversa, e /aprovar lista as ordens na sua alçada.",
      "Churn e retenção (Indicadores): saídas e entradas por mês, taxa por fonte pagadora, tempo médio de filiação e motivos de desfiliação em lista fechada, com registro do motivo na ficha.",
      "Custos consolidados (Indicadores): frota por veículo e por km, hospedagem por hotel, viagens e diárias por pessoa e por departamento.",
      "Exportação contábil (Financeiro): despesas pagas e receitas do período em XLSX, com centro de custo, departamento, favorecido e CNPJ/CPF.",
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

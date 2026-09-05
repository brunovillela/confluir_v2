/**
 * Fonte única de verdade dos módulos do painel: rota, rótulo, ícone e a
 * chave de permissão correspondente na tabela `permissoes`.
 *
 * Cada `chave` corresponde a uma coluna boolean da tabela `permissoes`
 * (nomes conferidos no banco real em 2026-07-12). Sidebar, dashboard e
 * proxy derivam tudo deste arquivo.
 */

export type Permissoes = Record<string, unknown>

export type Modulo = {
  titulo: string
  href: string
  icone: string
  descricao: string
  /** Coluna da tabela `permissoes` que libera o módulo. `null` = qualquer funcionário autenticado. */
  chave: string | null
  /** Chaves alternativas: possuir qualquer uma delas também libera o módulo. */
  chavesAlternativas?: string[]
  /** Sub-rota com permissão própria — participa do gate do proxy, mas não da navegação. */
  oculto?: boolean
}

export const MODULOS: Modulo[] = [
  {
    titulo: "Painel",
    href: "/painel",
    icone: "LayoutDashboard",
    descricao: "Visão geral do sistema",
    chave: null,
  },
  {
    titulo: "Filiados",
    href: "/painel/filiados",
    icone: "Users",
    descricao: "Cadastro, vínculos e situação dos associados",
    chave: "filiacao_filiados",
    chavesAlternativas: ["filiacao_gestao", "filiacao_receitas"],
  },
  {
    titulo: "Financeiro",
    href: "/painel/financeiro",
    icone: "Landmark",
    descricao: "Ordens de pagamento, caixa, receitas e despesas",
    chave: "financeiro_caixa",
    chavesAlternativas: ["financeiro_pagamento", "financeiro_leitura"],
  },
  {
    titulo: "Ordens de pagamento",
    href: "/painel/financeiro/ordens",
    icone: "Receipt",
    descricao: "Receitas e despesas com autorização e pagamento",
    chave: "financeiro_pagamento",
    chavesAlternativas: ["financeiro_leitura"],
    oculto: true,
  },
  {
    titulo: "Contas de caixa",
    href: "/painel/financeiro/caixas",
    icone: "Wallet",
    descricao: "Contas de dinheiro em espécie, aportes e prestações",
    chave: "financeiro_caixa",
    chavesAlternativas: ["financeiro_caixa_admin", "financeiro_leitura"],
    oculto: true,
  },
  {
    titulo: "Pessoal",
    href: "/painel/pessoal",
    icone: "BriefcaseBusiness",
    descricao: "Funcionários, contracheques, ponto e férias",
    chave: "pessoal_gestao",
    // Chaves de seção do Bubble liberam o hub; cada sub-rota abaixo tem gate próprio.
    chavesAlternativas: [
      "pessoal_contracheque",
      "pessoal_anuenios",
      "pessoal_niveis_salariais",
      "pessoal_diarias",
      "pessoal_aso",
      "pessoal_informes_rendimentos",
    ],
  },
  {
    titulo: "Informes de rendimentos",
    href: "/painel/pessoal/informes",
    icone: "BriefcaseBusiness",
    descricao: "Remessas anuais de informes para o imposto de renda",
    chave: "pessoal_gestao",
    chavesAlternativas: ["pessoal_informes_rendimentos"],
    oculto: true,
  },
  {
    titulo: "Reembolsos do ACT",
    href: "/painel/pessoal/reembolsos",
    icone: "BriefcaseBusiness",
    descricao: "Reembolsos do acordo coletivo pagos em contracheque",
    chave: "pessoal_gestao",
    oculto: true,
  },
  {
    titulo: "Treinamentos",
    href: "/painel/pessoal/treinamentos",
    icone: "BriefcaseBusiness",
    descricao: "Catálogo de treinamentos, alunos e certificados",
    chave: "pessoal_gestao",
    oculto: true,
  },
  {
    titulo: "Atribuições e SST",
    href: "/painel/pessoal/atribuicoes",
    icone: "BriefcaseBusiness",
    descricao:
      "Atividades, perigos e riscos ocupacionais, matriz de treinamento e revalidação",
    chave: "pessoal_gestao",
    oculto: true,
  },
  {
    titulo: "Férias",
    href: "/painel/pessoal/ferias",
    icone: "BriefcaseBusiness",
    descricao: "Períodos aquisitivos, gozos e autorizações",
    chave: "pessoal_gestao",
    oculto: true,
  },
  {
    titulo: "Atestados e ausências",
    href: "/painel/pessoal/atestados",
    icone: "BriefcaseBusiness",
    descricao: "Atestados médicos e afastamentos dos funcionários",
    chave: "pessoal_gestao",
    oculto: true,
  },
  {
    titulo: "ASOs",
    href: "/painel/pessoal/aso",
    icone: "BriefcaseBusiness",
    descricao: "Atestados de saúde ocupacional",
    chave: "pessoal_gestao",
    chavesAlternativas: ["pessoal_aso"],
    oculto: true,
  },
  {
    titulo: "Anuênios",
    href: "/painel/pessoal/anuenios",
    icone: "BriefcaseBusiness",
    descricao: "Alíquota por ano de casa sobre o salário básico",
    chave: "pessoal_gestao",
    chavesAlternativas: ["pessoal_anuenios"],
    oculto: true,
  },
  {
    titulo: "Níveis salariais",
    href: "/painel/pessoal/niveis",
    icone: "BriefcaseBusiness",
    descricao: "Degraus salariais do acordo coletivo",
    chave: "pessoal_gestao",
    chavesAlternativas: ["pessoal_niveis_salariais"],
    oculto: true,
  },
  {
    titulo: "Reajuste salarial",
    href: "/painel/pessoal/niveis/reajuste",
    icone: "BriefcaseBusiness",
    descricao: "Reajuste linear de toda a tabela salarial",
    chave: "pessoal_gestao",
    oculto: true,
  },
  {
    titulo: "Diárias",
    href: "/painel/pessoal/diarias",
    icone: "BriefcaseBusiness",
    descricao: "Solicitações de diárias e avaliação",
    chave: "pessoal_gestao",
    chavesAlternativas: ["pessoal_diarias"],
    oculto: true,
  },
  {
    titulo: "Compras",
    href: "/painel/compras",
    icone: "ShoppingCart",
    descricao: "Solicitações, cotações e aprovações por alçada",
    chave: "aquisicoes_compras",
    // Qualquer papel do fluxo de aquisições abre o hub; cada sub-rota
    // abaixo tem gate próprio.
    chavesAlternativas: [
      "aquisicoes_compras_edicao",
      "aquisicoes_avaliacoes",
      "aquisicoes_recebimentos",
      "aquisicoes_fornecedores",
      "aquisicoes_contratos",
    ],
  },
  {
    titulo: "Nova compra",
    href: "/painel/compras/nova",
    icone: "ShoppingCart",
    descricao: "Registrar aquisição direta ou solicitação via Compras",
    chave: "aquisicoes_compras_edicao",
    oculto: true,
  },
  {
    titulo: "Avaliações de compras",
    href: "/painel/compras/avaliacoes",
    icone: "ShoppingCart",
    descricao: "Aprovação de ordens de compra por alçada",
    chave: "aquisicoes_avaliacoes",
    oculto: true,
  },
  {
    titulo: "Recebimentos",
    href: "/painel/compras/recebimentos",
    icone: "ShoppingCart",
    descricao: "Fornecimentos comprados aguardando chegada",
    chave: "aquisicoes_recebimentos",
    chavesAlternativas: ["aquisicoes_compras_edicao"],
    oculto: true,
  },
  {
    titulo: "Fornecedores",
    href: "/painel/compras/fornecedores",
    icone: "ShoppingCart",
    descricao: "Consulta de fornecedores cadastrados",
    chave: "aquisicoes_fornecedores",
    chavesAlternativas: ["aquisicoes_compras_edicao"],
    oculto: true,
  },
  {
    titulo: "Veículos",
    href: "/painel/veiculos",
    icone: "Car",
    descricao: "Frota, agendamentos, abastecimentos e infrações",
    chave: "veiculos",
    chavesAlternativas: ["veiculos_gestao"],
  },
  {
    titulo: "Agendamentos de veículos",
    href: "/painel/veiculos/agendamentos",
    icone: "Car",
    descricao: "Solicitações de veículo, retiradas e devoluções",
    chave: "veiculos",
    chavesAlternativas: ["veiculos_gestao"],
    oculto: true,
  },
  {
    titulo: "Abastecimentos",
    href: "/painel/veiculos/abastecimentos",
    icone: "Car",
    descricao: "Lançamentos e importação de fatura de combustível",
    chave: "veiculos_gestao",
    oculto: true,
  },
  {
    titulo: "Infrações de trânsito",
    href: "/painel/veiculos/infracoes",
    icone: "Car",
    descricao: "Multas, justificativas e cobranças aos condutores",
    chave: "veiculos",
    chavesAlternativas: ["veiculos_gestao"],
    oculto: true,
  },
  {
    titulo: "Manutenções",
    href: "/painel/veiculos/manutencoes",
    icone: "Wrench",
    descricao: "Prontuário e preventivas programadas",
    chave: "veiculos",
    chavesAlternativas: ["veiculos_gestao"],
    oculto: true,
  },
  {
    titulo: "Checklist da frota",
    href: "/painel/veiculos/checklists",
    icone: "ClipboardCheck",
    descricao: "Verificação periódica dos veículos",
    chave: "veiculos",
    chavesAlternativas: ["veiculos_gestao"],
    oculto: true,
  },
  {
    titulo: "Condutores",
    href: "/painel/veiculos/condutores",
    icone: "Car",
    descricao: "Cadastro de CNH e autorização para dirigir",
    chave: "veiculos_gestao",
    oculto: true,
  },
  {
    titulo: "Contratos de aluguel",
    href: "/painel/veiculos/contratos",
    icone: "Car",
    descricao: "Contratos de locação da frota e mensalidades",
    chave: "veiculos_gestao",
    oculto: true,
  },
  {
    titulo: "Cobranças de multas",
    href: "/painel/financeiro/multas",
    icone: "Receipt",
    descricao: "Baixa das cobranças de infrações aos condutores",
    chave: "financeiro_pagamento",
    chavesAlternativas: ["financeiro_leitura"],
    oculto: true,
  },
  {
    titulo: "Hospedagem",
    href: "/painel/hospedagem",
    icone: "Hotel",
    descricao: "Hotéis, tarifas, serviços e cupons",
    chave: "filiacao_hospedagens",
    chavesAlternativas: [
      "filiacao_hospedagens_gestao",
      "filiacao_hospedagens_edicao",
    ],
  },
  {
    titulo: "Cupons de hospedagem",
    href: "/painel/hospedagem/cupons",
    icone: "Hotel",
    descricao: "Autorizações de subsídio nos hotéis parceiros",
    chave: "filiacao_hospedagens",
    // O pessoal da filiação emite cupons pela sua área, mesmo sem acesso
    // ao restante do módulo Hospedagem.
    chavesAlternativas: [
      "filiacao_hospedagens_gestao",
      "filiacao_hospedagens_edicao",
      "filiacao_gestao",
      "filiacao_filiados",
    ],
    oculto: true,
  },
  {
    titulo: "Jurídico",
    href: "/painel/juridico",
    icone: "Scale",
    descricao: "Homologações e processos",
    chave: "juridico_geral",
    chavesAlternativas: ["juridico_gestao", "juridico_homologacoes"],
  },
  {
    titulo: "Saúde",
    href: "/painel/saude",
    icone: "HeartPulse",
    descricao: "CATs e atendimentos",
    chave: "saude_cat",
    chavesAlternativas: ["saude_atendimento", "saude_gestao"],
  },
  {
    titulo: "CATs",
    href: "/painel/saude/cat",
    icone: "HeartPulse",
    descricao: "Comunicações de acidente de trabalho",
    chave: "saude_cat",
    chavesAlternativas: ["saude_atendimento", "saude_gestao"],
    oculto: true,
  },
  {
    // Inclusão exige a chave da área ou gestão — quem só tem
    // saude_atendimento consulta as CATs, mas não cadastra.
    titulo: "Incluir CAT",
    href: "/painel/saude/cat/nova",
    icone: "HeartPulse",
    descricao: "Importação de planilha e cadastro individual",
    chave: "saude_cat",
    chavesAlternativas: ["saude_gestao"],
    oculto: true,
  },
  {
    // Só gestão: definir quem é profissional de qual tipo é o que alimenta
    // o controle de acesso ao relatório clínico.
    titulo: "Profissionais e tipos",
    href: "/painel/saude/profissionais",
    icone: "Stethoscope",
    descricao: "Quem atende, de qual especialidade",
    chave: "saude_gestao",
    oculto: true,
  },
  {
    titulo: "Assistidos",
    href: "/painel/saude/assistidos",
    icone: "Users",
    descricao: "Pessoas acompanhadas pelo serviço de saúde",
    chave: "saude_atendimento",
    chavesAlternativas: ["saude_gestao"],
    oculto: true,
  },
  {
    titulo: "Atendimentos",
    href: "/painel/saude/atendimentos",
    icone: "ClipboardList",
    descricao: "Registro de atendimentos do serviço de saúde",
    chave: "saude_atendimento",
    chavesAlternativas: ["saude_gestao"],
    oculto: true,
  },
  {
    titulo: "Agenda de saúde",
    href: "/painel/saude/agenda",
    icone: "CalendarDays",
    descricao: "Atendimentos agendados",
    chave: "saude_atendimento",
    chavesAlternativas: ["saude_gestao"],
    oculto: true,
  },
  {
    // Gate do módulo inteiro: quem opera é a secretaria do departamento,
    // não necessariamente quem atende. Não é área clínica.
    titulo: "CIPA",
    href: "/painel/saude/cipa",
    icone: "ShieldCheck",
    descricao: "Reuniões nas empresas, representação e pauta",
    chave: "saude_cat",
    chavesAlternativas: ["saude_atendimento", "saude_gestao"],
    oculto: true,
  },
  {
    titulo: "Patrimônio",
    href: "/painel/patrimonio",
    icone: "Boxes",
    descricao: "Itens patrimoniais, recintos, notas fiscais e cautelas",
    chave: "patrimonio_geral",
    chavesAlternativas: ["patrimonio_leitura"],
  },
  {
    titulo: "Itens patrimoniais",
    href: "/painel/patrimonio/itens",
    icone: "Boxes",
    descricao: "Bens do patrimônio, com situação, recinto e cautela",
    chave: "patrimonio_geral",
    chavesAlternativas: ["patrimonio_leitura"],
    oculto: true,
  },
  {
    titulo: "Recintos",
    href: "/painel/patrimonio/recintos",
    icone: "Boxes",
    descricao: "Locais onde os bens ficam e seus responsáveis",
    chave: "patrimonio_geral",
    chavesAlternativas: ["patrimonio_leitura"],
    oculto: true,
  },
  {
    titulo: "Notas fiscais do patrimônio",
    href: "/painel/patrimonio/notas",
    icone: "Boxes",
    descricao: "Notas de entrada e saída dos bens patrimoniais",
    chave: "patrimonio_geral",
    chavesAlternativas: ["patrimonio_leitura"],
    oculto: true,
  },
  {
    titulo: "Comunicação",
    href: "/painel/comunicacao",
    icone: "Rss",
    descricao: "Notícias, resumo por IA, assistente de redação, QR Codes e página de links",
    chave: "noticias",
  },
  {
    titulo: "Notícias",
    href: "/painel/comunicacao/noticias",
    icone: "Newspaper",
    descricao: "Notícias do painel e do portal do filiado",
    chave: "noticias",
    oculto: true,
  },
  {
    titulo: "Resumo de notícias",
    href: "/painel/comunicacao/resumo",
    icone: "Newspaper",
    descricao: "Resumo por IA de sites de notícias",
    chave: "noticias",
    oculto: true,
  },
  {
    titulo: "Assistente de redação",
    href: "/painel/comunicacao/textos",
    icone: "PenLine",
    descricao: "A IA escreve textos seguindo a política editorial da entidade",
    chave: "noticias",
    oculto: true,
  },
  {
    titulo: "Representação Sindical",
    href: "/painel/representacao",
    icone: "Megaphone",
    descricao: "Assembleias, oposição, acordos coletivos e empregadores",
    chave: "assembleias",
    chavesAlternativas: ["oposicao", "acordos_coletivos", "empregadores"],
  },
  {
    titulo: "Assembleias",
    href: "/painel/representacao/assembleias",
    icone: "Vote",
    descricao: "Assembleias, rodadas e votações",
    chave: "assembleias",
    oculto: true,
  },
  {
    titulo: "Oposição à contribuição",
    href: "/painel/representacao/oposicao",
    icone: "Gavel",
    descricao: "Campanhas de oposição e fila de avaliação",
    chave: "oposicao",
    oculto: true,
  },
  {
    titulo: "Acordos coletivos",
    href: "/painel/representacao/acordos",
    icone: "FileSignature",
    descricao: "ACT e CCT, vigência, cláusulas e alertas",
    chave: "acordos_coletivos",
    oculto: true,
  },
  {
    titulo: "Empregadores",
    href: "/painel/representacao/empregadores",
    icone: "Building2",
    descricao: "Empregadores e fontes pagadoras, documentação legal e status",
    chave: "empregadores",
    oculto: true,
  },
  {
    titulo: "Ferramentas",
    href: "/painel/ferramentas",
    icone: "Wrench",
    descricao: "Projetos, demandas, documentos, agenda, ofícios e e-mails",
    // Hub das ferramentas administrativas: visível para quem tem qualquer
    // permissão do grupo `ferramentas_*`.
    chave: "ferramentas_projetos",
    chavesAlternativas: [
      "ferramentas_projetos_edicao",
      "ferramentas_demandas",
      "ferramentas_tarefas",
      "ferramentas_anomalias",
      "ferramentas_documentos",
      "ferramentas_agendas",
      "ferramentas_oficios",
      "ferramentas_emails_internos",
    ],
  },
  {
    titulo: "Projetos",
    href: "/painel/ferramentas/projetos",
    icone: "FolderKanban",
    descricao: "Projetos do sindicato, orçamento e gasto em Compras",
    chave: "ferramentas_projetos",
    chavesAlternativas: ["ferramentas_projetos_edicao"],
    oculto: true,
  },
  {
    titulo: "Demandas",
    href: "/painel/ferramentas/demandas",
    icone: "ListChecks",
    descricao: "Frentes de atuação com prazo, responsável e tarefas",
    chave: "ferramentas_demandas",
    chavesAlternativas: ["ferramentas_tarefas", "ferramentas_anomalias"],
    oculto: true,
  },
  {
    titulo: "Tarefas",
    href: "/painel/ferramentas/tarefas",
    icone: "ListChecks",
    descricao: "Tarefas de demandas, projetos e anomalias",
    chave: "ferramentas_tarefas",
    chavesAlternativas: ["ferramentas_demandas"],
    oculto: true,
  },
  {
    titulo: "Anomalias",
    href: "/painel/ferramentas/anomalias",
    icone: "TriangleAlert",
    descricao: "Não conformidades, causa raiz e providências",
    chave: "ferramentas_anomalias",
    oculto: true,
  },
  {
    titulo: "Ofícios",
    href: "/painel/ferramentas/oficios",
    icone: "ScrollText",
    descricao: "Emissão e histórico de ofícios com numeração por ano",
    chave: "ferramentas_oficios",
    oculto: true,
  },
  {
    titulo: "Agenda",
    href: "/painel/ferramentas/agenda",
    icone: "CalendarDays",
    descricao: "Eventos, reuniões e atividades",
    chave: "ferramentas_agendas",
    oculto: true,
  },
  {
    titulo: "Documentos",
    href: "/painel/ferramentas/documentos",
    icone: "FileText",
    descricao: "Documentos institucionais com versionamento",
    chave: "ferramentas_documentos",
    oculto: true,
  },
  {
    titulo: "Institucional",
    href: "/painel/institucional",
    icone: "Landmark",
    descricao:
      "Organização, diretoria, registro sindical, e-mails, usuários e permissões",
    chave: "configuracoes",
    chavesAlternativas: [
      "permissoes",
      "diretoria_mandatos",
      "registro_mte",
      "ferramentas_emails_internos",
      "apoio_institucional",
      "apoio_institucional_edicao",
      "custeio_institucional",
      "custeio_institucional_edicao",
      "custeio_institucional_autorizacao",
    ],
  },
  {
    titulo: "Organização",
    href: "/painel/institucional/organizacao",
    icone: "Building2",
    descricao: "Identidade da entidade, logo e sedes",
    chave: "configuracoes",
    oculto: true,
  },
  {
    titulo: "Diretoria",
    href: "/painel/institucional/diretoria",
    icone: "Users",
    descricao: "Mandatos e integrantes da diretoria",
    chave: "diretoria_mandatos",
    chavesAlternativas: ["configuracoes"],
    oculto: true,
  },
  {
    titulo: "Registro sindical (MTE)",
    href: "/painel/institucional/registro-mte",
    icone: "Landmark",
    descricao: "Registros da entidade no Ministério do Trabalho",
    chave: "registro_mte",
    chavesAlternativas: ["configuracoes"],
    oculto: true,
  },
  {
    titulo: "Atas de reunião",
    href: "/painel/institucional/atas",
    icone: "ScrollText",
    descricao: "Atas das reuniões da entidade, por mandato",
    chave: "diretoria_reunioes",
    chavesAlternativas: ["configuracoes"],
    oculto: true,
  },
  {
    titulo: "E-mails institucionais",
    href: "/painel/institucional/emails",
    icone: "Mail",
    descricao: "Endereços institucionais da entidade e o responsável",
    chave: "ferramentas_emails_internos",
    chavesAlternativas: ["configuracoes"],
    oculto: true,
  },
  {
    titulo: "Usuários e permissões",
    href: "/painel/institucional/usuarios",
    icone: "Users",
    descricao: "Acesso ao painel e permissões por área",
    chave: "permissoes",
    chavesAlternativas: ["configuracoes"],
    oculto: true,
  },
  {
    titulo: "Ajudas institucionais",
    href: "/painel/institucional/ajudas",
    icone: "Landmark",
    descricao: "Apoios da entidade a organizações apoiadas",
    chave: "apoio_institucional",
    chavesAlternativas: ["apoio_institucional_edicao"],
    oculto: true,
  },
  {
    titulo: "Custeio institucional",
    href: "/painel/institucional/custeios",
    icone: "HandCoins",
    descricao: "Custeios a diretores, demitidos políticos e convidados",
    chave: "custeio_institucional",
    chavesAlternativas: [
      "custeio_institucional_edicao",
      "custeio_institucional_autorizacao",
    ],
    oculto: true,
  },
]

/** Coluna em `permissoes` que referencia `usuarios.id` (conferido no banco). */
export const PERMISSOES_USUARIO_FK = "usuario_id"

export function podeAcessar(
  permissoes: Permissoes | null,
  chave: string | null,
  chavesAlternativas: string[] = []
): boolean {
  if (chave === null) return true
  if (!permissoes) return false
  return [chave, ...chavesAlternativas].some((c) => permissoes[c] === true)
}

export function podeAcessarModulo(
  permissoes: Permissoes | null,
  modulo: Modulo
): boolean {
  return podeAcessar(permissoes, modulo.chave, modulo.chavesAlternativas)
}

/** Módulos para navegação (sidebar/dashboard) — sub-rotas ocultas ficam de fora. */
export function modulosPermitidos(permissoes: Permissoes | null): Modulo[] {
  return MODULOS.filter((m) => !m.oculto && podeAcessarModulo(permissoes, m))
}

/** Resolve o módulo dono de uma rota (match pelo prefixo mais específico). */
export function moduloDaRota(pathname: string): Modulo | undefined {
  return MODULOS.filter(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0]
}

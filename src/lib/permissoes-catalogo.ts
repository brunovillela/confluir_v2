/**
 * Catálogo das permissões (colunas boolean de `permissoes`) agrupadas por área,
 * com rótulos legíveis. Fonte única da tela de Usuários e Permissões.
 * Seguro para o client (sem `server-only`). Ver [[confluir-fase-3a]].
 */

export type FlagPermissao = { chave: string; rotulo: string }
export type AreaPermissao = { area: string; flags: FlagPermissao[] }

export const CATALOGO_PERMISSOES: AreaPermissao[] = [
  {
    area: "Aquisições",
    flags: [
      { chave: "aquisicoes_compras", rotulo: "Compras" },
      { chave: "aquisicoes_compras_edicao", rotulo: "Compras — editar" },
      { chave: "aquisicoes_avaliacoes", rotulo: "Avaliação de ordens (alçada)" },
      { chave: "aquisicoes_contratos", rotulo: "Contratos" },
      { chave: "aquisicoes_contratos_edicao", rotulo: "Contratos — editar" },
      { chave: "aquisicoes_fornecedores", rotulo: "Fornecedores" },
      { chave: "aquisicoes_recebimentos", rotulo: "Recebimentos" },
    ],
  },
  {
    area: "Financeiro",
    flags: [
      { chave: "financeiro_caixa", rotulo: "Caixa" },
      { chave: "financeiro_caixa_admin", rotulo: "Caixa — administração" },
      { chave: "financeiro_pagamento", rotulo: "Ordens de pagamento" },
      { chave: "financeiro_centro_custo", rotulo: "Centros de custo" },
      { chave: "financeiro_receitas_sindicais", rotulo: "Receitas sindicais" },
      { chave: "financeiro_tributos", rotulo: "Tributos" },
      { chave: "financeiro_apoio", rotulo: "Apoio financeiro" },
      { chave: "financeiro_leitura", rotulo: "Financeiro — somente leitura" },
    ],
  },
  {
    area: "Filiação",
    flags: [
      { chave: "filiacao_filiados", rotulo: "Filiados" },
      { chave: "filiacao_gestao", rotulo: "Gestão da filiação" },
      { chave: "filiacao_receitas", rotulo: "Receitas e contribuições" },
      { chave: "filiacao_reembolsos", rotulo: "Reembolsos" },
      { chave: "filiacao_empresas", rotulo: "Empresas" },
      { chave: "filiacao_convenios", rotulo: "Convênios" },
      { chave: "filiacao_consulta_convenios", rotulo: "Consulta de convênios" },
      { chave: "filiacao_hospedagens", rotulo: "Hospedagens" },
      { chave: "filiacao_hospedagens_edicao", rotulo: "Hospedagens — editar" },
      { chave: "filiacao_hospedagens_gestao", rotulo: "Hospedagens — gestão" },
    ],
  },
  {
    area: "Pessoal",
    flags: [
      { chave: "pessoal_gestao", rotulo: "Gestão de pessoal" },
      { chave: "pessoal_contracheque", rotulo: "Contracheques" },
      { chave: "pessoal_anuenios", rotulo: "Anuênios" },
      { chave: "pessoal_niveis_salariais", rotulo: "Níveis salariais" },
      { chave: "pessoal_diarias", rotulo: "Diárias" },
      { chave: "pessoal_aso", rotulo: "ASO" },
      { chave: "pessoal_faltas_justificadas", rotulo: "Faltas justificadas" },
      { chave: "pessoal_registro_ponto", rotulo: "Registro de ponto" },
      { chave: "pessoal_informes_rendimentos", rotulo: "Informes de rendimentos" },
    ],
  },
  {
    area: "Veículos",
    flags: [
      { chave: "veiculos", rotulo: "Veículos" },
      { chave: "veiculos_gestao", rotulo: "Gestão de veículos" },
      { chave: "veiculos_condutores", rotulo: "Condutores" },
      { chave: "veiculos_contratos", rotulo: "Contratos de aluguel" },
      { chave: "veiculos_infracoes", rotulo: "Infrações" },
    ],
  },
  {
    area: "Saúde",
    flags: [
      { chave: "saude_cat", rotulo: "CATs" },
      { chave: "saude_atendimento", rotulo: "Atendimentos" },
      { chave: "saude_gestao", rotulo: "Gestão de saúde" },
    ],
  },
  {
    area: "Jurídico",
    flags: [
      { chave: "juridico_geral", rotulo: "Jurídico geral" },
      { chave: "juridico_gestao", rotulo: "Gestão jurídica" },
      { chave: "juridico_homologacoes", rotulo: "Homologações" },
    ],
  },
  {
    area: "Ferramentas administrativas",
    flags: [
      { chave: "ferramentas_projetos", rotulo: "Projetos" },
      { chave: "ferramentas_projetos_edicao", rotulo: "Projetos — editar" },
      { chave: "ferramentas_demandas", rotulo: "Demandas" },
      { chave: "ferramentas_tarefas", rotulo: "Tarefas" },
      { chave: "ferramentas_anomalias", rotulo: "Anomalias" },
      { chave: "ferramentas_documentos", rotulo: "Documentos" },
      { chave: "ferramentas_agendas", rotulo: "Agenda" },
      { chave: "ferramentas_oficios", rotulo: "Ofícios" },
      { chave: "ferramentas_linhas_telefone", rotulo: "Linhas telefônicas" },
      { chave: "ferramentas_ci", rotulo: "Comunicação interna" },
      { chave: "ferramentas_busca_pessoas", rotulo: "Busca de pessoas" },
    ],
  },
  {
    area: "Diretoria",
    flags: [
      { chave: "diretoria_mandatos", rotulo: "Mandatos e integrantes" },
      { chave: "diretoria_reunioes", rotulo: "Reuniões" },
      { chave: "diretoria_passagens", rotulo: "Passagens" },
    ],
  },
  {
    area: "Representação Sindical",
    flags: [
      { chave: "assembleias", rotulo: "Assembleias e votações" },
      { chave: "oposicao", rotulo: "Oposição à contribuição assistencial" },
      { chave: "acordos_coletivos", rotulo: "Acordos coletivos" },
      { chave: "empregadores", rotulo: "Empregadores e fontes pagadoras" },
    ],
  },
  {
    area: "Patrimônio",
    flags: [
      { chave: "patrimonio_geral", rotulo: "Patrimônio" },
      { chave: "patrimonio_leitura", rotulo: "Patrimônio — somente leitura" },
    ],
  },
  {
    area: "Comunicação",
    flags: [{ chave: "noticias", rotulo: "Notícias" }],
  },
  {
    area: "Institucional",
    flags: [
      { chave: "configuracoes", rotulo: "Organização (identidade e sedes)" },
      { chave: "registro_mte", rotulo: "Registro sindical (MTE)" },
      { chave: "ferramentas_emails_internos", rotulo: "E-mails institucionais" },
      { chave: "apoio_institucional", rotulo: "Ajudas institucionais" },
      {
        chave: "apoio_institucional_edicao",
        rotulo: "Ajudas institucionais — editar",
      },
      { chave: "custeio_institucional", rotulo: "Custeio institucional" },
      {
        chave: "custeio_institucional_edicao",
        rotulo: "Custeio institucional — editar",
      },
      {
        chave: "custeio_institucional_autorizacao",
        rotulo: "Custeio institucional — autorizar",
      },
      { chave: "permissoes", rotulo: "Gerenciar usuários e permissões" },
    ],
  },
]

/** Todas as chaves de flag, achatadas. */
export const CHAVES_PERMISSAO: string[] = CATALOGO_PERMISSOES.flatMap((a) =>
  a.flags.map((f) => f.chave)
)

/** Rótulo de uma chave (para resumos). */
export const ROTULO_PERMISSAO: Record<string, string> = Object.fromEntries(
  CATALOGO_PERMISSOES.flatMap((a) => a.flags.map((f) => [f.chave, f.rotulo]))
)

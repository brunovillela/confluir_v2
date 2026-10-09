import "server-only"

import { nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatarData, formatarMoeda } from "@/lib/formato"

/**
 * PROCEDÊNCIA de uma ordem de pagamento: de onde ela veio (compra, contrato,
 * RPA, folha, diária, hotel, multa…), com os dados que a auditoria precisa ver,
 * quem a originou (para a segregação de funções), o recebimento (compras) e os
 * documentos de suporte.
 *
 * A ordem de detecção importa: viagens carregam processo de compra; hotel e
 * RPA carregam contrato. Só 4 origens se acham pela ordem (processo_compra_id,
 * contrato_id, contrato_aluguel_id, custeio_id); as demais guardam
 * `ordem_pagamento_id` na tabela de origem.
 */

export type Pessoa = { id: string | null; nome: string | null; papel: string }

export type Procedencia = {
  /** Rótulo curto da origem: "Compra — aquisição direta", "Contrato", "RPA"… */
  origem: string
  /** Identificação do registro de origem (código, número, objeto). */
  titulo: string | null
  href: string | null
  linhas: { rotulo: string; valor: string }[]
  /** Quem originou o pagamento (null quando o sistema não registra). */
  solicitante: Pessoa | null
  /** Outros envolvidos na origem (comprador, avaliador interno…). */
  envolvidos: Pessoa[]
  /** Recebimento do bem/serviço — só compras. */
  recebimento: {
    recebido: boolean
    data: string | null
    por: string | null
    deAcordo: boolean | null
    observacao: string | null
  } | null
  /** `formalizacao`: o documento que formaliza a origem (contrato, minuta, termo do custeio). */
  documentos: { rotulo: string; url: string | null; formalizacao?: boolean }[]
  /**
   * Itens que compõem o valor (remessa de diárias: cada diária e as despesas
   * dela). Sai na tela da ordem e no extrato.
   */
  detalhamento?: {
    titulo: string
    itens: {
      descricao: string
      detalhe: string | null
      valor: string
      subitens: { descricao: string; valor: string }[]
    }[]
    total: string
  } | null
}

type Linha = Record<string, unknown>

function t(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
function moeda(v: unknown): string {
  const x = n(v)
  return x === null ? "—" : formatarMoeda(x)
}
function data(v: unknown): string {
  const s = t(v)
  return s ? formatarData(s) : "—"
}
function linhas(pares: [string, string | null | undefined][]): { rotulo: string; valor: string }[] {
  return pares
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "—")
    .map(([rotulo, valor]) => ({ rotulo, valor: valor as string }))
}

async function assinar(bucket: string, caminho: unknown): Promise<string | null> {
  const c = t(caminho)
  if (!c) return null
  if (/^(https?:)?\/\//.test(c)) return c.startsWith("//") ? `https:${c}` : c
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(bucket).createSignedUrl(c, 3600)
  return data?.signedUrl ?? null
}

async function umaPor(tabela: string, coluna: string, valor: string): Promise<Linha | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from(tabela).select("*").eq(coluna, valor).limit(1)
  if (error) return null
  return ((data ?? [])[0] as Linha | undefined) ?? null
}

async function porId(tabela: string, id: unknown): Promise<Linha | null> {
  const s = t(id)
  return s ? umaPor(tabela, "id", s) : null
}

async function nomeEmpresa(id: unknown): Promise<string | null> {
  const e = await porId("empresa", id)
  return e ? (t(e.nome_fantasia) ?? t(e.nome_razao)) : null
}

/** Quem gerou a ordem, quando a trilha registrou a criação. */
async function criadorPelaTrilha(ordemId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento_eventos")
    .select("usuario_id")
    .eq("ordem_id", ordemId)
    .eq("tipo", "criada")
    .order("created_at", { ascending: true })
    .limit(1)
  return (data?.[0]?.usuario_id as string | undefined) ?? null
}

export async function procedenciaDaOrdem(ordem: Linha): Promise<Procedencia> {
  const id = String(ordem.id)
  const tipo = t(ordem.tipo) ?? ""
  const p = await montar(id, tipo, ordem)
  // Completa nomes das pessoas de uma vez.
  const ids = [p.solicitante, ...p.envolvidos]
    .map((x) => x?.id)
    .filter((x): x is string => Boolean(x))
  if (ids.length) {
    const nomes = await nomesDosUsuarios(ids)
    for (const pessoa of [p.solicitante, ...p.envolvidos]) {
      if (pessoa?.id && !pessoa.nome) pessoa.nome = nomes.get(pessoa.id) ?? null
    }
  }
  return p
}

function base(origem: string): Procedencia {
  return {
    origem,
    titulo: null,
    href: null,
    linhas: [],
    solicitante: null,
    envolvidos: [],
    recebimento: null,
    documentos: [],
  }
}

async function montar(id: string, tipo: string, ordem: Linha): Promise<Procedencia> {
  // 1. RPA
  if (tipo === "RPA") {
    const r = await umaPor("compras_rpa", "ordem_pagamento_id", id)
    const p = base("RPA — pagamento a autônomo")
    if (!r) return p
    const contrato = await porId("contratos", r.contrato_id)
    p.titulo = `RPA nº ${r.numero ?? "—"}`
    p.href = `/painel/compras/rpa/${r.id}`
    p.linhas = linhas([
      ["Serviço", t(r.descricao_servico)],
      ["Data do serviço", data(r.data_servico)],
      ["Contrato", contrato ? [t(contrato.codigo), t(contrato.objeto)].filter(Boolean).join(" — ") : null],
      ["Valor bruto", moeda(r.valor_bruto)],
      ["INSS retido", moeda(r.inss)],
      ["IRRF retido", moeda(r.irrf)],
      ["ISS retido", moeda(r.iss)],
      ["Valor líquido (a pagar)", moeda(r.valor_liquido)],
    ])
    p.solicitante = t(r.criado_por) ? { id: String(r.criado_por), nome: null, papel: "Emitiu o RPA" } : null
    p.documentos = [{ rotulo: "RPA (PDF)", url: `/painel/compras/rpa/${r.id}/pdf` }]
    return p
  }

  // 2. Hospedagem (fatura do hotel)
  if (tipo === "Hospedagem") {
    const f = await umaPor("hospedagem_fatura", "ordem_pagamento_id", id)
    const p = base("Fatura de hospedagem (hotel conveniado)")
    if (!f) return p
    const admin = await createAdminClient()
    const [hotel, servicos] = await Promise.all([
      porId("hospedagem_hotel", f.hotel_id),
      admin.from("hospedagem_servico").select("*").eq("fatura_id", String(f.id)),
    ])
    const svs = (servicos.data ?? []) as Linha[]
    const entradas = svs.map((s) => t(s.checkin_date)).filter(Boolean).sort() as string[]
    const saidas = svs.map((s) => t(s.checkout_date)).filter(Boolean).sort() as string[]
    let hospedes: number | null = null
    if (svs.length) {
      const { count } = await admin
        .from("hospedagem_cupom")
        .select("id", { count: "exact", head: true })
        .in("servico_id", svs.map((s) => String(s.id)))
        .eq("compareceu", true)
      hospedes = count ?? null
    }
    p.titulo = `Fatura ${t(f.codigo) ?? ""}`.trim()
    p.href = t(f.hotel_id) ? `/painel/hospedagem/hoteis/${f.hotel_id}` : null
    p.linhas = linhas([
      ["Hotel", hotel ? (t(hotel.nome) ?? t(hotel.nome_fantasia) ?? null) : null],
      ["Serviços faturados", String(svs.length)],
      ["Hóspedes presentes", hospedes === null ? null : String(hospedes)],
      ["Período", entradas.length ? `${data(entradas[0])} a ${data(saidas[saidas.length - 1] ?? entradas[0])}` : null],
      ["Subsídio da entidade (soma)", moeda(svs.reduce((a, s) => a + (n(s.custo_entidade) ?? 0), 0))],
    ])
    p.solicitante = { id: null, nome: "Hotel (portal do parceiro)", papel: "Emitiu a fatura" }
    p.documentos = [{ rotulo: "Nota fiscal do hotel", url: await assinar("hospedagem", f.nota_fiscal) }]
    return p
  }

  // 3. Viagens (fatura da agência) — antes de Aquisição.
  const fatViagem = await umaPor("viagens_faturas", "ordem_pagamento_id", id)
  if (fatViagem) {
    const f = fatViagem
    const admin = await createAdminClient()
    const { count: itens } = await admin
      .from("viagens_itens")
      .select("id", { count: "exact", head: true })
      .eq("fatura_id", String(f.id))
    const p = base("Fatura de agência de viagens")
    p.titulo = `Fatura nº ${t(f.numero) ?? "—"}`
    p.href = `/painel/institucional/viagens/faturas/${f.id}`
    p.linhas = linhas([
      ["Agência", await nomeEmpresa(f.fornecedor_id)],
      ["Emissão", data(f.emissao)],
      ["Itens (passagens/hospedagens)", itens === null ? null : String(itens)],
      ["Valor dos itens", moeda(f.valor_itens)],
      ["Taxas da agência", moeda(f.valor_taxas)],
      ["Total da fatura", moeda(f.valor_total)],
      ["Observação", t(f.observacao)],
    ])
    p.solicitante = t(f.criado_por) ? { id: String(f.criado_por), nome: null, papel: "Lançou a fatura" } : null
    p.documentos = [{ rotulo: "Fatura da agência (PDF)", url: await assinar("compras", f.arquivo) }]
    return p
  }

  // 4. Compras (direta ou via Aquisição)
  if (t(ordem.processo_compra_id)) {
    const proc = await porId("compras_solicitacoes", ordem.processo_compra_id)
    const forn = await umaPor("compras_fornecimentos", "ordem_pagamento_id", id)
    const admin = await createAdminClient()
    const { count: propostas } = await admin
      .from("compras_propostas")
      .select("id", { count: "exact", head: true })
      .eq("processo_compra_id", String(ordem.processo_compra_id))
    const direta = proc?.aquisicao_direta === true
    const p = base(direta ? "Compra — aquisição direta" : proc?.aquisicao_direta === false ? "Compra — via setor de Aquisição" : "Compra")
    if (!proc) return p
    const depto = await porId("empresa_departamentos", proc.solicitacao_departamento_id)
    p.titulo = `Processo ${t(proc.codigo) ?? "—"}`
    p.href = `/painel/compras/${proc.id}`
    p.linhas = linhas([
      ["Produto ou serviço", t(proc.solicitacao_produto)],
      ["Tipo", proc.solicitacao_e_produto === true ? "Bem / produto" : proc.solicitacao_e_produto === false ? "Prestação de serviço" : null],
      ["Observações", t(proc.solicitacao_observacao)],
      ["Departamento solicitante", depto ? t(depto.departamento) : null],
      ["Data da compra", data(forn?.data_compra ?? proc.compra_data)],
      ["Valor da compra", moeda(forn?.valor ?? proc.compra_valor)],
      ["Propostas", direta ? "Aquisição direta (sem cotação)" : propostas === null ? null : String(propostas)],
      ["Entrega", proc.solicitacao_entrega_no_ato === true ? "No ato da compra" : t(proc.solicitacao_local) ? `${t(proc.solicitacao_local)} até ${data(proc.solicitacao_data_limite)}` : null],
    ])
    const solicitante = t(proc.solicitante_id)
    const comprador = t(forn?.comprador_id) ?? t(proc.comprado_por_id)
    p.solicitante = solicitante ? { id: solicitante, nome: null, papel: "Solicitou" } : comprador ? { id: comprador, nome: null, papel: "Comprou" } : null
    if (comprador && comprador !== solicitante) p.envolvidos.push({ id: comprador, nome: null, papel: "Comprou" })
    const recebido = forn ? forn.recebido === true : proc.recebido === true
    const recebedor = t(forn?.recebimento_recebido_por_id) ?? t(proc.recebimento_recebido_por_id)
    p.recebimento = {
      recebido,
      data: t(forn?.recebimento_data) ?? t(proc.recebimento_data),
      por: recebedor ? ((await nomesDosUsuarios([recebedor])).get(recebedor) ?? null) : null,
      deAcordo: forn ? (forn.recebimento_de_acordo as boolean | null) ?? null : (proc.recebimento_de_acordo as boolean | null) ?? null,
      observacao: t(forn?.recebimento_observacao) ?? t(proc.recebimento_observacao),
    }
    return p
  }

  // 5. Contrato (parcela) ou Ajuda institucional
  if (tipo === "Contrato" && t(ordem.contrato_id)) {
    const c = await porId("contratos", ordem.contrato_id)
    const ajuda = c?.apoio_institucional === true
    const p = base(ajuda ? "Ajuda institucional (parcela)" : "Contrato (parcela)")
    if (!c) return p
    const parcela = (t(ordem.descricao) ?? "").match(/parcela (\d+)\/(\d+)/i)
    p.titulo = [t(c.codigo), t(c.objeto)].filter(Boolean).join(" — ") || "Contrato"
    p.href = ajuda ? `/painel/institucional/ajudas/${c.id}` : `/painel/compras/contratos/${c.id}`
    p.linhas = linhas([
      [ajuda ? "Entidade apoiada" : "Fornecedor", await nomeEmpresa(c.fornecedor_id)],
      ["Vigência", `${data(c.vigencia_inicio)} a ${data(c.vigencia_termino)}`],
      ["Valor contratado da parcela", moeda(c.valor)],
      ["Pagamento", c.sob_demanda === true ? "Sob demanda (valor variável)" : "Ordinário de valor fixo"],
      ["Parcela", parcela ? `${parcela[1]} de ${parcela[2]}` : null],
    ])
    const criador = await criadorPelaTrilha(id)
    p.solicitante = criador ? { id: criador, nome: null, papel: "Gerou as ordens" } : null
    if (t(c.responsavel_id)) p.envolvidos.push({ id: String(c.responsavel_id), nome: null, papel: "Responsável pelo contrato" })
    p.documentos = [
      { rotulo: "Contrato assinado", url: await assinar("compras", c.arquivo_contrato), formalizacao: true },
      ...(await minutasDoContrato(String(c.id))),
    ]
    return p
  }

  // 6. Locação de veículo
  if (t(ordem.contrato_aluguel_id)) {
    const c = await porId("veiculo_contratos_aluguel", ordem.contrato_aluguel_id)
    const p = base("Locação de veículos (mensalidade)")
    if (!c) return p
    const admin = await createAdminClient()
    const { data: veics } = await admin.from("veiculos").select("placa").eq("contrato_aluguel_id", String(c.id))
    const competencia = (t(ordem.descricao) ?? "").match(/\(([^)]+)\)\s*$/)
    p.titulo = `Contrato ${t(c.numero_contrato_locadora) ?? "—"}`
    p.href = `/painel/veiculos/contratos/${c.id}`
    p.linhas = linhas([
      ["Locadora", await nomeEmpresa(c.fornecedor_id)],
      ["Finalidade", t(c.finalidade)],
      ["Veículos", (veics ?? []).map((v) => v.placa).filter(Boolean).join(", ") || null],
      ["Competência", competencia ? competencia[1] : null],
      ["Mensalidade contratada", moeda(c.valor_mensal)],
      ["Vigência", `${data(c.vigencia_inicio)} a ${data(c.vigencia_termino)}`],
    ])
    const criador = await criadorPelaTrilha(id)
    p.solicitante = criador ? { id: criador, nome: null, papel: "Gerou a mensalidade" } : null
    if (t(c.responsavel_id)) p.envolvidos.push({ id: String(c.responsavel_id), nome: null, papel: "Responsável pelo contrato" })
    return p
  }

  // 7. Custeio
  if (t(ordem.custeio_id)) {
    const c = await porId("institucional_custeios", ordem.custeio_id)
    const p = base("Custeio institucional")
    if (!c) return p
    const fin = await porId("institucional_custeio_finalidades", c.finalidade_id)
    p.titulo = `Custeio ${t(c.codigo) ?? ""}`.trim()
    p.href = `/painel/institucional/custeios/${c.id}`
    p.linhas = linhas([
      ["Finalidade", fin ? t(fin.nome) : null],
      ["Descrição", t(c.descricao)],
      ["Evento", t(c.evento)],
      ["Beneficiário", [t(c.beneficiario_nome), t(c.tipo_beneficiario)].filter(Boolean).join(" · ") || null],
      ["Parcelas", c.cadencia === "recorrente" ? `${c.num_parcelas ?? "—"} (${t(c.periodicidade) ?? "—"})` : "Pagamento único"],
      ["Valor da parcela", moeda(c.valor_parcela)],
    ])
    p.solicitante = t(c.criado_por_id) ? { id: String(c.criado_por_id), nome: null, papel: "Registrou o custeio" } : null
    if (t(c.autorizador_id)) p.envolvidos.push({ id: String(c.autorizador_id), nome: null, papel: "Autorizou o custeio" })
    p.documentos = [
      { rotulo: "Formalização do custeio", url: await assinar("compras", c.arquivo_formalizacao), formalizacao: true },
    ]
    return p
  }

  // 8. Folha de pagamento
  if (tipo === "Folha de pagamento") {
    const cc = await umaPor("pessoal_contracheques", "ordem_pagamento_id", id)
    const p = base("Folha de pagamento (contracheque)")
    if (!cc) return p
    const rem = await porId("pessoal_contracheques_remessas", cc.remessa_id)
    const func = t(cc.funcionario_id)
    p.titulo = rem ? t(rem.nome_remessa) : "Contracheque"
    p.href = rem ? `/painel/pessoal/contracheques/${rem.id}` : null
    p.linhas = linhas([
      ["Funcionário(a)", func ? ((await nomesDosUsuarios([func])).get(func) ?? null) : null],
      ["Remessa (competência)", rem ? t(rem.nome_remessa) : null],
      ["Data de pagamento da remessa", data(rem?.data_pagamento)],
      ["Valor líquido", moeda(cc.valor_liquido)],
    ])
    const criador = await criadorPelaTrilha(id)
    p.solicitante = criador ? { id: criador, nome: null, papel: "Lançou o contracheque" } : null
    return p
  }

  // 9. Diária
  if (tipo === "Diária") {
    // Remessa nova (05/10): várias diárias numa ordem só.
    const remessa = await umaPor("pessoal_diarias_remessas", "ordem_pagamento_id", id)
    if (remessa && !t(remessa.bubble_id)) return procedenciaRemessa(remessa)
    const s = await umaPor("pessoal_diarias_solicitacoes", "ordem_pagamento_id", id)
    const p = base("Diária")
    if (!s) {
      // Diárias do sistema anterior: a ordem fica na remessa migrada.
      const r = await umaPor("pessoal_diarias_remessas", "ordem_pagamento_id", id)
      if (!r) return p
      const benef = t(r.funcionario_id) ?? t(r.beneficiario_id)
      p.origem = "Diária (remessa do sistema anterior)"
      p.titulo = t(r.motivo) ?? t(r.descricao) ?? "Remessa de diárias"
      p.href = `/painel/pessoal/diarias/historico/${r.id}`
      p.linhas = linhas([
        ["Beneficiário(a)", benef ? ((await nomesDosUsuarios([benef])).get(benef) ?? null) : null],
        ["Quantidade", n(r.quantidade) === null ? null : String(n(r.quantidade))],
        ["Valor", moeda(r.valor_total ?? r.valor)],
        ["Data", data(r.data ?? r.created_at)],
      ])
      return p
    }
    const admin = await createAdminClient()
    const [tipoDiaria, descontos] = await Promise.all([
      porId("financeiro_diarias", s.diaria_id),
      admin.from("pessoal_diarias_descontos").select("valor").eq("diaria_solicitacao_id", String(s.id)),
    ])
    const totalDescontos = ((descontos.data ?? []) as Linha[]).reduce((a, d) => a + (n(d.valor) ?? 0), 0)
    const benef = t(s.funcionario_id)
    const diretor = s.beneficiario_tipo === "diretor"
    p.origem = diretor ? "Diária de diretor(a)" : "Diária de funcionário(a)"
    p.titulo = t(s.motivo)
    p.href = diretor ? `/painel/institucional/diretoria/diarias/${s.id}` : `/painel/pessoal/diarias/${s.id}`
    p.linhas = linhas([
      ["Beneficiário(a)", benef ? ((await nomesDosUsuarios([benef])).get(benef) ?? null) : null],
      ["Tipo de diária", tipoDiaria ? t(tipoDiaria.nome) : null],
      ["Período", `${data(s.data_inicio)} a ${data(s.data_termino)}`],
      ["Quantidade × valor", `${n(s.quantidade) ?? "—"} × ${moeda(s.valor_unitario)}`],
      ["Total das diárias", moeda(s.valor_total)],
      ["Despesas extras", n(s.valor_despesas) ? moeda(s.valor_despesas) : null],
      ["Multas descontadas", totalDescontos ? moeda(totalDescontos) : null],
    ])
    const solicitante = t(s.solicitante_id) ?? benef
    p.solicitante = solicitante ? { id: solicitante, nome: null, papel: t(s.solicitante_id) ? "Lançou a diária" : "Solicitou (própria)" } : null
    if (t(s.avaliador_id)) p.envolvidos.push({ id: String(s.avaliador_id), nome: null, papel: "Aprovou a diária" })
    return p
  }

  // 10–11. Reembolsos (filiado ou jurídico)
  if (tipo === "Reembolso") {
    const rf = await umaPor("filiacao_reembolsos", "ordem_pagamento_id", id)
    if (rf) {
      const fil = await porId("filiacoes", rf.filiado_id)
      const p = base("Reembolso a filiado(a)")
      p.titulo = fil ? t(fil.nome_completo) : "Reembolso"
      p.href = `/painel/filiados/reembolsos/${rf.id}`
      p.linhas = linhas([
        ["Filiado(a)", fil ? [t(fil.nome_completo), t(fil.cpf)].filter(Boolean).join(" · ") : null],
        ["Data", data(rf.data)],
        ["Justificativa", t(rf.justificativa)],
        ["Valor", moeda(rf.valor)],
        ["Devolução de cobrança indevida", t(rf.pagamento_indevido_id) ? "Sim" : null],
      ])
      p.solicitante = t(rf.criado_por) ? { id: String(rf.criado_por), nome: null, papel: "Lançou o reembolso" } : null
      return p
    }
    const rj = await umaPor("juridico_reembolsos", "ordem_pagamento_id", id)
    if (rj) {
      const proc = await porId("juridico_processos", rj.processo_id)
      const p = base("Reembolso ao escritório jurídico")
      p.titulo = proc ? `Processo ${t(proc.numero_processo) ?? "—"}` : "Reembolso jurídico"
      p.href = t(rj.processo_id) ? `/painel/juridico/processos/${rj.processo_id}` : null
      p.linhas = linhas([
        ["Escritório", proc ? await nomeEmpresa(proc.assessoria_id) : null],
        ["Despesa", t(rj.descricao_despesa)],
        ["Data da despesa", data(rj.data_despesa)],
        ["Valor", moeda(rj.valor)],
        ["Parecer da aprovação", t(rj.avaliacao_observacao)],
      ])
      p.solicitante = t(rj.solicitante_id) ? { id: String(rj.solicitante_id), nome: null, papel: "Registrou a despesa" } : null
      if (t(rj.avaliador_id)) p.envolvidos.push({ id: String(rj.avaliador_id), nome: null, papel: "Aprovou o reembolso" })
      p.documentos = [{ rotulo: "Comprovante da despesa", url: await assinar("juridico", rj.comprovante_despesa) }]
      return p
    }
    return base("Reembolso")
  }

  // 12. Multa de trânsito
  if (tipo === "Multa de trânsito") {
    const m = await umaPor("veiculos_infracoes", "ordem_pagamento_id", id)
    const p = base("Multa de trânsito")
    if (!m) return p
    const admin = await createAdminClient()
    const [veic, hist] = await Promise.all([
      porId("veiculos", m.veiculo_id),
      admin
        .from("veiculos_infracoes_historico")
        .select("usuario_id, evento")
        .eq("infracao_id", String(m.id))
        .in("evento", ["ordem_pagamento", "registro"]),
    ])
    const condutor = t(m.condutor_infrator_id)
    p.titulo = `Infração ${t(m.codigo) ?? t(m.infracao_auto_de) ?? ""}`.trim()
    p.href = `/painel/veiculos/infracoes/${m.id}`
    p.linhas = linhas([
      ["Veículo", veic ? [t(veic.placa), t(veic.marca_modelo)].filter(Boolean).join(" — ") : null],
      ["Condutor(a) infrator(a)", condutor ? ((await nomesDosUsuarios([condutor])).get(condutor) ?? null) : null],
      ["Data da infração", data(m.infracao_data)],
      ["Infração", t(m.infracao_tipo) ?? t(m.infracao_descricao)],
      ["Auto de infração", t(m.infracao_auto_de)],
      ["Órgão autuador", t(m.infracao_orgao_autuador)],
      ["Valor", moeda(m.infracao_custo)],
    ])
    const h = (hist.data ?? []) as Linha[]
    const gerou = h.find((x) => x.evento === "ordem_pagamento") ?? h.find((x) => x.evento === "registro")
    p.solicitante = t(gerou?.usuario_id) ? { id: String(gerou!.usuario_id), nome: null, papel: "Gerou a ordem da multa" } : null
    return p
  }

  // Ordem migrada do sistema anterior, sem vínculo de origem.
  const p = base(t(ordem.bubble_id) ? "Sistema anterior (migrada)" : "Origem não identificada")
  p.linhas = linhas([["Tipo", tipo || null]])
  return p
}

/** Ordem gerada pelo envio de uma remessa de diárias: cada diária e as despesas. */
async function procedenciaRemessa(r: Linha): Promise<Procedencia> {
  const admin = await createAdminClient()
  const diretor = r.beneficiario_tipo === "diretor"
  const p = base(diretor ? "Remessa de diárias de diretor(a)" : "Remessa de diárias de funcionário(a)")
  const { data: sols } = await admin
    .from("pessoal_diarias_solicitacoes")
    .select("*")
    .eq("remessa_id", String(r.id))
    .eq("situacao", "aprovada")
    .order("data_inicio", { ascending: true, nullsFirst: false })
  const diarias = (sols ?? []) as Linha[]
  const ids = diarias.map((d) => String(d.id))
  const tipoIds = [...new Set(diarias.map((d) => t(d.diaria_id)).filter((v): v is string => Boolean(v)))]
  const [tipos, despesas, tiposDespesa, deptos] = await Promise.all([
    tipoIds.length ? admin.from("financeiro_diarias").select("*").in("id", tipoIds) : Promise.resolve({ data: [] as Linha[] }),
    ids.length
      ? admin.from("pessoal_diarias_solicitacao_despesas").select("*").in("solicitacao_id", ids).order("created_at")
      : Promise.resolve({ data: [] as Linha[] }),
    admin.from("pessoal_diarias_despesa_tipos").select("id, nome"),
    admin.from("empresa_departamentos").select("id, departamento").in(
      "id",
      [...new Set(diarias.map((d) => t(d.departamento_id)).filter((v): v is string => Boolean(v)))].concat(["00000000-0000-0000-0000-000000000000"])
    ),
  ])
  const nomeTipo = new Map(((tipos.data ?? []) as Linha[]).map((x) => [String(x.id), t(x.nome) ?? t(x.diaria) ?? "Diária"]))
  const nomeTipoDespesa = new Map(((tiposDespesa.data ?? []) as Linha[]).map((x) => [String(x.id), t(x.nome) ?? "Despesa"]))
  const nomeDepto = new Map(((deptos.data ?? []) as Linha[]).map((x) => [String(x.id), t(x.departamento)]))
  const despesasPor = new Map<string, Linha[]>()
  for (const d of (despesas.data ?? []) as Linha[]) {
    const k = String(d.solicitacao_id)
    despesasPor.set(k, [...(despesasPor.get(k) ?? []), d])
  }

  let somaDiarias = 0
  let somaDespesas = 0
  let somaDescontos = 0
  const itens: NonNullable<Procedencia["detalhamento"]>["itens"] = []
  for (const d of diarias) {
    const desp = despesasPor.get(String(d.id)) ?? []
    const valorDiaria = n(d.valor_total) ?? 0
    const desconto = n(d.valor_descontos) ?? 0
    const valorDespesas = desp.reduce((a, x) => a + (n(x.valor) ?? 0), 0)
    somaDiarias += valorDiaria
    somaDescontos += desconto
    somaDespesas += valorDespesas
    const periodo = t(d.data_inicio)
      ? `${data(d.data_inicio)}${t(d.data_termino) && d.data_termino !== d.data_inicio ? ` a ${data(d.data_termino)}` : ""}`
      : null
    itens.push({
      descricao: `${nomeTipo.get(String(d.diaria_id)) ?? "Diária"} × ${n(d.quantidade) ?? 1} (${moeda(d.valor_unitario)} cada)`,
      detalhe: [periodo, t(d.departamento_id) ? nomeDepto.get(String(d.departamento_id)) : null, t(d.motivo)].filter(Boolean).join(" · ") || null,
      valor: moeda(valorDiaria - desconto + valorDespesas),
      subitens: [
        { descricao: "Diárias", valor: moeda(valorDiaria) },
        ...(desconto ? [{ descricao: "Infrações de trânsito descontadas", valor: `− ${moeda(desconto)}` }] : []),
        ...desp.map((x) => ({
          descricao: [nomeTipoDespesa.get(String(x.tipo_id)) ?? "Despesa", t(x.descricao)].filter(Boolean).join(" — "),
          valor: moeda(x.valor),
        })),
      ],
    })
    for (const x of desp) {
      if (t(x.comprovante)) {
        p.documentos.push({
          rotulo: `Comprovante — ${nomeTipoDespesa.get(String(x.tipo_id)) ?? "despesa"} (${data(d.data_inicio)})`,
          url: await assinar("comprovantes", x.comprovante),
        })
      }
    }
  }

  const benef = t(r.beneficiario_id)
  p.titulo = `Remessa ${t(r.codigo) ?? ""}`.trim()
  p.href = diretor ? `/painel/institucional/diretoria/diarias/remessas/${r.id}` : `/painel/pessoal/diarias/remessas/${r.id}`
  p.linhas = linhas([
    ["Beneficiário(a)", benef ? ((await nomesDosUsuarios([benef])).get(benef) ?? null) : null],
    ["Período", t(r.inicio) ? `${data(r.inicio)} a ${data(r.termino)}` : null],
    ["Diárias aprovadas", String(diarias.length)],
    ["Total das diárias", moeda(somaDiarias)],
    ["Infrações descontadas", somaDescontos ? moeda(somaDescontos) : null],
    ["Despesas", somaDespesas ? moeda(somaDespesas) : null],
    ["Total da remessa", moeda(somaDiarias - somaDescontos + somaDespesas)],
  ])
  p.detalhamento = {
    titulo: "Diárias da remessa",
    itens,
    total: moeda(somaDiarias - somaDescontos + somaDespesas),
  }
  const enviou = t(r.enviado_por)
  p.solicitante = enviou ? { id: enviou, nome: null, papel: "Enviou a remessa" } : null
  const avaliadores = [...new Set(diarias.map((d) => t(d.avaliador_id)).filter((v): v is string => Boolean(v)))]
  for (const a of avaliadores) p.envolvidos.push({ id: a, nome: null, papel: "Aprovou diária(s)" })
  const lancadores = [...new Set(diarias.map((d) => t(d.solicitante_id) ?? t(d.funcionario_id)).filter((v): v is string => Boolean(v)))]
  for (const l of lancadores) if (l !== enviou) p.envolvidos.push({ id: l, nome: null, papel: "Lançou diária(s)" })
  return p
}

/**
 * Minutas assinadas do contrato: o PDF assinado por fora (ICP-Brasil/gov.br,
 * bucket documentos) ou o PDF da minuta assinada eletronicamente no sistema.
 */
async function minutasDoContrato(contratoId: string): Promise<Procedencia["documentos"]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("contratos_minutas")
    .select("id, titulo, assinada_em, arquivo_assinado")
    .eq("contrato_id", contratoId)
    .order("updated_at", { ascending: false })
  if (error) return []
  const docs: Procedencia["documentos"] = []
  for (const m of (data ?? []) as Linha[]) {
    if (t(m.arquivo_assinado)) {
      docs.push({ rotulo: `Minuta assinada — ${t(m.titulo) ?? "contrato"}`, url: await assinar("documentos", m.arquivo_assinado), formalizacao: true })
    } else if (t(m.assinada_em)) {
      docs.push({ rotulo: `Minuta assinada no sistema — ${t(m.titulo) ?? "contrato"}`, url: `/painel/compras/contratos/minutas/${m.id}/pdf`, formalizacao: true })
    }
  }
  return docs
}

/**
 * Catálogo dos processos que enviam e-mail (lib/email.ts) e do módulo de cada
 * um — o equivalente de lib/ia-processos.ts para o e-mail (Gestão, 23/11/2026).
 *
 * Toda chamada a `enviarEmail` passa `processo` com uma chave daqui. O
 * registro (tabela email_envios) grava a chave e o módulo; a Gestão › E-mail
 * agrupa os envios por eles. `essencial` marca o que nunca poderá ser
 * desligado nem barrado por teto (acesso, códigos de confirmação, votação,
 * assinatura eletrônica).
 *
 * Processo novo: acrescente aqui (chave estável, rótulo em linguagem de
 * usuário, módulo e, se for o caso, `essencial`). Chave fora do catálogo
 * aparece como "Processo não identificado", no módulo "Outros".
 */

export type ModuloEmail = {
  slug: string
  titulo: string
}

export const MODULOS_EMAIL: ModuloEmail[] = [
  { slug: "acesso", titulo: "Acesso e senhas" },
  { slug: "filiados", titulo: "Filiados" },
  { slug: "oposicao", titulo: "Oposição" },
  { slug: "votacao", titulo: "Votações" },
  { slug: "representacao", titulo: "Representação" },
  { slug: "eventos", titulo: "Eventos" },
  { slug: "comunicacao", titulo: "Comunicação" },
  { slug: "compras", titulo: "Compras e contratos" },
  { slug: "financeiro", titulo: "Financeiro" },
  { slug: "viagens", titulo: "Viagens, hospedagem e diárias" },
  { slug: "pessoal", titulo: "Pessoal" },
  { slug: "veiculos", titulo: "Veículos" },
  { slug: "ferramentas", titulo: "Ferramentas" },
  { slug: "espacos", titulo: "Cessão de espaços" },
  { slug: "painel", titulo: "Avisos do sistema" },
  { slug: "plataforma", titulo: "Plataforma" },
  { slug: "outros", titulo: "Outros" },
]

export type ProcessoEmail = {
  chave: string
  titulo: string
  modulo: string
  /** Não pode ser desligado nem barrado (acesso, códigos, votação, assinatura). */
  essencial?: true
}

export const PROCESSOS_EMAIL: ProcessoEmail[] = [
  // Acesso e senhas
  { chave: "acesso.codigo", titulo: "Código de acesso (entrar sem senha)", modulo: "acesso", essencial: true },
  { chave: "acesso.redefinicao_senha", titulo: "Link para redefinir a senha", modulo: "acesso", essencial: true },
  { chave: "acesso.convite_primeiro_acesso", titulo: "Convite de primeiro acesso (área do associado)", modulo: "acesso", essencial: true },
  { chave: "acesso.reenvio", titulo: "Reenvio do e-mail de acesso", modulo: "acesso", essencial: true },
  { chave: "acesso.convite_painel", titulo: "Convite de acesso ao painel", modulo: "acesso", essencial: true },
  // Filiados
  { chave: "filiados.meus_dados_codigo", titulo: "Código para atualizar os dados (Meus dados)", modulo: "filiados", essencial: true },
  { chave: "filiados.ficha_online_link", titulo: "Link para continuar a ficha de filiação", modulo: "filiados", essencial: true },
  { chave: "filiados.solicitacao_resposta", titulo: "Resposta ao pedido de filiação", modulo: "filiados" },
  { chave: "filiados.portal_aviso", titulo: "Avisos ao filiado (área do associado)", modulo: "filiados" },
  { chave: "filiados.relacao_desconto", titulo: "Relação de desconto enviada à fonte pagadora", modulo: "filiados" },
  { chave: "filiados.relacao_cobranca", titulo: "Cobrança da relação de desconto à fonte pagadora", modulo: "filiados" },
  { chave: "filiados.repasse_link", titulo: "Link para a fonte enviar a relação de descontos", modulo: "filiados" },
  { chave: "filiados.repasse_recibo", titulo: "Recibo da relação de descontos recebida", modulo: "filiados" },
  { chave: "filiados.repasse_cobranca", titulo: "Cobrança da relação de descontos em lote", modulo: "filiados" },
  { chave: "filiados.repasse_automatico", titulo: "Pedido automático da relação de descontos", modulo: "filiados" },
  // Oposição
  { chave: "oposicao.carta_codigo", titulo: "Código para assinar a carta de oposição", modulo: "oposicao", essencial: true },
  { chave: "oposicao.carta_assinada", titulo: "Carta de oposição assinada", modulo: "oposicao", essencial: true },
  { chave: "oposicao.aviso_decisao", titulo: "Decisão sobre a oposição", modulo: "oposicao" },
  // Votações
  { chave: "votacao.aviso_link", titulo: "Aviso com o link pessoal de votação", modulo: "votacao", essencial: true },
  { chave: "votacao.aviso_teste", titulo: "Teste do aviso de votação", modulo: "votacao" },
  { chave: "votacao.aviso_previo", titulo: "Aviso prévio da votação (teste de entrega)", modulo: "votacao", essencial: true },
  { chave: "votacao.aviso_contato", titulo: "Aviso ao contato confirmado do eleitor", modulo: "votacao", essencial: true },
  { chave: "votacao.link_voto", titulo: "Link de voto pedido pelo eleitor", modulo: "votacao", essencial: true },
  { chave: "votacao.link_unico", titulo: "Confirmação do e-mail no link único", modulo: "votacao", essencial: true },
  { chave: "votacao.codigo_verificacao", titulo: "Código de verificação do eleitor", modulo: "votacao", essencial: true },
  { chave: "votacao.comprovante", titulo: "Comprovante de voto", modulo: "votacao", essencial: true },
  // Representação
  { chave: "representacao.congresso_inscricao", titulo: "Confirmação de inscrição no congresso", modulo: "representacao" },
  { chave: "representacao.congresso_link", titulo: "Link pessoal do congresso", modulo: "representacao" },
  // Eventos
  { chave: "eventos.inscricao", titulo: "Confirmação de inscrição em evento", modulo: "eventos" },
  { chave: "eventos.inscricao_codigo", titulo: "Código de confirmação da inscrição", modulo: "eventos", essencial: true },
  { chave: "eventos.comunicados", titulo: "E-mails do evento aos inscritos", modulo: "eventos" },
  // Comunicação
  { chave: "comunicacao.mensagens_filiados", titulo: "Mensagens aos filiados (aniversário e mala direta)", modulo: "comunicacao" },
  { chave: "comunicacao.mensagem_teste", titulo: "Teste da mala direta", modulo: "comunicacao" },
  { chave: "comunicacao.aniversario_teste", titulo: "Teste da mensagem de aniversário", modulo: "comunicacao" },
  { chave: "comunicacao.aniversariantes_equipe", titulo: "Lista de aniversariantes para a equipe", modulo: "comunicacao" },
  // Compras e contratos
  { chave: "compras.ordem_compra", titulo: "Ordem de compra ao fornecedor", modulo: "compras" },
  { chave: "compras.marketplace_notas", titulo: "Lembrete de notas fiscais a receber (marketplace)", modulo: "compras" },
  { chave: "compras.minuta_assinatura", titulo: "Assinatura eletrônica da minuta (convite e conclusão)", modulo: "compras", essencial: true },
  { chave: "compras.minuta_assinatura_codigo", titulo: "Código para assinar a minuta", modulo: "compras", essencial: true },
  { chave: "compras.rpa_assinatura", titulo: "Assinatura eletrônica do RPA (convite e conclusão)", modulo: "compras", essencial: true },
  { chave: "compras.rpa_assinatura_codigo", titulo: "Código para assinar o RPA", modulo: "compras", essencial: true },
  { chave: "compras.rpa_lembrete", titulo: "Lembrete de RPA a assinar", modulo: "compras" },
  { chave: "compras.rpa_contabilidade", titulo: "Relatório de RPAs à contabilidade", modulo: "compras" },
  // Financeiro
  { chave: "financeiro.comprovante_fornecedor", titulo: "Comprovante de pagamento ao fornecedor", modulo: "financeiro" },
  { chave: "financeiro.pedido_dados_bancarios", titulo: "Pedido de dados bancários", modulo: "financeiro" },
  { chave: "financeiro.reembolso", titulo: "Andamento do reembolso", modulo: "financeiro" },
  // Viagens, hospedagem e diárias
  { chave: "viagens.pedido", titulo: "Pedido de viagem (equipe e viajante)", modulo: "viagens" },
  { chave: "viagens.atendimento", titulo: "Andamento do atendimento da viagem", modulo: "viagens" },
  { chave: "viagens.hospedagem_reserva", titulo: "Reserva de hospedagem confirmada", modulo: "viagens" },
  { chave: "viagens.hospedagem_fila", titulo: "Vaga liberada na fila de espera da hospedagem", modulo: "viagens" },
  { chave: "viagens.hospedagem_avaliacao", titulo: "Convite para avaliar a hospedagem", modulo: "viagens" },
  { chave: "viagens.diaria_avaliacao", titulo: "Avaliação da diária", modulo: "viagens" },
  { chave: "viagens.diarias_remessa", titulo: "Aviso da remessa de diárias", modulo: "viagens" },
  // Pessoal
  { chave: "pessoal.ferias_assinatura", titulo: "Assinatura do aviso de férias (convite e conclusão)", modulo: "pessoal", essencial: true },
  { chave: "pessoal.ferias_assinatura_codigo", titulo: "Código para assinar o aviso de férias", modulo: "pessoal", essencial: true },
  { chave: "pessoal.ferias_autorizacao", titulo: "Autorização do gozo de férias", modulo: "pessoal" },
  { chave: "pessoal.carreira", titulo: "Mudança na carreira", modulo: "pessoal" },
  { chave: "pessoal.informe_rendimentos", titulo: "Informe de rendimentos disponível", modulo: "pessoal" },
  { chave: "pessoal.documento_liberado", titulo: "Documento liberado no Pessoal", modulo: "pessoal" },
  // Veículos
  { chave: "veiculos.aviso", titulo: "Avisos ao condutor", modulo: "veiculos" },
  { chave: "veiculos.infracao", titulo: "Aviso de infração de trânsito", modulo: "veiculos" },
  // Ferramentas
  { chave: "ferramentas.oficio_assinatura", titulo: "Assinatura eletrônica do ofício (convite, andamento e conclusão)", modulo: "ferramentas", essencial: true },
  { chave: "ferramentas.oficio_assinatura_codigo", titulo: "Código para assinar o ofício", modulo: "ferramentas", essencial: true },
  // Cessão de espaços
  { chave: "espacos.solicitacao_codigo", titulo: "Código de confirmação do pedido de espaço", modulo: "espacos", essencial: true },
  { chave: "espacos.solicitacao_recibo", titulo: "Recibo do pedido de espaço", modulo: "espacos" },
  { chave: "espacos.solicitacao_andamento", titulo: "Andamento do pedido de espaço", modulo: "espacos" },
  { chave: "espacos.termo_assinatura", titulo: "Assinatura do termo de cessão (convite e conclusão)", modulo: "espacos", essencial: true },
  { chave: "espacos.termo_assinatura_codigo", titulo: "Código para assinar o termo de cessão", modulo: "espacos", essencial: true },
  // Avisos do sistema
  { chave: "painel.aviso", titulo: "Avisos do sistema por e-mail (os do sino)", modulo: "painel" },
  // Plataforma
  { chave: "plataforma.nova_entidade", titulo: "Acesso da nova entidade", modulo: "plataforma", essencial: true },
]

const POR_CHAVE = new Map(PROCESSOS_EMAIL.map((p) => [p.chave, p]))
const MODULO_POR_SLUG = new Map(MODULOS_EMAIL.map((m) => [m.slug, m]))

export const PROCESSO_EMAIL_NAO_IDENTIFICADO = "nao_identificado"

export function processoEmail(chave: string | null | undefined): ProcessoEmail {
  return (
    (chave && POR_CHAVE.get(chave)) || {
      chave: chave || PROCESSO_EMAIL_NAO_IDENTIFICADO,
      titulo: "Processo não identificado",
      modulo: "outros",
    }
  )
}

export function tituloModuloEmail(slug: string | null | undefined): string {
  return (slug && MODULO_POR_SLUG.get(slug)?.titulo) || "Outros"
}

/**
 * Marca do e-mail no cabeçalho X-Mailin-custom, que o Brevo devolve em cada
 * evento do webhook. O id do registro vai no fim (`|e:<uuid>`), depois de uma
 * marca que já exista (a da votação: `voto|…`).
 */
export function marcaComEnvio(marcaAtual: string | undefined, envioId: string): string {
  return marcaAtual ? `${marcaAtual}|e:${envioId}` : `e:${envioId}`
}

const ENVIO = /(?:^|\|)e:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Id do registro na marca devolvida pelo Brevo; null sem ele. */
export function envioDaMarca(marca: string): string | null {
  return ENVIO.exec(marca.trim())?.[1] ?? null
}

/** A marca sem o id do registro (para quem já lia a marca antiga, como a votação). */
export function marcaSemEnvio(marca: string): string {
  return marca.trim().replace(/(?:^|\|)e:[0-9a-f-]{36}$/i, "")
}

const REJEICOES = new Set(["hard_bounce", "invalid_email", "blocked", "spam", "complaint"])
const ADIAMENTOS = new Set(["soft_bounce", "deferred"])

function quandoDoEvento(e: Record<string, unknown>): string {
  const epoch = Number(e.ts_event ?? e.ts_epoch ?? e.ts)
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch > 1e12 ? epoch : epoch * 1000).toISOString()
  const d = new Date(String(e.date ?? ""))
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/**
 * Colunas de email_envios que um evento do webhook do Brevo atualiza: entrega,
 * adiamento (o provedor ainda tenta) ou rejeição definitiva. null = evento
 * que não muda o registro (clique, abertura…).
 */
export function mudancaDoEvento(e: Record<string, unknown>): Record<string, string> | null {
  const evento = String(e.event ?? "").toLowerCase()
  const em = quandoDoEvento(e)
  if (evento === "delivered") return { entregue_em: em }
  if (ADIAMENTOS.has(evento)) return { adiado_em: em }
  if (REJEICOES.has(evento)) return { rejeitado_em: em, rejeicao: `${evento}${e.reason ? `: ${String(e.reason)}` : ""}`.slice(0, 200) }
  return null
}

/** Como o envio terminou, do ponto de vista de quem consulta (Gestão › E-mail). */
export type EstadoEnvio = "entregue" | "rejeitado" | "adiado" | "aguardando" | "falhou" | "barrado" | "teste" | "sem_configuracao" | "enviando"

export const ROTULO_ESTADO: Record<EstadoEnvio, string> = {
  entregue: "Entregue",
  rejeitado: "Rejeitado",
  adiado: "Adiado",
  aguardando: "Enviado, sem retorno",
  falhou: "Não saiu",
  barrado: "Barrado pela Gestão",
  teste: "Teste (não entregue)",
  sem_configuracao: "Envio não configurado",
  enviando: "Enviando",
}

/**
 * O estado que vale de um envio: a rejeição definitiva vence a entrega (o
 * provedor pode avisar a entrega e depois a reclamação de spam); a entrega
 * vence o adiamento; sem retorno do provedor, vale a situação do envio.
 */
export function estadoDoEnvio(e: { situacao: string; entregueEm: string | null; adiadoEm: string | null; rejeitadoEm: string | null }): EstadoEnvio {
  if (e.situacao === "falhou" || e.situacao === "barrado" || e.situacao === "teste" || e.situacao === "sem_configuracao" || e.situacao === "enviando") return e.situacao
  if (e.rejeitadoEm) return "rejeitado"
  if (e.entregueEm) return "entregue"
  if (e.adiadoEm) return "adiado"
  return "aguardando"
}

/** Filtro de situação do histórico (Gestão › E-mail). */
export const FILTROS_SITUACAO = [
  { valor: "problemas", rotulo: "Com problema (não saiu, rejeitado ou adiado)" },
  { valor: "rejeitado", rotulo: "Rejeitados" },
  { valor: "falhou", rotulo: "Não saíram" },
  { valor: "barrado", rotulo: "Barrados pela Gestão" },
  { valor: "adiado", rotulo: "Adiados" },
  { valor: "entregue", rotulo: "Entregues" },
  { valor: "aguardando", rotulo: "Enviados, sem retorno" },
] as const

/** Controles da Gestão sobre o envio (tabela email_config). */
export type ControlesEmail = {
  modulosDesligados: string[]
  limiteMensal: number | null
  bloquearNoLimite: boolean
  cotasDepartamento: Record<string, number>
}

export const CONTROLES_PADRAO: ControlesEmail = { modulosDesligados: [], limiteMensal: null, bloquearNoLimite: false, cotasDepartamento: {} }

/**
 * Se o e-mail pode sair (null) ou o motivo de barrar. O endereço bloqueado
 * (rejeitado de vez ou bloqueado à mão) barra qualquer processo: não adianta
 * insistir. Módulo desligado, teto e cota nunca barram os essenciais (acesso,
 * códigos, votação, assinatura); teto e cota só barram com "parar no teto".
 */
export function motivoParaBarrar(p: {
  processo: string
  controles: ControlesEmail
  enderecoBloqueado: boolean
  enviadosNoMes: number
  departamentoId: string | null
  enviadosDoDepartamento: number
}): string | null {
  if (p.enderecoBloqueado) return "Endereço bloqueado na Gestão › E-mail (rejeitado de vez ou bloqueado à mão)."
  const proc = processoEmail(p.processo)
  if (proc.essencial) return null
  const c = p.controles
  if (c.modulosDesligados.includes(proc.modulo)) return `E-mail desligado no módulo ${tituloModuloEmail(proc.modulo)} (Gestão › E-mail).`
  if (c.bloquearNoLimite && c.limiteMensal !== null && p.enviadosNoMes >= c.limiteMensal) {
    return "O teto mensal de e-mails da entidade foi atingido (Gestão › E-mail)."
  }
  const cota = p.departamentoId ? c.cotasDepartamento[p.departamentoId] : undefined
  if (c.bloquearNoLimite && cota !== undefined && p.enviadosDoDepartamento >= cota) {
    return "A cota mensal de e-mails do departamento foi atingida (Gestão › E-mail)."
  }
  return null
}

// ── Conta própria da entidade (fase 4) ──────────────────────────────────────

/** Chave com cara de chave do provedor: Brevo "xkeysib-…", Resend "re_…". */
export function chaveEmailParecida(provedor: "brevo" | "resend", chave: string): boolean {
  return provedor === "brevo" ? /^xkeysib-[A-Za-z0-9-]{20,}$/.test(chave) : /^re_[A-Za-z0-9_]{10,}$/.test(chave)
}

export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** O remetente pertence a um domínio verificado da conta (o próprio ou um subdomínio dele). */
export function remetenteNoDominio(email: string, dominios: { nome: string; verificado: boolean }[]): boolean {
  const d = email.trim().toLowerCase().split("@")[1]
  if (!d) return false
  return dominios.some((x) => x.verificado && (d === x.nome || d.endsWith(`.${x.nome}`)))
}

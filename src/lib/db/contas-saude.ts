import "server-only"

import { assinaturaTitular, chaveDaConta, chaveDoPix, contaConferida } from "@/lib/bancos"
import { cpfConfiavel, lerDocumentoTitular, limparCpf, mesmoTitular } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { donosDaPessoa, donosPorCpf, type TipoDono } from "@/lib/db/dados-bancarios-pessoa"
import { destinoDaForma, ordensSemDestinoBancario } from "@/lib/db/ordens-destino"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * SAÚDE DAS CONTAS BANCÁRIAS (27/10/2026) — Financeiro › Contas bancárias.
 * O que era o script de revisão (scripts/revisar-contas-bancarias.mjs) virou
 * tela com ação: contas repetidas da mesma pessoa (com "Juntar"), a mesma
 * conta em cadastros de CPFs diferentes, documento do titular de outra pessoa
 * e contas sem documento (com o campo para corrigir). CPF sai mascarado.
 */

export type DonoConta = { tipo: TipoDono; id: string; nome: string; documento: string | null }

export type ContaRevisao = {
  id: string
  dono: DonoConta
  banco: string | null
  agencia: string | null
  conta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  titularDocumento: string | null
  favorito: boolean
  ordens: number
  /** Ordens ainda por pagar com esta conta e o valor delas: o que está em jogo agora. */
  abertas: number
  valorAberto: number
  /** Marcada como conferida (e o titular não mudou desde então). */
  conferida: { em: string; por: string | null; obs: string | null } | null
}

export type GrupoRepetido = { fica: ContaRevisao; copias: ContaRevisao[] }
export type OutroTitular = { conta: ContaRevisao; motivo: "cadastro_incompleto" | "digitacao" | "outro" }
export type SemDocumento = { conta: ContaRevisao; dica: string | null }

export type SaudeContas = {
  total: number
  repetidas: GrupoRepetido[]
  cruzadas: ContaRevisao[][]
  outroTitular: OutroTitular[]
  semDocumento: SemDocumento[]
  /** Contas que sairiam nas listas acima, mas alguém conferiu e aceitou. */
  conferidas: ContaRevisao[]
}

export function mascararDocumento(d: string | null): string {
  if (!d) return "sem documento"
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  return d
}

/** Texto livre (ex.: o titular digitado) com CPF mascarado; CNPJ fica. */
export function mascararTexto(v: string): string {
  return v.replace(/\d[\d./\s-]{7,}\d/g, (m) => {
    const d = m.replace(/\D/g, "")
    if (d.length === 14) return mascararDocumento(d)
    return d.length >= 9 ? `***${d.slice(3, -2)}**` : m
  })
}

const distancia = (a: string, b: string) => (a.length !== b.length ? 99 : [...a].filter((c, i) => c !== b[i]).length)

const VAZIAS = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "de", "da", "do", "das", "dos", "e", "cia", "mei", "slu"])
const palavras = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !VAZIAS.has(p) && !/^\d+$/.test(p))
function nomeBate(titular: string, nome: string): boolean {
  const dele = palavras(titular)
  const fav = palavras(nome)
  if (!dele.length || !fav.length) return true
  return dele.filter((p) => fav.includes(p)).length / Math.min(dele.length, fav.length) >= 0.6
}

async function todas(tabela: string, colunas: string, filtro: (q: any) => any = (q) => q): Promise<Record<string, unknown>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const admin = await createAdminClient()
  const saida: Record<string, unknown>[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await filtro(admin.from(tabela).select(colunas)).order("id").range(i, i + 999)
    if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`)
    saida.push(...((data ?? []) as Record<string, unknown>[]))
    if ((data ?? []).length < 1000) break
  }
  return saida
}

const SITUACOES_ABERTAS = ["Em autorização", "A pagar", "Aguardando informações", "Aguardando documento fiscal"]

/** Peso para ordenar: valor das ordens abertas; sem valor informado, conta pelo número delas. */
const emJogo = (cs: ContaRevisao[]) => cs.reduce((s, c) => s + c.valorAberto + c.abertas * 0.01, 0)

/** Ordena para escolher a que fica: favorita, mais usada, com documento, mais antiga. */
const melhor = (a: ContaRevisao & { criada: string }, b: ContaRevisao & { criada: string }) =>
  Number(b.favorito) - Number(a.favorito) ||
  b.ordens - a.ordens ||
  Number(Boolean(b.titularDocumento)) - Number(Boolean(a.titularDocumento)) ||
  a.criada.localeCompare(b.criada)

export async function saudeDasContas(): Promise<SaudeContas> {
  const emp = await tenantAtual()
  const [contas, empresas, usuarios, filiacoes, usos] = await Promise.all([
    todas(
      "dados_bancarios",
      "id, favorecido, banco, agencia, conta, pix, pix_tipo, fornecedor_id, usuario_id, filiado_id, favorito, titular_documento, created_at, conferida_em, conferida_por_usuario_id, conferida_obs, conferida_titular"
    ),
    todas("empresa", "id, empresa, nome_fantasia, nome_razao, cnpj_cpf", (q) => q.eq("emp_proprietaria_id", emp)),
    todas("usuarios", "id, nome_completo, nome_guerra, cpf", (q) => q.eq("emp_proprietaria_id", emp)),
    todas("filiacoes", "id, nome_completo, cpf", (q) => q.eq("emp_proprietaria_id", emp)),
    todas("ordens_pagamento", "id, dados_bancarios_id, situacao, excluido, valor, valor_inicial_cobranca", (q) =>
      q.eq("emp_proprietaria_id", emp).not("dados_bancarios_id", "is", null)
    ),
  ])
  const ordensPorConta = new Map<string, { ordens: number; abertas: number; valorAberto: number }>()
  for (const o of usos) {
    const k = String(o.dados_bancarios_id)
    const u = ordensPorConta.get(k) ?? { ordens: 0, abertas: 0, valorAberto: 0 }
    u.ordens += 1
    if (o.excluido !== true && SITUACOES_ABERTAS.includes(String(o.situacao))) {
      u.abertas += 1
      u.valorAberto += Number(o.valor_inicial_cobranca ?? o.valor ?? 0) || 0
    }
    ordensPorConta.set(k, u)
  }
  const doc = (v: unknown) => limparCpf(texto(v) ?? "") || null
  const donos = new Map<string, DonoConta>()
  for (const e of empresas) donos.set(`f:${e.id}`, { tipo: "fornecedor", id: String(e.id), nome: texto(e.nome_fantasia) ?? texto(e.empresa) ?? texto(e.nome_razao) ?? "Fornecedor", documento: doc(e.cnpj_cpf) })
  for (const u of usuarios) donos.set(`u:${u.id}`, { tipo: "usuario", id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "Usuário", documento: doc(u.cpf) })
  for (const f of filiacoes) donos.set(`p:${f.id}`, { tipo: "filiado", id: String(f.id), nome: texto(f.nome_completo) ?? "Filiado", documento: doc(f.cpf) })

  const linhas: (ContaRevisao & { criada: string; pessoa: string; chave: string | null })[] = []
  for (const c of contas) {
    const k = c.fornecedor_id ? `f:${c.fornecedor_id}` : c.usuario_id ? `u:${c.usuario_id}` : c.filiado_id ? `p:${c.filiado_id}` : null
    const dono = k ? donos.get(k) : undefined
    if (!dono) continue
    const cpf = cpfConfiavel(dono.documento)
    const chaveConta = chaveDaConta(texto(c.agencia), texto(c.conta))
    linhas.push({
      id: String(c.id),
      dono,
      banco: texto(c.banco),
      agencia: texto(c.agencia),
      conta: texto(c.conta),
      pix: texto(c.pix),
      pixTipo: texto(c.pix_tipo),
      favorecido: texto(c.favorecido),
      titularDocumento: texto(c.titular_documento),
      favorito: c.favorito === true,
      ordens: ordensPorConta.get(String(c.id))?.ordens ?? 0,
      abertas: ordensPorConta.get(String(c.id))?.abertas ?? 0,
      valorAberto: ordensPorConta.get(String(c.id))?.valorAberto ?? 0,
      conferida: contaConferida(c)
        ? {
            em: String(c.conferida_em),
            por: donos.get(`u:${c.conferida_por_usuario_id}`)?.nome ?? null,
            obs: texto(c.conferida_obs),
          }
        : null,
      criada: String(c.created_at ?? ""),
      // a mesma pessoa: o CPF (todos os papéis) ou o próprio cadastro
      pessoa: cpf ? `cpf:${cpf}` : `dono:${k}`,
      chave: chaveConta ?? (texto(c.pix) ? `pix|${chaveDoPix(texto(c.pix))}` : null),
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descarta os campos internos
  const limpa = ({ criada: _c, pessoa: _p, chave: _k, ...l }: (typeof linhas)[number]): ContaRevisao => l

  // Repetidas: a mesma conta (ou só-Pix) na mesma pessoa.
  const grupos = new Map<string, typeof linhas>()
  for (const l of linhas) if (l.chave) grupos.set(`${l.pessoa}#${l.chave}`, [...(grupos.get(`${l.pessoa}#${l.chave}`) ?? []), l])
  const repetidas = [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const [fica, ...copias] = [...g].sort(melhor)
      return { fica: limpa(fica), copias: copias.map(limpa) }
    })
    .sort(
      (a, b) =>
        emJogo([b.fica, ...b.copias]) - emJogo([a.fica, ...a.copias]) ||
        b.copias.length - a.copias.length ||
        a.fica.dono.nome.localeCompare(b.fica.dono.nome)
    )

  // A mesma agência+conta em pessoas diferentes.
  const porConta = new Map<string, typeof linhas>()
  for (const l of linhas) if (l.chave && !l.chave.startsWith("pix|")) porConta.set(l.chave, [...(porConta.get(l.chave) ?? []), l])
  // Conferida: sai das listas e vai para "Conferidas" (com Desfazer).
  const conferidas = new Map<string, ContaRevisao>()
  const cruzadas = [...porConta.values()]
    .filter((g) => new Set(g.map((l) => l.pessoa)).size > 1)
    .filter((g) => {
      if (!g.every((l) => l.conferida)) return true
      for (const l of g) conferidas.set(l.id, limpa(l))
      return false
    })
    .map((g) => g.map(limpa))
    .sort((a, b) => emJogo(b) - emJogo(a))

  const outroTitular: OutroTitular[] = []
  const semDocumento: SemDocumento[] = []
  for (const l of linhas) {
    if (!texto(l.conta)) continue
    const dono = l.dono.documento
    const pediria = l.titularDocumento
      ? Boolean(dono && !mesmoTitular(l.titularDocumento, dono))
      : Boolean(l.favorecido && (limparCpf(l.favorecido).length >= 9 || !nomeBate(l.favorecido, l.dono.nome)))
    if (pediria && l.conferida) {
      conferidas.set(l.id, limpa(l))
      continue
    }
    if (l.titularDocumento) {
      if (dono && !mesmoTitular(l.titularDocumento, dono)) {
        const incompleto = dono.length < l.titularDocumento.length && (l.titularDocumento.startsWith(dono) || l.titularDocumento.endsWith(dono))
        outroTitular.push({ conta: limpa(l), motivo: incompleto ? "cadastro_incompleto" : distancia(l.titularDocumento, dono) <= 2 ? "digitacao" : "outro" })
      }
    } else if (l.favorecido && (limparCpf(l.favorecido).length >= 9 || !nomeBate(l.favorecido, l.dono.nome))) {
      const d = limparCpf(l.favorecido)
      const dica = !dono || d.length < 9 ? null : d === dono ? "mesmos dígitos do cadastro, mas não passa na validação" : distancia(d, dono) <= 2 ? "parece digitação do documento do cadastro" : null
      semDocumento.push({ conta: limpa(l), dica })
    }
  }
  // Primeiro o dinheiro em jogo (ordens abertas), depois o nome.
  const porPrioridade = (a: { conta: ContaRevisao }, b: { conta: ContaRevisao }) =>
    emJogo([b.conta]) - emJogo([a.conta]) || a.conta.dono.nome.localeCompare(b.conta.dono.nome)
  return {
    total: linhas.length,
    repetidas,
    cruzadas,
    outroTitular: outroTitular.sort(porPrioridade),
    semDocumento: semDocumento.sort(porPrioridade),
    conferidas: [...conferidas.values()].sort((a, b) => (b.conferida?.em ?? "").localeCompare(a.conferida?.em ?? "")),
  }
}

/**
 * CONFERIDA (28/10/2026): quem paga ordens aceita a conta como está (conta do
 * cônjuge, do MEI, de terceiro autorizado). Guarda o titular do momento: se
 * ele mudar, a conferência deixa de valer sozinha (contaConferida).
 */
export async function conferirContas(ids: string[], obs: string | null, usuarioId: string | null): Promise<{ erro?: string }> {
  if (ids.length === 0) return { erro: "Nenhuma conta." }
  const admin = await createAdminClient()
  const { data: contas, error } = await admin.from("dados_bancarios").select("id, titular_documento, favorecido").in("id", ids)
  if (error) return { erro: `Não foi possível ler as contas: ${error.message}` }
  if ((contas ?? []).length !== ids.length) return { erro: "Conta não encontrada." }
  const em = new Date().toISOString()
  for (const c of contas as Record<string, unknown>[]) {
    const { error: e } = await admin
      .from("dados_bancarios")
      .update({
        conferida_em: em,
        conferida_por_usuario_id: usuarioId,
        conferida_obs: obs,
        conferida_titular: assinaturaTitular(c.titular_documento, c.favorecido),
      })
      .eq("id", String(c.id))
    if (e) return { erro: `Não foi possível gravar: ${e.message}` }
  }
  return {}
}

/** Desfaz a conferência: a conta volta para a lista. */
export async function desfazerConferencia(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("dados_bancarios")
    .update({ conferida_em: null, conferida_por_usuario_id: null, conferida_obs: null, conferida_titular: null })
    .eq("id", id)
    .select("id")
  if (error) return { erro: `Não foi possível desfazer: ${error.message}` }
  if (!data?.length) return { erro: "Conta não encontrada." }
  return {}
}

/**
 * Junta as cópias na conta que fica: ela herda o que só as cópias tinham, as
 * ordens das cópias passam para ela e as cópias saem. Confere que todas são da
 * mesma pessoa e a mesma conta/chave — a tela não decide sozinha.
 */
export async function juntarContas(ficaId: string, copiaIds: string[]): Promise<{ erro?: string; ordens?: number }> {
  if (copiaIds.length === 0 || copiaIds.includes(ficaId)) return { erro: "Nada para juntar." }
  const admin = await createAdminClient()
  const { data } = await admin
    .from("dados_bancarios")
    .select("id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, titular_documento, favorito, fornecedor_id, usuario_id, filiado_id")
    .in("id", [ficaId, ...copiaIds])
  const linhas = (data ?? []) as Record<string, unknown>[]
  const fica = linhas.find((l) => String(l.id) === ficaId)
  const copias = linhas.filter((l) => copiaIds.includes(String(l.id)))
  if (!fica || copias.length !== copiaIds.length) return { erro: "Alguma conta não foi encontrada (já foi juntada?). Recarregue a página." }
  const chave = (l: Record<string, unknown>) => chaveDaConta(texto(l.agencia), texto(l.conta)) ?? `pix|${chaveDoPix(texto(l.pix))}`
  if (copias.some((c) => chave(c) !== chave(fica))) return { erro: "As contas não são a mesma conta/chave." }
  const tipo: TipoDono = fica.fornecedor_id ? "fornecedor" : fica.usuario_id ? "usuario" : "filiado"
  const pessoa = await donosDaPessoa(tipo, String(fica.fornecedor_id ?? fica.usuario_id ?? fica.filiado_id))
  const daPessoa = (c: Record<string, unknown>) =>
    (c.fornecedor_id && pessoa.fornecedor_id.includes(String(c.fornecedor_id))) ||
    (c.usuario_id && pessoa.usuario_id.includes(String(c.usuario_id))) ||
    (c.filiado_id && pessoa.filiado_id.includes(String(c.filiado_id)))
  if (!copias.every(daPessoa)) return { erro: "As contas são de pessoas diferentes; não dá para juntar." }

  const { data: movidas, error: e1 } = await admin.from("ordens_pagamento").update({ dados_bancarios_id: ficaId }).in("dados_bancarios_id", copiaIds).select("id")
  if (e1) return { erro: `Não foi possível repassar as ordens: ${e1.message}` }
  const { error: e2 } = await admin.from("dados_bancarios").delete().in("id", copiaIds)
  if (e2) return { erro: `Não foi possível remover as cópias: ${e2.message}` }
  const patch: Record<string, unknown> = {}
  for (const campo of ["banco", "banco_codigo", "tipo_conta", "pix", "pix_tipo", "titular_documento"]) {
    if (!texto(fica[campo])) {
      const de = copias.find((c) => texto(c[campo]))
      if (de) patch[campo] = de[campo]
    }
  }
  if (!fica.favorito && copias.some((c) => c.favorito)) patch.favorito = true
  if (Object.keys(patch).length) await admin.from("dados_bancarios").update(patch).eq("id", ficaId)
  return { ordens: (movidas ?? []).length }
}

/** Grava o CPF/CNPJ do titular de uma conta (validado). */
export async function corrigirTitular(contaId: string, documento: string): Promise<{ erro?: string }> {
  const lido = lerDocumentoTitular(documento)
  if (lido.erro || !lido.documento) return { erro: lido.erro ?? "Informe o CPF/CNPJ do titular." }
  const admin = await createAdminClient()
  const { data, error } = await admin.from("dados_bancarios").update({ titular_documento: lido.documento }).eq("id", contaId).select("id")
  if (error) return { erro: `Não foi possível gravar: ${error.message}` }
  if (!data?.length) return { erro: "Conta não encontrada." }
  return {}
}

/** Quantos casos a tela Contas bancárias tem para resolver (o selo do card no Financeiro). */
export async function contarPendenciasContas(): Promise<number> {
  const [s, esperando] = await Promise.all([saudeDasContas(), ordensEsperandoConta()])
  return esperando.length + s.repetidas.length + s.cruzadas.length + s.outroTitular.length + s.semDocumento.length
}

/** Ordem aberta sem forma nem conta: espera o favorecido mandar os dados bancários. */
export type OrdemEsperandoConta = {
  id: string
  codigo: string | null
  tipo: string | null
  situacao: string
  valor: number | null
  vencimento: string | null
  /** null: sem forma; "Pix"/TED: a forma está lá, falta a chave ou a conta. */
  forma: string | null
  favorecido: string
  /** O cadastro a quem pedir a conta (null: favorecido avulso sem cadastro). */
  dono: DonoConta | null
  email: string | null
  telefone: string | null
  pedido: { id: string; criadoEm: string; abertoEm: string | null; enviadoPara: string | null } | null
}

/**
 * ORDENS ESPERANDO CONTA (28/10/2026): as ordens abertas que ainda estão sem
 * forma e sem dado bancário (anteriores à forma obrigatória) e, desde 30/10,
 * as que já têm Pix/TED mas nenhuma chave ou conta que a remessa use
 * (ordensSemDestinoBancario, a mesma regra da trava). O dono é o
 * favorecido da ordem — fornecedor, usuário, filiado do reembolso, favorecido
 * do custeio ou, no avulso, quem tem o CPF informado. Quando ele responde ao
 * pedido, ligarOrdensSemForma completa a ordem.
 */
export async function ordensEsperandoConta(): Promise<OrdemEsperandoConta[]> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const abertas = await todas(
    "ordens_pagamento",
    "id, codigo, tipo, situacao, valor, valor_inicial_cobranca, vencimento, forma_pagamento, dados_bancarios_id, pix_codigo, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, beneficiario_doc_avulso, custeio_id",
    (q) =>
      q
        .eq("emp_proprietaria_id", emp)
        .or("excluido.is.null,excluido.eq.false")
        .in("situacao", SITUACOES_ABERTAS)
  )
  // Sem forma e sem conta, ou já com Pix/TED que a remessa não conseguiria pagar.
  const semDestino = await ordensSemDestinoBancario(abertas.filter((o) => destinoDaForma(o.forma_pagamento) !== null))
  const ordens = abertas.filter((o) => (!texto(o.forma_pagamento) && !texto(o.dados_bancarios_id)) || semDestino.has(String(o.id)))
  if (ordens.length === 0) return []
  const ids = ordens.map((o) => String(o.id))
  const custeioIds = [...new Set(ordens.map((o) => texto(o.custeio_id)).filter((v): v is string => Boolean(v)))]
  const vazio = Promise.resolve({ data: [] as Record<string, unknown>[] })
  const [{ data: reembolsos }, { data: custeios }] = await Promise.all([
    admin.from("filiacao_reembolsos").select("ordem_pagamento_id, filiado_id").in("ordem_pagamento_id", ids),
    custeioIds.length ? admin.from("institucional_custeios").select("id, filiacao_id, fornecedor_id").in("id", custeioIds) : vazio,
  ])
  const filiadoDaOrdem = new Map(((reembolsos ?? []) as Record<string, unknown>[]).map((r) => [String(r.ordem_pagamento_id), String(r.filiado_id)]))
  const custeioPorId = new Map(((custeios ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]))

  type Alvo = { tipo: TipoDono; id: string } | null
  const alvos: Alvo[] = await Promise.all(
    ordens.map(async (o): Promise<Alvo> => {
      const fornecedor = texto(o.beneficiario_fornecedor_id) ?? texto(o.fornecedor_id)
      if (fornecedor) return { tipo: "fornecedor", id: fornecedor }
      const usuario = texto(o.beneficiario_usuario_id)
      if (usuario) return { tipo: "usuario", id: usuario }
      const filiado = filiadoDaOrdem.get(String(o.id))
      if (filiado) return { tipo: "filiado", id: filiado }
      const c = custeioPorId.get(String(o.custeio_id))
      if (c && texto(c.filiacao_id)) return { tipo: "filiado", id: String(c.filiacao_id) }
      if (c && texto(c.fornecedor_id)) return { tipo: "fornecedor", id: String(c.fornecedor_id) }
      const cpf = cpfConfiavel(limparCpf(texto(o.beneficiario_doc_avulso) ?? ""))
      if (!cpf) return null
      const d = await donosPorCpf(cpf)
      if (d.filiado_id[0]) return { tipo: "filiado", id: d.filiado_id[0] }
      if (d.usuario_id[0]) return { tipo: "usuario", id: d.usuario_id[0] }
      if (d.fornecedor_id[0]) return { tipo: "fornecedor", id: d.fornecedor_id[0] }
      return null
    })
  )

  const contatos = await contatosDosDonos(alvos.filter((a): a is NonNullable<Alvo> => a !== null))

  return ordens
    .map((o, i): OrdemEsperandoConta => {
      const a = alvos[i]
      const c = a ? contatos.get(`${a.tipo}:${a.id}`) : undefined
      const valor = o.valor_inicial_cobranca ?? o.valor
      return {
        id: String(o.id),
        codigo: texto(o.codigo),
        tipo: texto(o.tipo),
        situacao: String(o.situacao),
        valor: valor == null ? null : Number(valor),
        vencimento: texto(o.vencimento),
        forma: texto(o.forma_pagamento),
        favorecido: c?.dono.nome ?? texto(o.beneficiario_nome_avulso) ?? "Favorecido sem cadastro",
        dono: c?.dono ?? null,
        email: c?.email ?? null,
        telefone: c?.telefone ?? null,
        pedido: c?.pedido ?? null,
      }
    })
    .sort((x, y) => (x.vencimento ?? "9999").localeCompare(y.vencimento ?? "9999"))
}

/** O cadastro de quem recebe, com o e-mail/WhatsApp sugeridos e o pedido de dados bancários em aberto. */
export type ContatoDono = {
  dono: DonoConta
  email: string | null
  telefone: string | null
  pedido: { id: string; criadoEm: string; abertoEm: string | null; enviadoPara: string | null } | null
}

/** Contatos e pedido pendente de cada dono, pela chave "tipo:id" — para o botão "Pedir dados bancários". */
export async function contatosDosDonos(alvos: { tipo: TipoDono; id: string }[]): Promise<Map<string, ContatoDono>> {
  const saida = new Map<string, ContatoDono>()
  if (alvos.length === 0) return saida
  const admin = await createAdminClient()
  const vazio = Promise.resolve({ data: [] as Record<string, unknown>[] })
  const deTipo = (tipo: TipoDono) => [...new Set(alvos.flatMap((a) => (a.tipo === tipo ? [a.id] : [])))]
  const [fornecedores, usuarios, filiados] = [deTipo("fornecedor"), deTipo("usuario"), deTipo("filiado")]
  const [{ data: empresas }, { data: contatos }, { data: pessoas }, { data: fichas }, { data: pedidos }] = await Promise.all([
    fornecedores.length ? admin.from("empresa").select("id, empresa, nome_fantasia, nome_razao, cnpj_cpf").in("id", fornecedores) : vazio,
    fornecedores.length ? admin.from("empresa_contatos").select("empresa_id, email, telefone, principal").in("empresa_id", fornecedores) : vazio,
    usuarios.length ? admin.from("usuarios").select("id, nome_completo, nome_guerra, cpf, email").in("id", usuarios) : vazio,
    filiados.length
      ? admin
          .from("filiacoes")
          .select("id, nome_completo, cpf, email_pessoal, email_corporativo, telefone_1, telefone_2, telefone_1_whatsapp, telefone_2_whatsapp")
          .in("id", filiados)
      : vazio,
    admin
      .from("financeiro_pedidos_dados_bancarios")
      .select("id, fornecedor_id, usuario_id, filiado_id, enviado_para, created_at, aberto_em")
      .is("respondido_em", null)
      .is("cancelado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ])

  const doc = (v: unknown) => limparCpf(texto(v) ?? "") || null
  const contato = new Map<string, { email: string | null; telefone: string | null }>()
  const donos = new Map<string, DonoConta>()
  for (const e of (empresas ?? []) as Record<string, unknown>[]) {
    const k = `fornecedor:${e.id}`
    donos.set(k, { tipo: "fornecedor", id: String(e.id), nome: texto(e.nome_fantasia) ?? texto(e.empresa) ?? texto(e.nome_razao) ?? "Fornecedor", documento: doc(e.cnpj_cpf) })
    const cs = ((contatos ?? []) as Record<string, unknown>[])
      .filter((c) => c.empresa_id === e.id)
      .sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)))
    contato.set(k, { email: texto(cs.find((c) => texto(c.email))?.email), telefone: texto(cs.find((c) => texto(c.telefone))?.telefone) })
  }
  for (const u of (pessoas ?? []) as Record<string, unknown>[]) {
    const k = `usuario:${u.id}`
    donos.set(k, { tipo: "usuario", id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "Usuário", documento: doc(u.cpf) })
    contato.set(k, { email: texto(u.email), telefone: null })
  }
  for (const f of (fichas ?? []) as Record<string, unknown>[]) {
    const k = `filiado:${f.id}`
    donos.set(k, { tipo: "filiado", id: String(f.id), nome: texto(f.nome_completo) ?? "Filiado", documento: doc(f.cpf) })
    contato.set(k, {
      email: texto(f.email_pessoal) ?? texto(f.email_corporativo),
      telefone: f.telefone_2_whatsapp === true && f.telefone_1_whatsapp !== true ? texto(f.telefone_2) : texto(f.telefone_1),
    })
  }
  const pedidoDo = new Map<string, ContatoDono["pedido"]>()
  for (const p of (pedidos ?? []) as Record<string, unknown>[]) {
    const k = p.fornecedor_id ? `fornecedor:${p.fornecedor_id}` : p.usuario_id ? `usuario:${p.usuario_id}` : `filiado:${p.filiado_id}`
    if (!pedidoDo.has(k)) pedidoDo.set(k, { id: String(p.id), criadoEm: String(p.created_at), abertoEm: texto(p.aberto_em), enviadoPara: texto(p.enviado_para) })
  }
  for (const [k, dono] of donos) {
    saida.set(k, { dono, email: contato.get(k)?.email ?? null, telefone: contato.get(k)?.telefone ?? null, pedido: pedidoDo.get(k) ?? null })
  }
  return saida
}

import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { donosDaPessoa } from "@/lib/db/dados-bancarios-pessoa"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * TRAVA DO DESTINO BANCÁRIO (26/10/2026): ordem por Pix ou TED só existe com a
 * conta do favorecido registrada — senão o Financeiro não tem para onde pagar
 * e a remessa a recusa ("favorecido sem chave Pix nem conta bancária").
 * Vale para toda origem (a criação passa por inserirOrdensVerificadas) e para
 * a correção da ordem. Não é regra configurável da auditoria: não há o que
 * aceitar.
 *
 * Registrada é: o dado bancário escolhido na ordem (dados_bancarios_id), a
 * chave Pix gravada na própria ordem (folha, reembolso, hotel) ou, na falta
 * deles, um dado bancário do favorecido no cadastro (cadastroDosFavorecidos).
 * Pix (QR Code), boleto, cartão e dinheiro não entram aqui.
 */

type LinhaDestino = Record<string, unknown>

export type DestinoBancario = "pix" | "ted"

/** "Pix" ou "TED" (com as grafias antigas); o resto (QR Code, boleto…) é null. */
export function destinoDaForma(forma: unknown): DestinoBancario | null {
  const f = String(forma ?? "").trim().toLowerCase()
  if (!f || f.includes("qr")) return null
  if (f === "pix") return "pix"
  if (f.includes("ted") || f.includes("doc") || f.includes("depósito") || f.includes("deposito") || f.includes("transfer")) {
    return "ted"
  }
  return null
}

function t(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

type Dado = { pix: string | null; conta: string | null; agencia: string | null; banco: string | null; banco_codigo: string | null }

/** Um dado bancário conhecido do favorecido. `id` nulo = só na ficha do diretor. */
type DadoCadastro = Dado & {
  id: string | null
  pix_tipo: string | null
  tipo_conta: string | null
  favorecido: string | null
  prefere_pix: boolean
  favorito: boolean
}

const COLUNAS = "id, pix, pix_tipo, conta, agencia, banco, banco_codigo, tipo_conta, favorecido, prefere_pix, favorito, fornecedor_id, usuario_id, filiado_id"

function serve(d: Dado, destino: DestinoBancario): boolean {
  if (destino === "pix") return Boolean(t(d.pix))
  return Boolean(t(d.conta) && t(d.agencia) && (t(d.banco) || t(d.banco_codigo)))
}

function rotulo(destino: DestinoBancario): string {
  return destino === "pix" ? "a chave Pix" : "a conta bancária (banco, agência e conta)"
}

function comoCadastro(d: Record<string, unknown>): DadoCadastro {
  return {
    id: t(d.id),
    pix: t(d.pix),
    pix_tipo: t(d.pix_tipo),
    conta: t(d.conta),
    agencia: t(d.agencia),
    banco: t(d.banco),
    banco_codigo: t(d.banco_codigo),
    tipo_conta: t(d.tipo_conta),
    favorecido: t(d.favorecido),
    prefere_pix: d.prefere_pix === true,
    favorito: d.favorito === true,
  }
}

const chaveDe = (l: LinhaDestino): string | null => {
  const fornecedor = t(l.beneficiario_fornecedor_id) ?? t(l.fornecedor_id)
  if (fornecedor) return `f:${fornecedor}`
  const usuario = t(l.beneficiario_usuario_id)
  return usuario ? `u:${usuario}` : null
}

/**
 * Os dados bancários conhecidos de cada favorecido (chave "f:<fornecedor>" ou
 * "u:<usuário>"), o favorito primeiro. Pessoa tem o dado em três lugares: o
 * dado bancário do usuário, o da FILIAÇÃO dela (mesmo CPF — é onde a ficha do
 * diretor e o filiado guardam) e a ficha antiga do diretor. Consultas
 * agrupadas: um lote de folha não vira uma consulta por funcionário.
 */
async function cadastroDosFavorecidos(linhas: LinhaDestino[]): Promise<Map<string, DadoCadastro[]>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const fornecedores = [...new Set(linhas.map((l) => t(l.beneficiario_fornecedor_id) ?? t(l.fornecedor_id)).filter((v): v is string => Boolean(v)))]
  const usuarios = [
    ...new Set(
      linhas
        .filter((l) => !(t(l.beneficiario_fornecedor_id) ?? t(l.fornecedor_id)))
        .map((l) => t(l.beneficiario_usuario_id))
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const saida = new Map<string, DadoCadastro[]>()
  const juntar = (chave: string, d: DadoCadastro) => saida.set(chave, [...(saida.get(chave) ?? []), d])

  const [porFornecedor, porUsuario, pessoas, integrantes] = await Promise.all([
    fornecedores.length
      ? admin.from("dados_bancarios").select(COLUNAS).in("fornecedor_id", fornecedores)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    usuarios.length
      ? admin.from("dados_bancarios").select(COLUNAS).in("usuario_id", usuarios)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    usuarios.length
      ? admin.from("usuarios").select("id, cpf").in("id", usuarios)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    usuarios.length
      ? admin.from("diretoria_integrantes").select("id, usuario_id, cpf").eq("emp_proprietaria_id", emp).in("usuario_id", usuarios)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  for (const d of (porFornecedor.data ?? []) as Record<string, unknown>[]) juntar(`f:${d.fornecedor_id}`, comoCadastro(d))
  for (const d of (porUsuario.data ?? []) as Record<string, unknown>[]) juntar(`u:${d.usuario_id}`, comoCadastro(d))

  // A filiação da pessoa, pelo CPF.
  const cpfDe = new Map<string, string>()
  for (const p of (pessoas.data ?? []) as Record<string, unknown>[]) {
    const cpf = cpfConfiavel(t(p.cpf))
    if (cpf) cpfDe.set(String(p.id), cpf)
  }
  const grafias = [...new Set([...cpfDe.values()].flatMap((c) => grafiasDoCpf(c)))]
  if (grafias.length) {
    const { data: filiacoes } = await admin
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", grafias)
    const usuarioDaFiliacao = new Map<string, string[]>()
    for (const f of (filiacoes ?? []) as Record<string, unknown>[]) {
      const cpf = cpfConfiavel(t(f.cpf))
      const donos = [...cpfDe].filter(([, c]) => c === cpf).map(([u]) => u)
      if (donos.length) usuarioDaFiliacao.set(String(f.id), donos)
    }
    if (usuarioDaFiliacao.size) {
      const { data } = await admin.from("dados_bancarios").select(COLUNAS).in("filiado_id", [...usuarioDaFiliacao.keys()])
      for (const d of (data ?? []) as Record<string, unknown>[]) {
        for (const u of usuarioDaFiliacao.get(String(d.filiado_id)) ?? []) juntar(`u:${u}`, comoCadastro(d))
      }
    }
  }

  // Uma conta por pessoa (27/10): o usuário vê a conta do cadastro de
  // fornecedor PF com o mesmo CPF, e o fornecedor PF vê a do usuário e a da
  // filiação dele.
  const { data: empresasDosFornecedores } = fornecedores.length
    ? await admin.from("empresa").select("id, cnpj_cpf").in("id", fornecedores)
    : { data: [] as Record<string, unknown>[] }
  const cpfDoFornecedor = new Map<string, string>()
  for (const e of (empresasDosFornecedores ?? []) as Record<string, unknown>[]) {
    const cpf = cpfConfiavel(t(e.cnpj_cpf))
    if (cpf) cpfDoFornecedor.set(String(e.id), cpf)
  }
  const grafiasPessoas = [...new Set([...cpfDe.values(), ...cpfDoFornecedor.values()].flatMap((c) => grafiasDoCpf(c)))]
  if (grafiasPessoas.length) {
    const [{ data: fPf }, { data: uPf }, { data: filPf }] = await Promise.all([
      cpfDe.size ? admin.from("empresa").select("id, cnpj_cpf").eq("emp_proprietaria_id", emp).in("cnpj_cpf", grafiasPessoas) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      cpfDoFornecedor.size ? admin.from("usuarios").select("id, cpf").eq("emp_proprietaria_id", emp).in("cpf", grafiasPessoas) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      cpfDoFornecedor.size ? admin.from("filiacoes").select("id, cpf").eq("emp_proprietaria_id", emp).in("cpf", grafiasPessoas) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    // dono da conta → chaves de favorecido que a enxergam
    const destinos = new Map<string, string[]>()
    const ligar = (dono: string, chave: string) => destinos.set(dono, [...new Set([...(destinos.get(dono) ?? []), chave])])
    for (const e of (fPf ?? []) as Record<string, unknown>[]) {
      const cpf = cpfConfiavel(t(e.cnpj_cpf))
      for (const [u, c] of cpfDe) if (c === cpf) ligar(`f:${e.id}`, `u:${u}`)
    }
    const pessoasPf: { k: string; id: unknown; cpf: unknown }[] = [
      ...((uPf ?? []) as Record<string, unknown>[]).map((x) => ({ k: "u", id: x.id, cpf: x.cpf })),
      ...((filPf ?? []) as Record<string, unknown>[]).map((x) => ({ k: "p", id: x.id, cpf: x.cpf })),
    ]
    for (const p of pessoasPf) {
      const cpf = cpfConfiavel(t(p.cpf))
      for (const [f, c] of cpfDoFornecedor) if (c === cpf) ligar(`${p.k}:${p.id}`, `f:${f}`)
    }
    const ids = (k: string) => [...destinos.keys()].filter((d) => d.startsWith(`${k}:`)).map((d) => d.slice(2))
    const [{ data: dF }, { data: dU }, { data: dP }] = await Promise.all([
      ids("f").length ? admin.from("dados_bancarios").select(COLUNAS).in("fornecedor_id", ids("f")) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ids("u").length ? admin.from("dados_bancarios").select(COLUNAS).in("usuario_id", ids("u")) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ids("p").length ? admin.from("dados_bancarios").select(COLUNAS).in("filiado_id", ids("p")) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    for (const [k, lista] of [["f", dF], ["u", dU], ["p", dP]] as const) {
      const col = k === "f" ? "fornecedor_id" : k === "u" ? "usuario_id" : "filiado_id"
      for (const d of (lista ?? []) as Record<string, unknown>[]) {
        for (const chave of destinos.get(`${k}:${d[col]}`) ?? []) {
          if (!(saida.get(chave) ?? []).some((x) => x.id === String(d.id))) juntar(chave, comoCadastro(d))
        }
      }
    }
  }

  // A ficha antiga do diretor (só quando a pessoa não tem outro dado).
  const integrantePorUsuario = new Map(
    ((integrantes.data ?? []) as Record<string, unknown>[]).map((i) => [String(i.id), String(i.usuario_id)])
  )
  if (integrantePorUsuario.size) {
    const { data: fichas } = await admin
      .from("diretoria_ficha")
      .select("integrante_id, banco, agencia, conta_corrente, pix, tipo_chave_pix")
      .eq("emp_proprietaria_id", emp)
      .in("integrante_id", [...integrantePorUsuario.keys()])
    for (const f of (fichas ?? []) as Record<string, unknown>[]) {
      const u = integrantePorUsuario.get(String(f.integrante_id))
      if (!u || saida.has(`u:${u}`)) continue
      juntar(`u:${u}`, {
        id: null,
        pix: t(f.pix),
        pix_tipo: t(f.tipo_chave_pix),
        conta: t(f.conta_corrente),
        agencia: t(f.agencia),
        banco: t(f.banco),
        banco_codigo: null,
        tipo_conta: null,
        favorecido: null,
        prefere_pix: false,
        favorito: false,
      })
    }
  }
  for (const lista of saida.values()) lista.sort((a, b) => Number(b.favorito) - Number(a.favorito))
  return saida
}

/**
 * Por que estas ordens não podem existir como estão (null = podem): a primeira
 * ordem Pix/TED sem o destino registrado.
 */
export async function faltaDestinoBancario(linhas: LinhaDestino[]): Promise<string | null> {
  const alvo = linhas
    .map((l) => ({ l, destino: destinoDaForma(l.forma_pagamento) }))
    .filter((x): x is { l: LinhaDestino; destino: DestinoBancario } => x.destino !== null)
  if (alvo.length === 0) return null

  const admin = await createAdminClient()
  const escolhidos = [...new Set(alvo.map((x) => t(x.l.dados_bancarios_id)).filter((v): v is string => Boolean(v)))]
  const [{ data: porId }, cadastro] = await Promise.all([
    escolhidos.length
      ? admin.from("dados_bancarios").select(COLUNAS).in("id", escolhidos)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    cadastroDosFavorecidos(alvo.map((x) => x.l)),
  ])
  const dadoPorId = new Map(((porId ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), comoCadastro(d)]))

  for (const { l, destino } of alvo) {
    const escolhido = t(l.dados_bancarios_id)
    if (escolhido) {
      const d = dadoPorId.get(escolhido)
      if (d && serve(d, destino)) continue
      return `Pagamento por ${destino === "pix" ? "Pix" : "TED"}: o dado bancário escolhido não tem ${rotulo(destino)}. Escolha outro ou mude a forma de pagamento.`
    }
    if (destino === "pix" && t(l.pix_codigo)) continue
    const chave = chaveDe(l)
    if (chave && (cadastro.get(chave) ?? []).some((d) => serve(d, destino))) continue
    const avulso = t(l.beneficiario_nome_avulso)
    const deQuem = avulso ? `de ${avulso}` : chave ? "do favorecido" : null
    return deQuem
      ? `Pagamento por ${destino === "pix" ? "Pix" : "TED"} sem ${rotulo(destino)} ${deQuem} registrada. Cadastre os dados bancários do favorecido ou escolha outra forma (boleto, Pix por QR Code…).`
      : `Pagamento por ${destino === "pix" ? "Pix" : "TED"} sem favorecido nem ${rotulo(destino)} registrada.`
  }
  return null
}

/**
 * FORMA OBRIGATÓRIA (26/10/2026): toda ordem nasce com forma de pagamento.
 * A origem que não pergunta (diária, reembolso, locação, jurídico…) recebe a
 * do cadastro do favorecido: a chave Pix quando ele prefere Pix (ou só tem
 * chave), senão a conta (TED) — o favorito primeiro — e a ordem fica ligada
 * ao dado bancário (o da ficha antiga do diretor é cadastrado no usuário).
 * Sem forma e sem dado bancário, devolve o motivo e a ordem não é gravada.
 * Altera as linhas no lugar.
 */
export async function completarFormaPadrao(linhas: LinhaDestino[]): Promise<string | null> {
  const sem = linhas.filter((l) => !t(l.forma_pagamento))
  if (sem.length === 0) return null
  const cadastro = await cadastroDosFavorecidos(sem)
  for (const l of sem) {
    const chave = chaveDe(l)
    const meus = chave ? (cadastro.get(chave) ?? []) : []
    const comPix = meus.filter((d) => serve(d, "pix"))
    const comConta = meus.filter((d) => serve(d, "ted"))
    const pixPreferido = comPix.find((d) => d.prefere_pix)
    const escolha = pixPreferido
      ? { forma: "Pix", dado: pixPreferido }
      : comConta[0]
        ? { forma: "Depósito bancário (TED)", dado: comConta[0] }
        : comPix[0]
          ? { forma: "Pix", dado: comPix[0] }
          : null
    if (!escolha) {
      const quem = t(l.beneficiario_nome_avulso) ?? (chave ? "o favorecido" : null)
      return quem
        ? `A ordem precisa de forma de pagamento e ${quem} não tem chave Pix nem conta bancária cadastrada. Cadastre os dados bancários do favorecido — ou peça a ele pelo botão "Pedir dados bancários" na ficha — ou informe a forma na origem.`
        : "A ordem precisa de forma de pagamento e de um favorecido — informe a forma na origem."
    }
    l.forma_pagamento = escolha.forma
    if (!t(l.dados_bancarios_id)) {
      const id = escolha.dado.id ?? (await cadastrarDaFicha(String(l.beneficiario_usuario_id), escolha.dado, escolha.forma === "Pix"))
      if (id) l.dados_bancarios_id = id
      else if (escolha.forma === "Pix") l.pix_codigo = escolha.dado.pix
    }
  }
  return null
}

/**
 * O dado bancário do cadastro do favorecido (de qualquer papel dele) que a
 * ordem deve usar na forma dada: o já escolhido, se serve; senão o favorito
 * que serve (Pix: o que prefere Pix primeiro). null = forma sem destino
 * bancário ou nenhum serve. Usado na correção, para a remessa achar a conta.
 */
export async function dadoDoCadastroPara(linha: LinhaDestino, forma: unknown): Promise<string | null> {
  const destino = destinoDaForma(forma)
  if (!destino) return null
  const chave = chaveDe(linha)
  const meus = chave ? ((await cadastroDosFavorecidos([linha])).get(chave) ?? []) : []
  const escolhido = t(linha.dados_bancarios_id)
  if (escolhido && meus.some((d) => d.id === escolhido && serve(d, destino))) return escolhido
  const servem = meus.filter((d) => d.id && serve(d, destino))
  const melhor = (destino === "pix" ? servem.find((d) => d.prefere_pix) : null) ?? servem[0]
  return melhor?.id ?? null
}

/** Situações em que a ordem ainda não foi paga nem entrou em remessa. */
const SITUACOES_ABERTAS = ["Em autorização", "A pagar", "Aguardando informações", "Aguardando documento fiscal"]

/**
 * A CONTA CHEGOU (27/10/2026): ao salvar a chave Pix ou a conta de alguém,
 * as ordens abertas dele que ainda estão SEM FORMA (as anteriores à forma
 * obrigatória) recebem a forma — Pix quando ele prefere Pix ou só tem chave,
 * senão TED — e ficam ligadas ao dado bancário, com "corrigida" na trilha
 * (a auditoria reavalia). O dono da ordem é o fornecedor, o usuário
 * beneficiário ou o filiado do pedido de reembolso; pessoa é cruzada pelo CPF
 * (usuário ↔ filiação). Devolve quantas ordens foram ligadas; falha aqui não
 * desfaz o cadastro da conta (quem chama ignora o erro).
 */
export async function ligarOrdensSemForma(dadoId: string): Promise<number> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: d } = await admin.from("dados_bancarios").select(COLUNAS).eq("id", dadoId).maybeSingle()
  if (!d) return 0
  const dado = comoCadastro(d)
  const temPix = serve(dado, "pix")
  const temConta = serve(dado, "ted")
  const forma = temPix && (dado.prefere_pix || !temConta) ? "Pix" : temConta ? "Depósito bancário (TED)" : null
  if (!forma) return 0

  // A mesma pessoa em todos os papéis (usuário, filiado, fornecedor PF), pelo CPF.
  const tipo = t(d.fornecedor_id) ? "fornecedor" : t(d.usuario_id) ? "usuario" : "filiado"
  const donoId = String(d.fornecedor_id ?? d.usuario_id ?? d.filiado_id)
  const pessoa = await donosDaPessoa(tipo, donoId)
  const fornecedores = pessoa.fornecedor_id
  const usuarios = new Set(pessoa.usuario_id)
  const filiacoes = new Set(pessoa.filiado_id)

  const abertasSemForma = () =>
    admin
      .from("ordens_pagamento")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .is("forma_pagamento", null)
      .is("dados_bancarios_id", null)
      .in("situacao", SITUACOES_ABERTAS)
  const vazio = Promise.resolve({ data: [] as Record<string, unknown>[] })
  const [porFornecedor, porUsuario, reembolsos] = await Promise.all([
    fornecedores.length
      ? abertasSemForma().or(`fornecedor_id.in.(${fornecedores.join(",")}),beneficiario_fornecedor_id.in.(${fornecedores.join(",")})`)
      : vazio,
    usuarios.size
      ? abertasSemForma().is("fornecedor_id", null).is("beneficiario_fornecedor_id", null).in("beneficiario_usuario_id", [...usuarios])
      : vazio,
    filiacoes.size
      ? admin.from("filiacao_reembolsos").select("ordem_pagamento_id").in("filiado_id", [...filiacoes]).not("ordem_pagamento_id", "is", null)
      : vazio,
  ])
  const ids = new Set<string>()
  for (const o of [...((porFornecedor.data ?? []) as Record<string, unknown>[]), ...((porUsuario.data ?? []) as Record<string, unknown>[])]) {
    ids.add(String(o.id))
  }
  const doReembolso = ((reembolsos.data ?? []) as Record<string, unknown>[]).map((r) => String(r.ordem_pagamento_id))
  if (doReembolso.length) {
    const { data } = await abertasSemForma().in("id", doReembolso)
    for (const o of (data ?? []) as Record<string, unknown>[]) ids.add(String(o.id))
  }
  if (ids.size === 0) return 0

  const { data: ligadas, error } = await admin
    .from("ordens_pagamento")
    .update({ forma_pagamento: forma, dados_bancarios_id: dadoId })
    .in("id", [...ids])
    .is("forma_pagamento", null)
    .is("dados_bancarios_id", null)
    .select("id")
  if (error) {
    console.error("ligarOrdensSemForma:", error.message)
    return 0
  }
  const feitas = ((ligadas ?? []) as Record<string, unknown>[]).map((o) => String(o.id))
  if (feitas.length) {
    const { registrarEvento, usuarioDaTrilha } = await import("@/lib/db/ordens-ciclo")
    await registrarEvento(feitas, "corrigida", await usuarioDaTrilha(), `Dados bancários do favorecido cadastrados: forma ${forma} e ${forma === "Pix" ? "chave Pix" : "conta"} ligadas à ordem.`, {
      forma_pagamento: forma,
      dados_bancarios_id: dadoId,
    })
  }
  return feitas.length
}

/** O dado da ficha antiga do diretor vira dado bancário do usuário (o RLS exige dono). */
async function cadastrarDaFicha(usuarioId: string, d: DadoCadastro, pix: boolean): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("dados_bancarios")
    .insert({
      usuario_id: usuarioId,
      ...(pix
        ? { pix: d.pix, pix_tipo: d.pix_tipo, prefere_pix: true }
        : { banco: d.banco, agencia: d.agencia, conta: d.conta }),
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("cadastrarDaFicha:", error?.message)
    return null
  }
  return String(data.id)
}

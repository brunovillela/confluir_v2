import "server-only"

import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { MARCA_NAO_RECONHECE, MARCA_NOME_DIVERGENTE, nomesConferem } from "@/lib/db/votacao-primeiro-acesso"
import { createAdminClient } from "@/lib/supabase/admin"
import { rotuloFonte } from "@/lib/votacao-divergencias-fontes"
import { tenantAtual } from "@/lib/tenant"

/**
 * DIVERGÊNCIAS DAS VOTAÇÕES (26/11/2026): a fila do setor de filiação para o
 * voto liberado com divergência de cadastro — o aviso "Possível divergência de
 * cadastro" do sino abre aqui. Entram os aptos com `conflito_motivo` e SEM
 * `cpf_conflito` (o voto não foi barrado): nome da lista × ficha, ficha
 * inativa que não confere, nascimento suspeito na ficha e o "meu nome está
 * errado na lista". O barrado (cpf_conflito) segue na rodada, e o "este
 * e-mail não é meu" não é cadastro de filiado.
 *
 * Tratar = atualizar a ficha com o que o eleitor declarou (nome e/ou
 * nascimento) dizendo a FONTE que sustenta a mudança — sem documento, que a
 * entidade não pede —, com o antes, o depois e a fonte no prontuário; ou só
 * registrar o que foi feito. O
 * `conflito_motivo` não muda: é o registro do que aconteceu na votação. Nova
 * divergência no mesmo apto depois do tratamento reabre o caso.
 */

export type FichaDoCpf = {
  id: string
  nome: string | null
  nascimento: string | null
  condicao: string | null
}

export type Divergencia = {
  aptoId: string
  cpf: string | null
  nomeLista: string | null
  nomeInformado: string | null
  nascimentoInformado: string | null
  email: string | null
  motivo: string
  conflitoEm: string | null
  votou: boolean
  votacao: string | null
  rodadaId: string | null
  rodada: string | null
  fichas: FichaDoCpf[]
  tratadaEm: string | null
  tratadaPor: string | null
  tratamento: string | null
  /** Aberta: sem tratamento, ou divergência nova depois dele. */
  aberta: boolean
}

const COLUNAS =
  "id, cpf, nome_completo, nome_informado, nascimento_informado, email_corporativo, email_contato, conflito_motivo, conflito_em, hora_voto, presenca_em, assembleia_id, rod_assembleia_id, divergencia_tratada_em, divergencia_tratada_por, divergencia_tratamento"

type Linha = {
  id: string
  cpf: string | null
  nome_completo: string | null
  nome_informado: string | null
  nascimento_informado: string | null
  email_corporativo: string | null
  email_contato: string | null
  conflito_motivo: string | null
  conflito_em: string | null
  hora_voto: string | null
  presenca_em: string | null
  assembleia_id: string | null
  rod_assembleia_id: string | null
  divergencia_tratada_em: string | null
  divergencia_tratada_por: string | null
  divergencia_tratamento: string | null
}

/** O motivo é divergência de cadastro (e não outro tipo de marca)? */
export function ehDivergenciaDeCadastro(motivo: string | null, cpfConflito: string | null): boolean {
  if (!motivo || cpfConflito) return false
  if (motivo === MARCA_NAO_RECONHECE || motivo.startsWith("Link único")) return false
  return true
}

function estaAberta(l: Pick<Linha, "divergencia_tratada_em" | "conflito_em">): boolean {
  if (!l.divergencia_tratada_em) return true
  return Boolean(l.conflito_em && l.conflito_em > l.divergencia_tratada_em)
}

async function linhasDivergentes(): Promise<Linha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias_aptos")
    .select(COLUNAS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("conflito_motivo", "is", null)
    .is("cpf_conflito", null)
    .order("conflito_em", { ascending: false })
    .limit(1000)
  if (error) throw new Error(`Falha ao ler as divergências: ${error.message}`)
  return ((data ?? []) as Linha[]).filter((l) => ehDivergenciaDeCadastro(l.conflito_motivo, null))
}

/** Quantas divergências esperam tratamento (cartão da saúde dos cadastros). */
export async function contarDivergenciasAbertas(): Promise<number> {
  try {
    return (await linhasDivergentes()).filter(estaAberta).length
  } catch {
    return 0
  }
}

export async function listarDivergencias(filtro: "abertas" | "tratadas"): Promise<Divergencia[]> {
  const todas = await linhasDivergentes()
  const linhas = todas.filter((l) => (filtro === "abertas" ? estaAberta(l) : !estaAberta(l)))
  if (linhas.length === 0) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const cpfs = [...new Set(linhas.map((l) => l.cpf).filter((c): c is string => Boolean(c)))]
  const assembleias = [...new Set(linhas.map((l) => l.assembleia_id).filter((c): c is string => Boolean(c)))]
  const rodadas = [...new Set(linhas.map((l) => l.rod_assembleia_id).filter((c): c is string => Boolean(c)))]
  const usuarios = [...new Set(linhas.map((l) => l.divergencia_tratada_por).filter((c): c is string => Boolean(c)))]
  const [fichasRes, assRes, rodRes, usRes] = await Promise.all([
    cpfs.length
      ? admin
          .from("filiacoes")
          .select("id, cpf, nome_completo, nascimento_data, filiacao_condicao")
          .eq("emp_proprietaria_id", emp)
          .in("cpf", cpfs)
          .not("filiacao_excluida", "is", true)
      : Promise.resolve({ data: [] }),
    assembleias.length
      ? admin.from("voto_assembleias").select("id, nome_assembleia").in("id", assembleias)
      : Promise.resolve({ data: [] }),
    rodadas.length
      ? admin.from("voto_rod_assembleias").select("id, nome_assembleia").in("id", rodadas)
      : Promise.resolve({ data: [] }),
    usuarios.length
      ? admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", usuarios)
      : Promise.resolve({ data: [] }),
  ])
  const fichasPorCpf = new Map<string, FichaDoCpf[]>()
  for (const f of (fichasRes.data ?? []) as Record<string, string | null>[]) {
    const lista = fichasPorCpf.get(String(f.cpf)) ?? []
    lista.push({ id: String(f.id), nome: f.nome_completo, nascimento: f.nascimento_data?.slice(0, 10) ?? null, condicao: f.filiacao_condicao })
    fichasPorCpf.set(String(f.cpf), lista)
  }
  const nomeDe = (rows: unknown) =>
    new Map(((rows ?? []) as Record<string, string | null>[]).map((r) => [String(r.id), r.nome_assembleia ?? null]))
  const nomeAss = nomeDe(assRes.data)
  const nomeRod = nomeDe(rodRes.data)
  const nomeUs = new Map(
    ((usRes.data ?? []) as Record<string, string | null>[]).map((u) => [String(u.id), u.nome_completo ?? u.nome_guerra ?? null])
  )
  return linhas.map((l) => ({
    aptoId: l.id,
    cpf: l.cpf,
    nomeLista: l.nome_completo,
    nomeInformado: l.nome_informado ?? nomeDoAviso(l.conflito_motivo),
    nascimentoInformado: l.nascimento_informado?.slice(0, 10) ?? null,
    email: l.email_contato ?? l.email_corporativo,
    motivo: String(l.conflito_motivo),
    conflitoEm: l.conflito_em,
    votou: Boolean(l.hora_voto || l.presenca_em),
    votacao: l.assembleia_id ? (nomeAss.get(l.assembleia_id) ?? null) : null,
    rodadaId: l.rod_assembleia_id,
    rodada: l.rod_assembleia_id ? (nomeRod.get(l.rod_assembleia_id) ?? null) : null,
    fichas: l.cpf ? (fichasPorCpf.get(l.cpf) ?? []) : [],
    tratadaEm: l.divergencia_tratada_em,
    tratadaPor: l.divergencia_tratada_por ? (nomeUs.get(l.divergencia_tratada_por) ?? null) : null,
    tratamento: l.divergencia_tratamento,
    aberta: estaAberta(l),
  }))
}

/** O nome que o eleitor escreveu no aviso "meu nome está errado na lista". */
function nomeDoAviso(motivo: string | null): string | null {
  if (!motivo?.startsWith(MARCA_NOME_DIVERGENTE)) return null
  return motivo.match(/Nome informado: "(.+)"\.?$/)?.[1] ?? null
}

/**
 * Trata a divergência: atualiza a ficha com o declarado (nome e/ou
 * nascimento) e registra no prontuário, ou só anota o que foi feito.
 */
export async function tratarDivergencia(d: {
  aptoId: string
  fichaId: string | null
  usarNome: boolean
  usarNascimento: boolean
  fonte: string | null
  observacao: string
  usuarioId: string
}): Promise<{ erro?: string }> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select(COLUNAS + ", cpf_conflito")
    .eq("id", d.aptoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const l = apto as (Linha & { cpf_conflito: string | null }) | null
  if (!l || !ehDivergenciaDeCadastro(l.conflito_motivo, l.cpf_conflito)) return { erro: "Divergência não encontrada." }
  if (!estaAberta(l)) return { erro: "Esta divergência já foi tratada." }
  const obs = d.observacao.trim().replace(/\s+/g, " ").slice(0, 500)
  const nomeNovo = (l.nome_informado ?? nomeDoAviso(l.conflito_motivo))?.trim() || null
  const nascNovo = l.nascimento_informado?.slice(0, 10) ?? null
  const mudancas: string[] = []

  if (d.usarNome || d.usarNascimento) {
    const rotulo = rotuloFonte(d.fonte)
    if (!rotulo) return { erro: "Diga de onde veio o dado (a fonte) para mudar a ficha." }
    if (d.fonte === "lista_empresa") {
      if (d.usarNascimento) return { erro: "A lista da empresa não traz nascimento: escolha outra fonte para o nascimento." }
      if (!nomeNovo || !l.nome_completo || !nomesConferem(nomeNovo, l.nome_completo)) {
        return { erro: "O nome declarado não confere com o da lista da empresa: escolha outra fonte." }
      }
    }
    if (!d.fichaId) return { erro: "Escolha a ficha a atualizar." }
    if (!l.cpf) return { erro: "Sem CPF no apto, não há ficha para atualizar." }
    const { data: ficha } = await admin
      .from("filiacoes")
      .select("id, cpf, nome_completo, nascimento_data")
      .eq("id", d.fichaId)
      .eq("emp_proprietaria_id", emp)
      .not("filiacao_excluida", "is", true)
      .maybeSingle()
    if (!ficha || ficha.cpf !== l.cpf) return { erro: "A ficha escolhida não é deste CPF." }
    const campos: Record<string, string> = {}
    if (d.usarNome) {
      if (!nomeNovo) return { erro: "O eleitor não informou o nome." }
      if (nomeNovo !== ficha.nome_completo) {
        campos.nome_completo = nomeNovo
        mudancas.push(`nome de "${ficha.nome_completo ?? "—"}" para "${nomeNovo}"`)
      }
    }
    if (d.usarNascimento) {
      if (!nascNovo) return { erro: "O eleitor não informou o nascimento." }
      const antes = ficha.nascimento_data ? String(ficha.nascimento_data).slice(0, 10) : null
      if (nascNovo !== antes) {
        campos.nascimento_data = nascNovo
        mudancas.push(`nascimento de ${formatar(antes)} para ${formatar(nascNovo)}`)
      }
    }
    if (mudancas.length) {
      const { error } = await admin.from("filiacoes").update(campos).eq("id", ficha.id).eq("emp_proprietaria_id", emp)
      if (error) return { erro: `Falha ao atualizar a ficha: ${error.message}` }
      const agora = new Date().toISOString()
      const { error: erroPront } = await admin.from("filiacao_prontuario").insert({
        filiacao_id: ficha.id,
        data: agora,
        tipo: "Atualização cadastral",
        descricao: `Ficha acertada pela divergência apontada na votação: ${mudancas.join("; ")}. Fonte: ${rotulo}.${obs ? ` ${obs}` : ""}`,
        emp_proprietaria_id: emp,
        created_at: agora,
        modified_at: agora,
      })
      if (erroPront) console.error("[divergencias] prontuário não gravado:", erroPront.message)
      invalidarCacheCadastrosPendentes()
    }
  } else if (!obs) {
    return { erro: "Diga o que foi feito (ex.: a ficha já estava certa; a lista da empresa está errada)." }
  }

  const tratamento = [
    mudancas.length ? `Ficha atualizada: ${mudancas.join("; ")}. Fonte: ${rotuloFonte(d.fonte)}.` : null,
    obs || null,
  ]
    .filter(Boolean)
    .join(" ")
  const { error } = await admin
    .from("voto_assembleias_aptos")
    .update({
      divergencia_tratada_em: new Date().toISOString(),
      divergencia_tratada_por: d.usuarioId,
      divergencia_tratamento: tratamento || "Conferida, sem mudança na ficha.",
    })
    .eq("id", l.id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Falha ao registrar o tratamento: ${error.message}` }
  return {}
}

function formatar(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, dd] = iso.split("-")
  return `${dd}/${m}/${a}`
}

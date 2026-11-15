import "server-only"

import { texto } from "@/lib/db/comum"
import { CARTA_PADRAO, conferirModeloCarta, MAX_CARTA_MODELO, normalizarModeloCarta } from "@/lib/oposicao-carta"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O MODELO DA CARTA DE OPOSIÇÃO no banco (14/11/2026): o padrão da entidade
 * (oposicao_regras.carta_modelo), o da campanha (oposicao_campanha.carta_modelo)
 * e o que vale. A sintaxe e a montagem estão em lib/oposicao-carta.ts.
 */

export type OrigemCarta = "campanha" | "entidade" | "sistema"

export type ModeloSalvo = { modelo: string | null; porNome: string | null; em: string | null }

export type CartaDaEntidade = ModeloSalvo

export async function cartaDaEntidade(): Promise<CartaDaEntidade> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_regras")
    .select("carta_modelo, carta_modelo_por_nome, carta_modelo_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return {
    modelo: texto(data?.carta_modelo),
    porNome: texto(data?.carta_modelo_por_nome),
    em: texto(data?.carta_modelo_em),
  }
}

export type CartaDaCampanha = {
  campanha: ModeloSalvo
  entidade: CartaDaEntidade
  /** O texto que vale agora para quem registrar nesta campanha. */
  vigente: string
  origem: OrigemCarta
}

export async function cartaDaCampanha(campanhaId: string): Promise<CartaDaCampanha | null> {
  const admin = await createAdminClient()
  const [{ data }, entidade] = await Promise.all([
    admin
      .from("oposicao_campanha")
      .select("carta_modelo, carta_modelo_por_nome, carta_modelo_em")
      .eq("id", campanhaId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    cartaDaEntidade(),
  ])
  if (!data) return null
  const campanha: ModeloSalvo = {
    modelo: texto(data.carta_modelo),
    porNome: texto(data.carta_modelo_por_nome),
    em: texto(data.carta_modelo_em),
  }
  const origem: OrigemCarta = campanha.modelo ? "campanha" : entidade.modelo ? "entidade" : "sistema"
  return { campanha, entidade, vigente: campanha.modelo ?? entidade.modelo ?? CARTA_PADRAO, origem }
}

/**
 * O modelo que fica gravado na oposição ao registrar: o da campanha, senão o
 * da entidade, senão o padrão do sistema.
 */
export async function modeloDaCartaEmVigor(campanhaId: string): Promise<string> {
  return (await cartaDaCampanha(campanhaId))?.vigente ?? (await cartaDaEntidade()).modelo ?? CARTA_PADRAO
}

/**
 * Salva o modelo da entidade (campanhaId nulo) ou da campanha. Nulo volta ao
 * padrão (entidade → sistema; campanha → entidade). Texto igual ao padrão do
 * nível de cima também grava nulo, para seguir as mudanças de lá. Cada troca
 * vai para a trilha, com autor.
 */
export async function salvarModeloCarta(
  campanhaId: string | null,
  bruto: string | null,
  usuario: { id: string; nome: string | null }
): Promise<{ erro?: string; restaurado?: boolean }> {
  let modelo = bruto == null ? null : normalizarModeloCarta(bruto)
  if (modelo) {
    const erros = conferirModeloCarta(modelo)
    if (erros.length > 0) return { erro: erros.join(" ") }
    modelo = modelo.slice(0, MAX_CARTA_MODELO)
  }
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const entidade = await cartaDaEntidade()
  const acima = campanhaId ? (entidade.modelo ?? CARTA_PADRAO) : CARTA_PADRAO
  if (modelo && modelo === normalizarModeloCarta(acima)) modelo = null
  const antes = campanhaId ? (await cartaDaCampanha(campanhaId))?.campanha.modelo : entidade.modelo
  if (campanhaId && antes === undefined) return { erro: "Campanha não encontrada." }
  if ((antes ?? null) === modelo) return { restaurado: modelo === null }

  const campos = {
    carta_modelo: modelo,
    carta_modelo_por_nome: usuario.nome,
    carta_modelo_em: new Date().toISOString(),
  }
  const { error } = campanhaId
    ? await admin.from("oposicao_campanha").update(campos).eq("id", campanhaId).eq("emp_proprietaria_id", emp)
    : await admin.from("oposicao_regras").upsert({ emp_proprietaria_id: emp, ...campos }, { onConflict: "emp_proprietaria_id" })
  if (error) return { erro: `Falha ao salvar o texto da carta: ${error.message}` }

  const { error: erroTrilha } = await admin.from("oposicao_eventos").insert({
    opositor_id: null,
    campanha_id: campanhaId,
    evento: campanhaId ? "carta_campanha_editada" : "carta_entidade_editada",
    detalhe: modelo
      ? `Texto da carta ${campanhaId ? "da campanha" : "da entidade"} alterado (${modelo.length} caracteres).`
      : campanhaId
        ? "A carta da campanha voltou a seguir o texto da entidade."
        : "A carta da entidade voltou ao texto padrão do sistema.",
    usuario_id: usuario.id,
    emp_proprietaria_id: emp,
  })
  if (erroTrilha) console.error("[oposicao] trilha da carta não gravada:", erroTrilha.message)
  // O texto inteiro de cada versão, para ver e comparar (15/11/2026).
  const { error: erroVersao } = await admin.from("oposicao_carta_versoes").insert({
    emp_proprietaria_id: emp,
    campanha_id: campanhaId,
    modelo,
    por_id: usuario.id,
    por_nome: usuario.nome,
    criado_em: campos.carta_modelo_em,
  })
  if (erroVersao) console.error("[oposicao] versão da carta não gravada:", erroVersao.message)
  return { restaurado: modelo === null }
}

export type VersaoCarta = {
  id: string
  /** O texto salvo; null = voltou ao padrão do nível de cima. */
  modelo: string | null
  porNome: string | null
  em: string
}

/** As versões salvas do texto (entidade: campanhaId nulo), da mais nova à mais antiga. */
export async function versoesDaCarta(campanhaId: string | null): Promise<VersaoCarta[]> {
  const admin = await createAdminClient()
  let consulta = admin
    .from("oposicao_carta_versoes")
    .select("id, modelo, por_nome, criado_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("criado_em", { ascending: false })
    .limit(200)
  consulta = campanhaId ? consulta.eq("campanha_id", campanhaId) : consulta.is("campanha_id", null)
  const { data } = await consulta
  return (data ?? []).map((v) => ({
    id: String(v.id),
    modelo: texto(v.modelo),
    porNome: texto(v.por_nome),
    em: String(v.criado_em),
  }))
}

/**
 * Para o aviso ao editar (15/11/2026): quantas oposições já registradas na
 * campanha (desistência não conta) — elas mantêm o texto com que registraram.
 */
export async function oposicoesRegistradas(campanhaId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("oposicao_opositor")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .neq("situacao", "desistente")
  return count ?? 0
}

/** As campanhas não encerradas que seguem o texto da entidade (sem texto próprio). */
export async function campanhasQueSeguemAEntidade(): Promise<{ id: string; nome: string | null; situacao: string }[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_campanha")
    .select("id, nome, situacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("carta_modelo", null)
    .neq("situacao", "encerrada")
    .order("prazo_inicio", { ascending: false, nullsFirst: false })
  return (data ?? []).map((c) => ({ id: String(c.id), nome: texto(c.nome), situacao: String(c.situacao ?? "") }))
}

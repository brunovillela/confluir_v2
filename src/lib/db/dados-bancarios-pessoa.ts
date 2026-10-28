import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * UMA CONTA POR PESSOA, NÃO POR PAPEL (27/10/2026): a mesma pessoa pode ser
 * usuário (funcionário/diretor), filiado e fornecedor pessoa física — três
 * cadastros, e a conta dela acabava copiada em cada um. A conta continua
 * gravada onde foi cadastrada, mas todos os papéis com o mesmo CPF a enxergam
 * e a usam: na ficha, na ordem e na checagem de conta repetida. Editou num
 * lugar, vale em todos (é o mesmo registro). Fornecedor com CNPJ é só ele.
 */

export type TipoDono = "fornecedor" | "usuario" | "filiado"
export type DonosDaPessoa = { fornecedor_id: string[]; usuario_id: string[]; filiado_id: string[] }

export const ROTULO_ORIGEM: Record<TipoDono, string> = {
  fornecedor: "cadastro de fornecedor",
  usuario: "Pessoal (funcionário/diretor)",
  filiado: "ficha do filiado",
}

const COLUNA: Record<TipoDono, keyof DonosDaPessoa> = { fornecedor: "fornecedor_id", usuario: "usuario_id", filiado: "filiado_id" }

/** O CPF confiável do dono (null para fornecedor com CNPJ ou documento inválido). */
async function cpfDoDono(tipo: TipoDono, id: string): Promise<string | null> {
  const admin = await createAdminClient()
  if (tipo === "fornecedor") {
    const { data } = await admin.from("empresa").select("cnpj_cpf").eq("id", id).maybeSingle()
    return cpfConfiavel(texto(data?.cnpj_cpf))
  }
  const { data } = await admin.from(tipo === "usuario" ? "usuarios" : "filiacoes").select("cpf").eq("id", id).maybeSingle()
  return cpfConfiavel(texto(data?.cpf))
}

/** Todos os cadastros da pessoa com este CPF, no tenant atual. */
export async function donosPorCpf(cpf: string): Promise<DonosDaPessoa> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const grafias = grafiasDoCpf(cpf)
  const [u, f, e] = await Promise.all([
    admin.from("usuarios").select("id").eq("emp_proprietaria_id", emp).in("cpf", grafias),
    admin.from("filiacoes").select("id").eq("emp_proprietaria_id", emp).in("cpf", grafias),
    admin.from("empresa").select("id").eq("emp_proprietaria_id", emp).in("cnpj_cpf", grafias),
  ])
  const ids = (r: { data: unknown[] | null }) => ((r.data ?? []) as { id: string }[]).map((x) => String(x.id))
  return { usuario_id: ids(u), filiado_id: ids(f), fornecedor_id: ids(e) }
}

/** Os cadastros da mesma pessoa que o dono (ele incluído). */
export async function donosDaPessoa(tipo: TipoDono, id: string): Promise<DonosDaPessoa> {
  const proprio: DonosDaPessoa = { fornecedor_id: [], usuario_id: [], filiado_id: [] }
  proprio[COLUNA[tipo]] = [id]
  const cpf = await cpfDoDono(tipo, id)
  if (!cpf) return proprio
  const todos = await donosPorCpf(cpf)
  if (!todos[COLUNA[tipo]].includes(id)) todos[COLUNA[tipo]].push(id)
  return todos
}

/** Filtro PostgREST "fornecedor_id.in.(…),usuario_id.in.(…)…" dos donos. */
export function filtroDosDonos(d: DonosDaPessoa): string | null {
  const partes = (Object.keys(d) as (keyof DonosDaPessoa)[])
    .filter((c) => d[c].length)
    .map((c) => `${c}.in.(${d[c].join(",")})`)
  return partes.length ? partes.join(",") : null
}

export type ContaDeOutroCadastro = {
  id: string
  origem: TipoDono
  banco: string | null
  agencia: string | null
  conta: string | null
  pix: string | null
  pixTipo: string | null
  favorito: boolean
}

/**
 * As contas da pessoa que estão nos cadastros dela de OUTRO papel — a ficha
 * já mostra as do próprio papel; estas também valem ali.
 */
export async function contasDeOutrosCadastros(tipo: TipoDono, id: string): Promise<ContaDeOutroCadastro[]> {
  const donos = await donosDaPessoa(tipo, id)
  donos[COLUNA[tipo]] = []
  const filtro = filtroDosDonos(donos)
  if (!filtro) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("dados_bancarios")
    .select("id, banco, agencia, conta, pix, pix_tipo, favorito, fornecedor_id, usuario_id, filiado_id")
    .or(filtro)
    .order("favorito", { ascending: false, nullsFirst: false })
  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    origem: d.fornecedor_id ? "fornecedor" : d.usuario_id ? "usuario" : "filiado",
    banco: texto(d.banco),
    agencia: texto(d.agencia),
    conta: texto(d.conta),
    pix: texto(d.pix),
    pixTipo: texto(d.pix_tipo),
    favorito: d.favorito === true,
  }))
}

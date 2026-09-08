import "server-only"

import { ehDoBubble } from "@/lib/db/filiacao-documentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Convênios — os descontos e serviços que a entidade negocia para o filiado
 * (ótica, hospedagem, cursos, aluguel de veículos, consórcios, saúde), com
 * as unidades onde ele é atendido.
 *
 * Estrutura criada em `supabase/filiacao-lacunas-modelo.sql` (08/09) e
 * carregada do sistema antigo (21 convênios, 6 categorias, 19 unidades). O
 * portal lê só os ativos e sem término vencido; o painel vê tudo.
 */

const BUCKET = "filiacao"

export type UnidadeConvenio = {
  id: string
  nome: string | null
  site: string | null
  online: boolean
  presencial: boolean
  telefones: string[]
  emails: string[]
  endereco: string | null
}

export type Convenio = {
  id: string
  categoria: string | null
  conveniador: string | null
  ativo: boolean
  vigente: boolean
  dataTermino: string | null
  infoSumarias: string | null
  infoVantagens: string | null
  /** Link do contrato/regulamento, assinado se estiver no nosso bucket. */
  arquivoUrl: string | null
  fotoUrl: string | null
  unidades: UnidadeConvenio[]
}

async function urlDe(valor: string | null): Promise<string | null> {
  if (!valor) return null
  if (ehDoBubble(valor)) return valor.startsWith("//") ? `https:${valor}` : valor
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(valor, 3600)
  return data?.signedUrl ?? null
}

function enderecoEmLinha(a: Record<string, unknown> | null): string | null {
  if (!a) return null
  const l1 = [a.logradouro, a.numero, a.complemento].filter((x) => typeof x === "string" && x.trim()).join(", ")
  const l2 = [a.bairro, [a.cidade, a.estado].filter(Boolean).join("/")].filter((x) => typeof x === "string" && x.trim()).join(" · ")
  return [l1, l2].filter(Boolean).join(" — ") || null
}

export async function listarConvenios(opcoes: { somenteVigentes?: boolean } = {}): Promise<Convenio[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data, error } = await admin
    .from("filiacao_convenios")
    .select(
      "id, ativo, data_termino, info_sumarias, info_vantagens, arquivo_convenio, foto_principal, categoria:categoria_id(categoria), conveniador:empresa!fk_filiacao_convenios_conveniador(nome_fantasia, nome_razao), unidades:filiacao_convenios_unidades(id, nome, site, atendimento_online, atendimento_presencial, telefones, emails, endereco:endereco_id(logradouro, numero, complemento, bairro, cidade, estado))"
    )
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: true })
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return []
    throw new Error(`Falha ao ler convênios: ${error.message}`)
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

  const lista: Convenio[] = []
  for (const c of data ?? []) {
    const ativo = c.ativo === true
    const termino = (c.data_termino as string | null) ?? null
    const vigente = ativo && (!termino || termino >= hoje)
    if (opcoes.somenteVigentes && !vigente) continue
    const categoria = um(c.categoria as { categoria: string | null } | { categoria: string | null }[] | null)
    const conveniador = um(c.conveniador as Record<string, string | null> | Record<string, string | null>[] | null)
    const unidades = ((c.unidades as Record<string, unknown>[] | null) ?? []).map((u) => ({
      id: u.id as string,
      nome: (u.nome as string | null) ?? null,
      site: (u.site as string | null) ?? null,
      online: u.atendimento_online === true,
      presencial: u.atendimento_presencial === true,
      telefones: (u.telefones as string[] | null) ?? [],
      emails: (u.emails as string[] | null) ?? [],
      endereco: enderecoEmLinha(um(u.endereco as Record<string, unknown> | Record<string, unknown>[] | null)),
    }))
    lista.push({
      id: c.id as string,
      categoria: categoria?.categoria ?? null,
      conveniador: conveniador?.nome_fantasia ?? conveniador?.nome_razao ?? null,
      ativo,
      vigente,
      dataTermino: termino,
      infoSumarias: (c.info_sumarias as string | null) ?? null,
      infoVantagens: (c.info_vantagens as string | null) ?? null,
      arquivoUrl: await urlDe((c.arquivo_convenio as string | null) ?? null),
      fotoUrl: await urlDe((c.foto_principal as string | null) ?? null),
      unidades,
    })
  }

  // Por categoria, e dentro dela pelo nome do conveniador: é como o filiado
  // procura ("tem ótica?"), não pela ordem de cadastro.
  return lista.sort(
    (a, b) =>
      (a.categoria ?? "").localeCompare(b.categoria ?? "", "pt-BR") ||
      (a.conveniador ?? "").localeCompare(b.conveniador ?? "", "pt-BR")
  )
}

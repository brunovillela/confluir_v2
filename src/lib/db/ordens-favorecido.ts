import "server-only"

import { lerEmLotesPorIds, texto } from "@/lib/db/comum"
import {
  escolherFavorecido,
  nomeDaEmpresa,
  nomeDoUsuario,
  type CadastroFavorecido,
  type Favorecido,
  type OrdemFavorecido,
} from "@/lib/favorecido"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Carrega os cadastros e diz quem recebe cada ordem (regra em lib/favorecido.ts).
 * Consultas em fatias (lerEmLotesPorIds): a exportação passa milhares de ordens.
 * Devolve ordemId → Favorecido (ausente = a ordem não tem favorecido).
 */
export async function favorecidosDasOrdens(ordens: OrdemFavorecido[]): Promise<Map<string, Favorecido>> {
  const saida = new Map<string, Favorecido>()
  if (ordens.length === 0) return saida
  const admin = await createAdminClient()
  const ids = (vs: unknown[]) => [...new Set(vs.map((v) => texto(v)).filter((v): v is string => Boolean(v)))]
  const empresaIds = ids(ordens.flatMap((o) => [o.beneficiario_fornecedor_id, o.fornecedor_id]))
  const usuarioIds = ids(ordens.map((o) => o.beneficiario_usuario_id))
  // Filiado só onde não há fornecedor nem pessoa do quadro.
  const semCadastro = ordens.filter((o) => !texto(o.beneficiario_fornecedor_id) && !texto(o.fornecedor_id) && !texto(o.beneficiario_usuario_id))
  const [empresas, usuarios, filiados] = await Promise.all([
    lerEmLotesPorIds(empresaIds, (fatia, de, ate) =>
      admin.from("empresa").select("id, empresa, nome_fantasia, nome_razao, cnpj_cpf").in("id", fatia).order("id").range(de, ate)
    ),
    lerEmLotesPorIds(usuarioIds, (fatia, de, ate) =>
      admin.from("usuarios").select("id, nome_completo, nome_guerra, cpf").in("id", fatia).order("id").range(de, ate)
    ),
    filiadosDasOrdens(semCadastro.map((o) => ({ id: String(o.id), custeio_id: texto(o.custeio_id) }))),
  ])
  const fontes = {
    empresas: new Map<string, CadastroFavorecido>(empresas.map((e) => [String(e.id), { nome: nomeDaEmpresa(e), documento: texto(e.cnpj_cpf) }])),
    usuarios: new Map<string, CadastroFavorecido>(usuarios.map((u) => [String(u.id), { nome: nomeDoUsuario(u), documento: texto(u.cpf) }])),
    filiados,
  }
  for (const o of ordens) {
    const f = escolherFavorecido(o, fontes)
    if (f) saida.set(String(o.id), f)
  }
  return saida
}

/**
 * O filiado favorecido de cada ordem (a ordem não tem coluna para ele): pelo
 * pedido de reembolso ou pelo custeio. Devolve ordemId → { id, nome, documento }.
 */
export async function filiadosDasOrdens(
  ordens: { id: string; custeio_id?: string | null }[]
): Promise<Map<string, CadastroFavorecido & { id: string; nome: string }>> {
  const saida = new Map<string, CadastroFavorecido & { id: string; nome: string }>()
  if (ordens.length === 0) return saida
  const admin = await createAdminClient()
  const custeioIds = [...new Set(ordens.map((o) => o.custeio_id).filter((v): v is string => Boolean(v)))]
  const [reembolsos, custeios] = await Promise.all([
    lerEmLotesPorIds(ordens.map((o) => o.id), (fatia, de, ate) =>
      admin.from("filiacao_reembolsos").select("id, ordem_pagamento_id, filiado_id").in("ordem_pagamento_id", fatia).order("id").range(de, ate)
    ),
    lerEmLotesPorIds(custeioIds, (fatia, de, ate) =>
      admin.from("institucional_custeios").select("id, filiacao_id").in("id", fatia).not("filiacao_id", "is", null).order("id").range(de, ate)
    ),
  ])
  const filiadoDaOrdem = new Map<string, string>()
  // Reembolso legado sem filiado fica de fora (null não pode ir ao .in() de uuid).
  for (const r of reembolsos) if (texto(r.filiado_id)) filiadoDaOrdem.set(String(r.ordem_pagamento_id), String(r.filiado_id))
  const filiadoDoCusteio = new Map(custeios.map((c) => [String(c.id), String(c.filiacao_id)]))
  for (const o of ordens) {
    if (!filiadoDaOrdem.has(o.id) && o.custeio_id && filiadoDoCusteio.has(o.custeio_id)) filiadoDaOrdem.set(o.id, filiadoDoCusteio.get(o.custeio_id)!)
  }
  const filiados = [...new Set(filiadoDaOrdem.values())]
  if (filiados.length === 0) return saida
  const fichas = await lerEmLotesPorIds(filiados, (fatia, de, ate) =>
    admin.from("filiacoes").select("id, nome_completo, cpf").in("id", fatia).order("id").range(de, ate)
  )
  const porId = new Map(fichas.map((f) => [String(f.id), { nome: texto(f.nome_completo) ?? "Filiado", documento: texto(f.cpf) }]))
  for (const [ordem, filiado] of filiadoDaOrdem) {
    const f = porId.get(filiado)
    saida.set(ordem, { id: filiado, nome: f?.nome ?? "Filiado", documento: f?.documento ?? null })
  }
  return saida
}

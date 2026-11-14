import "server-only"

import { lerEmLotes, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * BUSCA DAS ORDENS PELO FAVORECIDO (14/11/2026). A busca da lista só olhava
 * descrição, código e o nome avulso gravado na ordem; quem recebe por cadastro
 * — funcionário e diretor (pessoa do quadro), filiado (reembolso, custeio) e
 * empresa — não era achado pelo nome nem pelo CPF/CNPJ. Aqui o termo vira os
 * ids desses cadastros, que a consulta da lista junta à busca por texto.
 *
 * Nome: todas as palavras precisam aparecer, sem acento e em qualquer ordem.
 * Documento: com 5 dígitos ou mais, casa pelo CPF/CNPJ.
 */

export type IdsDaBusca = {
  usuarios: string[]
  empresas: string[]
  /** Ordens de filiados (pelos reembolsos e custeios deles). */
  ordens: string[]
}

const VAZIO: IdsDaBusca = { usuarios: [], empresas: [], ordens: [] }
/** Teto por tipo de cadastro: o filtro vira um IN na URL da consulta. */
const TETO = 150

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "")
const escaparLike = (t: string) => t.replace(/[%_\\,()]/g, " ").trim()

export async function idsDaBusca(termo: string): Promise<IdsDaBusca> {
  const limpo = termo.trim()
  if (limpo.length < 3) return VAZIO
  const palavras = semAcento(limpo).toLowerCase().split(/\s+/).filter((p) => p.length >= 2)
  const doc = digitos(limpo)
  const porDocumento = doc.length >= 5 && doc.length === limpo.replace(/[\s.\-/]/g, "").length
  if (palavras.length === 0 && !porDocumento) return VAZIO

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const casaNome = (...nomes: unknown[]) => {
    const alvo = semAcento(nomes.map((n) => texto(n) ?? "").join(" ")).toLowerCase()
    return palavras.length > 0 && palavras.every((p) => alvo.includes(p))
  }

  const [usuarios, empresas, ordensFiliados] = await Promise.all([
    // Pessoas do quadro que já receberam ordem (são poucas: filtra em memória).
    (async () => {
      const usos = await lerEmLotes((de, ate) =>
        admin
          .from("ordens_pagamento")
          .select("beneficiario_usuario_id")
          .eq("emp_proprietaria_id", emp)
          .not("excluido", "is", true)
          .not("beneficiario_usuario_id", "is", null)
          .order("id")
          .range(de, ate)
      ).catch(() => [] as Record<string, unknown>[])
      const ids = [...new Set(usos.map((o) => texto(o.beneficiario_usuario_id)).filter((v): v is string => !!v))]
      const pessoas = await lerEmLotesPorIds(ids, (fatia, de, ate) =>
        admin.from("usuarios").select("id, nome_completo, nome_guerra, cpf").in("id", fatia).order("id").range(de, ate)
      ).catch(() => [] as Record<string, unknown>[])
      return pessoas
        .filter((u) => casaNome(u.nome_completo, u.nome_guerra) || (porDocumento && digitos(u.cpf).includes(doc)))
        .map((u) => String(u.id))
        .slice(0, TETO)
    })(),
    // Empresas: nome fantasia ou razão social com todas as palavras (ou o documento).
    (async () => {
      let q = admin.from("empresa").select("id").eq("emp_proprietaria_id", emp)
      if (porDocumento) q = q.ilike("cnpj_cpf", `%${escaparLike(limpo)}%`)
      else
        for (const p of limpo.split(/\s+/).map(escaparLike).filter((p) => p.length >= 2))
          q = q.or(`nome_fantasia.ilike.%${p}%,nome_razao.ilike.%${p}%`)
      const { data } = await q.limit(TETO)
      const ids = (data ?? []).map((e) => String(e.id))
      // CNPJ gravado só com dígitos ou formatado: tenta o outro jeito também.
      if (porDocumento && ids.length === 0) {
        const { data: outra } = await admin.from("empresa").select("id").eq("emp_proprietaria_id", emp).ilike("cnpj_cpf", `%${doc}%`).limit(TETO)
        return (outra ?? []).map((e) => String(e.id))
      }
      return ids
    })().catch(() => [] as string[]),
    // Filiados (nome sem acento ou CPF) → as ordens dos reembolsos e custeios deles.
    (async () => {
      let q = admin.from("filiacoes").select("id, cpf").eq("emp_proprietaria_id", emp)
      if (porDocumento) q = q.ilike("cpf", `%${escaparLike(limpo)}%`)
      else for (const p of palavras) q = q.ilike("nome_completo_norm", `%${escaparLike(p)}%`)
      const { data } = await q.limit(50)
      const filiados = (data ?? []).map((f) => String(f.id))
      if (filiados.length === 0) return [] as string[]
      const [{ data: reembolsos }, { data: custeios }] = await Promise.all([
        admin.from("filiacao_reembolsos").select("ordem_pagamento_id").in("filiado_id", filiados).not("ordem_pagamento_id", "is", null).limit(500),
        admin.from("institucional_custeios").select("id").in("filiacao_id", filiados).limit(200),
      ])
      const ordens = new Set((reembolsos ?? []).map((r) => String(r.ordem_pagamento_id)))
      const custeioIds = (custeios ?? []).map((c) => String(c.id))
      if (custeioIds.length) {
        const { data: os } = await admin.from("ordens_pagamento").select("id").in("custeio_id", custeioIds).limit(500)
        for (const o of os ?? []) ordens.add(String(o.id))
      }
      return [...ordens].slice(0, TETO * 2)
    })().catch(() => [] as string[]),
  ])
  return { usuarios, empresas, ordens: ordensFiliados }
}

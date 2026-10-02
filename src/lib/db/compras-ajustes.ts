import "server-only"

import { pixCodigoValido } from "@/lib/compras-constantes"
import { registrarEvento, SITUACOES_ENCERRADAS } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ajustes do pagamento de um processo de compra, depois de gerada a ordem:
 *  - NOVO CÓDIGO PIX: o copia e cola (QR Code) expira; troca-se o da ordem
 *    enquanto ela não foi paga.
 *  - NOTA FISCAL DA COMPRA (do fornecimento) e NOTA DO PAGAMENTO (da ordem,
 *    ex.: uma cobrança à parte): incluir ou trocar, mesmo com a ordem paga —
 *    a nota costuma chegar depois.
 * Tudo fica na trilha da ordem (evento "corrigida", com o que mudou).
 */

const FORMA_QR = "Pix (QR Code)"

type OrdemDoAjuste = {
  id: string
  situacao: string | null
  forma_pagamento: string | null
  arquivo_nota_fiscal: string | null
  processo_compra_id: string | null
}

/** A ordem existe, é do tenant e é deste processo de compra. */
async function ordemDoProcesso(ordemId: string, processoId: string): Promise<OrdemDoAjuste | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, forma_pagamento, arquivo_nota_fiscal, processo_compra_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .maybeSingle()
  if (!data || data.processo_compra_id !== processoId) return null
  return data as OrdemDoAjuste
}

/** Substitui o código Pix copia e cola de uma ordem ainda não paga. */
export async function trocarCodigoPix(
  processoId: string,
  ordemId: string,
  codigoBruto: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const codigo = codigoBruto.replace(/\s/g, "")
  if (!pixCodigoValido(codigo)) {
    return { erro: "Cole o código Pix copia e cola completo (começa com 000201)." }
  }
  const ordem = await ordemDoProcesso(ordemId, processoId)
  if (!ordem) return { erro: "Ordem não encontrada neste processo." }
  if (SITUACOES_ENCERRADAS.includes(String(ordem.situacao))) {
    return { erro: `A ordem está "${ordem.situacao}" — não há pagamento a fazer com um código novo.` }
  }
  if (ordem.forma_pagamento !== FORMA_QR) {
    return { erro: `A forma de pagamento desta ordem é "${ordem.forma_pagamento ?? "—"}", não Pix por código (QR Code).` }
  }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("ordens_pagamento")
    .update({ pix_codigo: codigo })
    .eq("id", ordemId)
    .not("situacao", "in", `(${SITUACOES_ENCERRADAS.map((s) => `"${s}"`).join(",")})`)
  if (error) return { erro: `Não foi possível salvar o código: ${error.message}` }
  await registrarEvento(ordemId, "corrigida", usuarioId, "Novo código Pix (o anterior expirou ou foi substituído).", {
    campo: "pix_codigo",
  })
  return {}
}

/** Inclui ou troca a nota fiscal da ORDEM (a do pagamento). */
export async function trocarNotaDaOrdem(
  processoId: string,
  ordemId: string,
  caminho: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const ordem = await ordemDoProcesso(ordemId, processoId)
  if (!ordem) return { erro: "Ordem não encontrada neste processo." }
  const admin = await createAdminClient()
  const { error } = await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: caminho }).eq("id", ordemId)
  if (error) return { erro: `Não foi possível salvar a nota: ${error.message}` }
  await registrarEvento(
    ordemId,
    "corrigida",
    usuarioId,
    ordem.arquivo_nota_fiscal ? "Nota fiscal do pagamento substituída." : "Nota fiscal do pagamento incluída.",
    { campo: "arquivo_nota_fiscal", antes: ordem.arquivo_nota_fiscal, depois: caminho }
  )
  return {}
}

/**
 * Inclui ou troca a nota fiscal da COMPRA (do fornecimento). A ordem do
 * fornecimento acompanha quando usava a mesma nota (ou nenhuma) — é o padrão
 * da compra; se a ordem tem nota própria, fica com a dela.
 */
export async function trocarNotaDaCompra(
  processoId: string,
  fornecimentoId: string,
  caminho: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, nota_fiscal_url, ordem_pagamento_id")
    .eq("id", fornecimentoId)
    .maybeSingle()
  if (!f || f.processo_id !== processoId) return { erro: "Fornecimento não encontrado neste processo." }
  const anterior = (f.nota_fiscal_url as string | null) ?? null

  const { error } = await admin
    .from("compras_fornecimentos")
    .update({ nota_fiscal_url: caminho, updated_at: new Date().toISOString() })
    .eq("id", fornecimentoId)
  if (error) return { erro: `Não foi possível salvar a nota: ${error.message}` }

  // Aquisição direta guarda a mesma nota como comprovante do processo.
  await admin
    .from("compras_solicitacoes")
    .update({ comprovante_url: caminho })
    .eq("id", processoId)
    .eq("comprado", true)
    .or(anterior ? `comprovante_url.is.null,comprovante_url.eq."${anterior}"` : "comprovante_url.is.null")

  if (f.ordem_pagamento_id) {
    const ordem = await ordemDoProcesso(String(f.ordem_pagamento_id), processoId)
    if (ordem && (!ordem.arquivo_nota_fiscal || ordem.arquivo_nota_fiscal === anterior)) {
      await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: caminho }).eq("id", ordem.id)
      await registrarEvento(
        ordem.id,
        "corrigida",
        usuarioId,
        anterior ? "Nota fiscal da compra substituída." : "Nota fiscal da compra incluída.",
        { campo: "arquivo_nota_fiscal", antes: anterior, depois: caminho }
      )
    }
  }
  return {}
}

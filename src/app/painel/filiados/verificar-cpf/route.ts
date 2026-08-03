import { tenantAtual } from "@/lib/tenant"
import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Verificação de CPF antes do registro/edição de filiado: dígitos
 * verificadores + duplicidade no cadastro (inclusive registros excluídos).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "filiacao_gestao", ["filiacao_filiados"])
  ) {
    return Response.json({ erro: "sem acesso" }, { status: 403 })
  }

  const cpf = limparCpf(
    new URL(request.url).searchParams.get("cpf") ?? ""
  )
  const valido = validarCpf(cpf)
  if (!valido) return Response.json({ valido: false, existente: false })

  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id")
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", await tenantAtual())
    .limit(1)
    .maybeSingle()

  return Response.json({ valido: true, existente: Boolean(data) })
}

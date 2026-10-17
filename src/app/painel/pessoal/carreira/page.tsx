import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { usoCarreira } from "@/lib/db/carreira-area"
import { podeAcessar } from "@/lib/permissoes"

/**
 * "Carreira" não tem página de área própria: Anuênios e Níveis salariais são
 * as áreas (nível 1). A trilha linka para cá — vai para a que a entidade usa
 * e a pessoa pode ver.
 */
export default async function CarreiraPage() {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_anuenios", "pessoal_niveis_salariais"])
  const uso = await usoCarreira()
  const veAnu = podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_anuenios"])
  redirect(veAnu && (uso.anuenios || !uso.niveis) ? "/painel/pessoal/anuenios" : "/painel/pessoal/niveis")
}

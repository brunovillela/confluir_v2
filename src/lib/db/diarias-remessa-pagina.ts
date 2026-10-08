import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { obterRemessaNova } from "@/lib/db/diarias-remessas"
import { cobrancasDiariaPendentes } from "@/lib/db/veiculos"
import { podeAcessar } from "@/lib/permissoes"

/**
 * O que a tela da remessa precisa nas duas portas: a remessa, as diárias,
 * os comprovantes, quem pode avaliar e as infrações a descontar.
 */
export async function contextoDaRemessa(id: string, sessao: SessaoPainel) {
  const dados = await obterRemessaNova(id)
  if (!dados) return null
  const { remessa, solicitacoes } = dados
  const uid = String(sessao.usuario.id)
  const geraDiarias =
    remessa.quadro === "diretor"
      ? podeAcessar(sessao.permissoes, "diretoria_diarias", ["configuracoes"])
      : podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_diarias"])
  const avaliando = !remessa.enviada && solicitacoes.some((s) => s.situacao === "aguardando")
  const [urls, pendentes] = await Promise.all([
    Promise.all(
      solicitacoes
        .flatMap((s) => s.despesas)
        .map(async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const)
    ),
    avaliando && remessa.beneficiarioId ? cobrancasDiariaPendentes(remessa.beneficiarioId) : Promise.resolve([]),
  ])
  return {
    remessa,
    solicitacoes,
    despesasUrls: new Map(urls),
    geraDiarias,
    podeAvaliar: geraDiarias && remessa.beneficiarioId !== uid,
    infracoes: pendentes.length
      ? { quantidade: pendentes.length, total: pendentes.reduce((a, c) => a + c.valor, 0) }
      : null,
  }
}

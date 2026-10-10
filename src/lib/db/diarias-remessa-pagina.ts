import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { alcadaDoUsuario } from "@/lib/db/compras"
import { obterAutorizacaoDiarias } from "@/lib/db/diarias-config"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { obterRemessaNova, podeEnviarRemessa } from "@/lib/db/diarias-remessas"
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
  const [urls, pendentes, { modo }] = await Promise.all([
    Promise.all(
      solicitacoes
        .flatMap((s) => s.despesas)
        .map(async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const)
    ),
    avaliando && remessa.beneficiarioId ? cobrancasDiariaPendentes(remessa.beneficiarioId) : Promise.resolve([]),
    obterAutorizacaoDiarias(),
  ])
  // Como a ordem nasce se quem vê aprovar (regra das diárias × alçada dele).
  const alcada = alcadaDoUsuario(sessao.permissoes as Record<string, unknown>)
  const valor = solicitacoes
    .filter((s) => s.situacao === "aguardando" || s.situacao === "aprovada")
    .reduce((a, s) => a + (s.valor_total ?? 0) - s.valorDescontos + s.valorDespesas, 0)
  const destinoOrdem =
    modo === "remessa"
      ? "já autorizada por quem aprova a remessa, direto para A pagar"
      : alcada > 0 && valor <= alcada
        ? "já autorizada por você (cabe na sua alçada financeira), direto para A pagar"
        : "enviada à fila de autorização do Financeiro: o valor passa da sua alçada financeira"
  return {
    remessa,
    solicitacoes,
    despesasUrls: new Map(urls),
    geraDiarias,
    destinoOrdem,
    podeAvaliar: geraDiarias && remessa.beneficiarioId !== uid,
    podeEnviar: podeEnviarRemessa(uid, remessa, solicitacoes),
    infracoes: pendentes.length
      ? { quantidade: pendentes.length, total: pendentes.reduce((a, c) => a + c.valor, 0) }
      : null,
  }
}

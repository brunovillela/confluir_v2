import Link from "next/link"

import { SituacaoDiariaBadge } from "@/components/diarias"
import { DespesasDaDiaria } from "@/components/diaria-despesas-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  lancarDespesaPosteriorAction,
  removerDespesaPosteriorAction,
} from "@/app/painel/pessoal/diarias/remessas/actions"
import type { SolicitacaoDiaria } from "@/lib/db/diarias"
import {
  aceitaDespesaPosterior,
  complementoAberto,
  complementosDe,
  PRAZO_DIAS,
  prazoDespesaPosterior,
} from "@/lib/db/diarias-complemento"
import { listarTiposDespesaDiaria } from "@/lib/db/diarias-config"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { formatarData, formatarMoeda } from "@/lib/formato"

/**
 * DESPESAS DEPOIS DA VIAGEM de uma diária já recebida (16/10/2026): o
 * formulário enquanto houver prazo (30 dias após o fim) e os complementos já
 * enviados, com a remessa de cada um. Meu perfil e as duas portas da gestão.
 */
export async function DespesasDepoisDaViagem({
  diaria,
  diariaBase,
  remessaBase,
}: {
  diaria: SolicitacaoDiaria
  /** Base do link do complemento (ex.: /painel/pessoal/diarias); sem ela, sem link. */
  diariaBase?: string
  /** Base do link da remessa (ex.: /painel/pessoal/diarias/remessas). */
  remessaBase?: string
}) {
  if (diaria.situacao !== "aprovada" || diaria.complementoDe) return null
  const aceita = aceitaDespesaPosterior(diaria)
  const [todos, aberto, { tipos }] = await Promise.all([
    complementosDe(diaria.id),
    aceita ? complementoAberto(diaria.id) : Promise.resolve(null),
    aceita ? listarTiposDespesaDiaria() : Promise.resolve({ tipos: [] }),
  ])
  const enviados = todos.filter((c) => c.id !== aberto?.id && c.situacao !== "cancelada")
  if (!aceita && enviados.length === 0) return null
  const urls = new Map(
    await Promise.all(
      (aberto?.despesas ?? []).map(async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const)
    )
  )
  const limite = prazoDespesaPosterior(diaria)
  const rotulo = `${diaria.tipoNome ?? "Diária"}${diaria.data_inicio ? ` de ${formatarData(diaria.data_inicio)}` : ""}`

  return (
    <>
      {aceita && (
        <DespesasDaDiaria
          titulo={`Despesas depois da viagem — ${rotulo}`}
          descricao={`A diária já foi recebida. Lance aqui, com o comprovante, as despesas extras pagas na viagem — até ${limite ? formatarData(limite) : `${PRAZO_DIAS} dias após o fim`}. Elas entram na remessa em preparação e são reembolsadas quando a remessa for aprovada.`}
          solicitacaoId={diaria.id}
          despesas={(aberto?.despesas ?? []).map((d) => ({
            id: d.id,
            tipoNome: d.tipoNome,
            descricao: d.descricao,
            valor: d.valor,
            comprovanteUrl: urls.get(d.id) ?? null,
          }))}
          tipos={tipos
            .filter((t) => t.ativa)
            .map((t) => ({ id: t.id, nome: t.nome, exigeComprovante: t.exigeComprovante }))}
          acaoAdicionar={lancarDespesaPosteriorAction}
          acaoRemover={removerDespesaPosteriorAction}
        />
      )}
      {enviados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas depois da viagem já enviadas</CardTitle>
            <CardDescription>Complementos desta diária, reembolsados pela remessa de cada um.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {enviados.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    {diariaBase ? (
                      <Link href={`${diariaBase}/${c.id}`} className="text-primary hover:underline">
                        {c.despesas.length} despesa(s)
                      </Link>
                    ) : (
                      `${c.despesas.length} despesa(s)`
                    )}
                    {c.remessaCodigo && (
                      <span className="text-muted-foreground">
                        {" "}
                        · remessa{" "}
                        {remessaBase && c.remessaId ? (
                          <Link href={`${remessaBase}/${c.remessaId}`} className="hover:underline">
                            {c.remessaCodigo}
                          </Link>
                        ) : (
                          c.remessaCodigo
                        )}
                      </span>
                    )}
                    {c.ordemCodigo && <span className="text-muted-foreground"> · ordem {c.ordemCodigo}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <SituacaoDiariaBadge situacao={c.situacao} />
                    <span className="tabular-nums">{formatarMoeda(c.valorDespesas)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

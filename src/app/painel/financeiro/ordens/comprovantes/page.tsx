import type { Metadata } from "next"
import Link from "next/link"

import { VoltarLista } from "@/components/voltar-lista"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { pagasSemComprovante } from "@/lib/db/comprovantes-distribuicao"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { AnexarDireto } from "./anexar-direto"
import { Distribuidor } from "./distribuidor"

export const metadata: Metadata = { title: "Distribuir comprovantes — Confluir" }

const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const rotuloMes = (mes: string) => `${NOME_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`

export default async function DistribuirComprovantesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePermissao("financeiro_pagamento")
  const sp = await searchParams
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : null
  // O ano inteiro alimenta os atalhos por mês; a lista mostra o mês escolhido.
  const [debitos, todas] = await Promise.all([
    listarCentrosDeDebito().then((cs) =>
      cs.map((c) => ({ id: c.id, nome: [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — ") }))
    ),
    pagasSemComprovante(null),
  ])
  const porMes = new Map<string, number>()
  for (const o of todas) {
    const m = (o.dataPagamento ?? "").slice(0, 7)
    if (m) porMes.set(m, (porMes.get(m) ?? 0) + 1)
  }
  const lista = mes ? todas.filter((o) => (o.dataPagamento ?? "").startsWith(mes)) : todas
  const meses = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  // Mês escolhido fora do último ano: busca direto.
  const listaFinal = mes && !porMes.has(mes) ? await pagasSemComprovante(mes) : lista

  return (
    <>
      <div>
        <VoltarLista chave="ordens" base="/painel/financeiro/ordens" rotulo="Ordens de pagamento" />
        <h1 className="text-2xl font-semibold tracking-tight">Distribuir comprovantes</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Envie um ou vários comprovantes de pagamento (PDF, JPG ou PNG; um PDF pode ter vários, um por página). O
          sistema lê cada um, procura a ordem sem comprovante que casa com ele e mostra para você confirmar. Ordem já
          paga só ganha o comprovante; ordem a pagar fica Paga, com a data e o valor do comprovante. Se você já sabe
          de qual ordem é o arquivo, use <strong>Anexar</strong> na lista abaixo.
        </p>
      </div>
      <Distribuidor debitos={debitos} hoje={hojeSP()} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pagas por banco sem comprovante ({listaFinal.length}
            {mes ? ` em ${rotuloMes(mes)}` : " no último ano"})
          </CardTitle>
          <CardDescription className="text-xs">
            Pix, TED, boleto e afins já pagos sem o comprovante anexado. Dinheiro fica de fora (pago no caixa).
          </CardDescription>
          {meses.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Link
                href="/painel/financeiro/ordens/comprovantes"
                className={cn("rounded-md border px-2 py-0.5 text-xs", !mes ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                Todos ({todas.length})
              </Link>
              {meses.map(([m, n]) => (
                <Link
                  key={m}
                  href={`/painel/financeiro/ordens/comprovantes?mes=${m}`}
                  className={cn("rounded-md border px-2 py-0.5 text-xs", mes === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {rotuloMes(m)} ({n})
                </Link>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {listaFinal.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">Nenhuma ordem paga sem comprovante{mes ? " neste mês" : ""}.</p>
          ) : (
            <ul className="divide-y">
              {listaFinal.map((o) => (
                <li key={o.id} className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                  <div className="min-w-0">
                    <Link href={`/painel/financeiro/ordens/${o.id}`} className="block truncate text-sm font-medium hover:underline">
                      {o.favorecido ?? o.descricao ?? "—"}
                    </Link>
                    <span className="text-muted-foreground block truncate text-xs">
                      <span className="font-mono">{o.codigo ?? "—"}</span>
                      {o.favorecido && o.descricao ? ` · ${o.descricao}` : ""}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {o.forma ?? "—"} · pago em {formatarData(o.dataPagamento)}
                  </span>
                  <span className="text-right text-sm font-medium whitespace-nowrap tabular-nums">{formatarMoeda(o.valor)}</span>
                  <AnexarDireto ordemId={o.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

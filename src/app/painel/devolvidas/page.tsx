import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { ordensDevolvidasDe } from "@/lib/db/compras-ordens-devolvidas"
import { DIAS_DEVOLVIDA_ESQUECIDA } from "@/lib/db/ordens-devolvidas-paradas"
import { procedenciaDaOrdem } from "@/lib/db/ordens-procedencia"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata: Metadata = { title: "Minhas ordens devolvidas — Confluir" }

const diasDesde = (iso: string) => Math.round((Date.now() - Date.parse(iso.slice(0, 10))) / 86_400_000)

/**
 * MINHAS ORDENS DEVOLVIDAS (26/11/2026): as ordens que a pessoa lançou e o
 * avaliador devolveu, de qualquer origem — compra, reembolso, diária,
 * custeio… —, cada uma com o caminho para a origem, onde se corrige. Antes só
 * as de compra avisavam (Minhas solicitações); as outras ficavam esquecidas.
 */
export default async function MinhasDevolvidasPage() {
  const sessao = await requireSessaoPainel()
  const lista = await ordensDevolvidasDe(String(sessao.usuario.id), {}, "todas").catch(() => [])

  // Onde corrigir: a compra, ou a origem da ordem (procedência).
  const admin = await createAdminClient()
  const outras = lista.filter((d) => !d.processoId)
  const { data: linhas } = outras.length
    ? await admin.from("ordens_pagamento").select("*").in("id", outras.map((d) => d.id))
    : { data: [] as Record<string, unknown>[] }
  const origem = new Map<string, { rotulo: string; href: string | null }>()
  for (const l of linhas ?? []) {
    const p = await procedenciaDaOrdem(l).catch(() => null)
    if (p) origem.set(String(l.id), { rotulo: [p.origem, p.titulo].filter(Boolean).join(" — "), href: p.href })
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas ordens devolvidas</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Ordens que você lançou e o avaliador devolveu pedindo ajuste. Corrija na origem (a compra, o reembolso, a
          diária…) e reenvie; se a correção é na própria ordem ou ela não vai mais ser paga, fale com o Financeiro.
        </p>
      </div>

      {lista.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-success-fg flex items-center justify-center gap-2 py-6 text-sm">
              <CheckCircle2 className="size-4" />
              Nenhuma ordem sua está devolvida.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="text-base">
              {lista.length} ordem{lista.length === 1 ? "" : "s"} devolvida{lista.length === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription>Da mais antiga para a mais nova.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {lista.map((d) => {
              const o = origem.get(d.id)
              const href = d.processoId ? `/painel/compras/${d.processoId}#ordem-devolvida` : (o?.href ?? null)
              const dias = d.devolvidaEm ? diasDesde(d.devolvidaEm) : null
              return (
                <div key={d.id} className="grid gap-1 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
                      <span className="tabular-nums">{d.processoCodigo ?? d.codigo ?? "(sem código)"}</span>
                      {d.tipo && (
                        <Badge variant="outline" className="text-xs">
                          {d.tipo}
                        </Badge>
                      )}
                      <span className="text-muted-foreground min-w-0 truncate text-xs">{d.descricao ?? ""}</span>
                    </p>
                    {href ? (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={href}>
                          <ExternalLink />
                          {d.processoId ? "Abrir a compra" : "Abrir a origem"}
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sem origem no sistema — fale com o Financeiro</span>
                    )}
                  </div>
                  <p className="text-warning-fg text-xs font-medium">Motivo: {d.motivo ?? "não informado"}</p>
                  <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                    <span>Ordem {d.codigo ?? "—"}</span>
                    {d.valor !== null && <span>{formatarMoeda(d.valor)}</span>}
                    {o?.href && !d.processoId && <span>{o.rotulo}</span>}
                    {d.devolvidaEm && (
                      <span>
                        Devolvida em {formatarData(d.devolvidaEm)}
                        {d.devolvidaPorNome ? ` por ${d.devolvidaPorNome}` : ""}
                      </span>
                    )}
                  </p>
                  {dias !== null && dias > DIAS_DEVOLVIDA_ESQUECIDA && (
                    <p className="text-destructive text-xs font-medium">
                      Parada há {dias} dias. Corrija e reenvie — ou, se não vai mais ser paga, peça ao Financeiro para
                      cancelá-la.
                    </p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </>
  )
}

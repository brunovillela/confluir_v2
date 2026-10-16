import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileClock } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { DIAS_AVISO_NOTA, listarNotasAReceber } from "@/lib/db/compras-marketplace"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Notas a receber — Confluir" }

/**
 * Compras em marketplace cuja nota fiscal ainda não chegou (16/10/2026). Quem
 * comprou vê as suas; o comprador central, todas. A ordem de pagamento não
 * espera a nota — a lista é o que falta para a compra ficar completa.
 */
export default async function NotasAReceberPage() {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_compra_direta",
    "aquisicoes_comprador",
  ])
  const escopo = podeAcessar(sessao.permissoes, "aquisicoes_comprador")
    ? null
    : await escopoComprasDoUsuario(sessao.usuario.id)
  const { disponivel, itens } = await listarNotasAReceber(escopo)
  const atrasadas = itens.filter((i) => i.dias >= DIAS_AVISO_NOTA).length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Notas a receber</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Compras em marketplace sem a nota fiscal do vendedor — a ordem de pagamento segue normalmente; falta
          anexar a nota e identificar quem vendeu
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Rode <code>supabase/compras-marketplace.sql</code> no Supabase para habilitar as compras em
            marketplace.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileClock className="size-4" />
            {itens.length} compra{itens.length === 1 ? "" : "s"} aguardando a nota
            {atrasadas > 0 && <Badge variant="warning">{atrasadas} há {DIAS_AVISO_NOTA} dias ou mais</Badge>}
          </CardTitle>
          <CardDescription>
            Abra a compra e use <strong>Anexar nota</strong>: a IA lê o emitente e liga o vendedor. Depois de{" "}
            {DIAS_AVISO_NOTA} dias sem a nota, quem comprou recebe um e-mail (uma vez).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma nota pendente.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="px-2 py-2 font-medium">Compra</th>
                    <th className="px-2 py-2 font-medium">Marketplace · vendedor</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 font-medium">Compra em</th>
                    <th className="px-2 py-2 text-right font-medium">Espera</th>
                    <th className="px-2 py-2 font-medium">Comprador</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.fornecimentoId} className="border-b last:border-0 align-top">
                      <td className="px-2 py-2">
                        <Link href={`/painel/compras/${i.processoId}`} className="text-primary font-medium tabular-nums hover:underline">
                          {i.codigo ?? "(sem código)"}
                        </Link>
                        <p className="text-muted-foreground line-clamp-2 text-xs">{i.produto ?? "—"}</p>
                        {i.departamentoNome && <p className="text-muted-foreground text-xs">{i.departamentoNome}</p>}
                      </td>
                      <td className="px-2 py-2">
                        {i.marketplace}
                        <p className="text-muted-foreground text-xs">{i.vendedor ?? "vendedor a identificar"}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatarMoeda(i.valor)}</td>
                      <td className="px-2 py-2 tabular-nums">{formatarData(i.dataCompra)}</td>
                      <td className="px-2 py-2 text-right">
                        <Badge variant={i.dias >= DIAS_AVISO_NOTA ? "warning" : "outline"}>
                          {i.dias} dia{i.dias === 1 ? "" : "s"}
                        </Badge>
                        {i.avisadoEm && (
                          <p className="text-muted-foreground mt-0.5 text-[11px]">avisado {formatarData(i.avisadoEm)}</p>
                        )}
                      </td>
                      <td className="px-2 py-2">{i.comprador ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

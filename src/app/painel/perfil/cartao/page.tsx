import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CreditCard, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireSessaoPainel } from "@/lib/auth"
import { rotuloTipoCartao } from "@/lib/compras-constantes"
import { listarFaturasDoCartao, obterFatura } from "@/lib/db/cartao-faturas"
import { cartoesDoResponsavel, nomeCartao } from "@/lib/db/compras-pagamento"
import { urlArquivoOrdem } from "@/lib/db/ordens-extrato"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { SituacaoBadge } from "../../financeiro/situacao-badge"

export const metadata: Metadata = { title: "Meu cartão — Confluir" }

/**
 * MEU CARTÃO (19/10/2026): o cartão que fica na posse de um responsável (uso
 * "responsavel" no cadastro) — ele acompanha a fatura aberta e as fechadas,
 * como o Meu caixa. Só leitura: quem fecha a fatura é o Financeiro. Cartão
 * corporativo não aparece aqui (a fatura fica no Financeiro).
 */
export default async function MeuCartaoPage({
  searchParams,
}: {
  searchParams: Promise<{ cartao?: string; fatura?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const params = await searchParams
  const cartoes = await cartoesDoResponsavel(sessao.usuario.id)

  const cabecalho = (
    <div>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
        <Link href="/painel/perfil">
          <ArrowLeft />
          Meu perfil
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Meu cartão</h1>
        <CreditCard className="text-muted-foreground size-5" />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        As compras feitas com o cartão que está com você e as faturas dele. Quem fecha e paga a fatura é o Financeiro.
      </p>
    </div>
  )

  if (cartoes.length === 0) {
    return (
      <>
        {cabecalho}
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <CreditCard className="size-6" />
            <p>Nenhum cartão da entidade está sob sua responsabilidade. Quem cadastra os cartões é o Financeiro.</p>
          </CardContent>
        </Card>
      </>
    )
  }

  const cartao = cartoes.find((c) => c.id === params.cartao) ?? cartoes[0]
  const credito = cartao.tipo === "credito"
  const { faturas } = credito ? await listarFaturasDoCartao(cartao.id) : { faturas: [] }
  const escolhida = faturas.find((f) => f.id === params.fatura) ?? faturas[0] ?? null
  const det = escolhida ? await obterFatura(escolhida.id) : null
  const urlFatura = det ? await urlArquivoOrdem(det.fatura.arquivoFatura) : null
  const link = (q: { cartao?: string; fatura?: string }) =>
    `/painel/perfil/cartao?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`

  return (
    <>
      {cabecalho}

      {cartoes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cartoes.map((c) => (
            <Button key={c.id} asChild size="sm" variant={c.id === cartao.id ? "default" : "outline"}>
              <Link href={link({ cartao: c.id })}>{nomeCartao(c)}</Link>
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{nomeCartao(cartao)}</CardTitle>
          <CardDescription>
            {rotuloTipoCartao(cartao.tipo)}
            {credito ? " · as compras entram na fatura aberta; no fechamento o Financeiro paga a fatura numa ordem só." : " · sem fatura: cada compra é paga na própria ordem."}
          </CardDescription>
        </CardHeader>
        {credito && faturas.length > 0 && (
          <CardContent className="flex flex-wrap gap-2">
            {faturas.map((f) => (
              <Link
                key={f.id}
                href={link({ cartao: cartao.id, fatura: f.id })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs",
                  f.id === escolhida?.id ? "border-primary bg-primary/10" : "hover:bg-muted"
                )}
              >
                Nº {f.numero} · {f.situacao === "aberta" ? "aberta" : "fechada"} ·{" "}
                {formatarMoeda(f.valorFatura ?? f.soma)}
              </Link>
            ))}
          </CardContent>
        )}
      </Card>

      {credito && !det && (
        <p className="text-muted-foreground text-sm">Nenhuma fatura ainda — a primeira abre na primeira compra com o cartão.</p>
      )}

      {det && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  Fatura nº {det.fatura.numero}{" "}
                  <Badge variant={det.fatura.situacao === "aberta" ? "default" : "secondary"} className="ml-1">
                    {det.fatura.situacao === "aberta" ? "Aberta" : "Fechada"}
                  </Badge>
                </CardDescription>
                <CardTitle className="text-xl">{formatarMoeda(det.fatura.soma)}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {det.fatura.compras} compra(s) desde {formatarData(det.fatura.abertaEm.slice(0, 10))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Valor da fatura</CardDescription>
                <CardTitle className="text-xl">
                  {det.fatura.valorFatura === null ? "—" : formatarMoeda(det.fatura.valorFatura)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {det.fatura.valorFatura === null
                  ? "Informado pelo Financeiro no fechamento."
                  : det.fatura.vencimento
                    ? `Vence ${formatarData(det.fatura.vencimento)}`
                    : ""}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pagamento</CardDescription>
                <CardTitle className="text-base">
                  {det.fatura.ordemSituacao ? <SituacaoBadge situacao={det.fatura.ordemSituacao} /> : "Fatura em aberto"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 text-xs">
                {urlFatura && (
                  <a href={urlFatura} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                    <FileText className="size-3.5" />
                    Fatura
                  </a>
                )}
                {det.fatura.ordemId && (
                  <a
                    href={`/painel/perfil/cartao/despesa/${det.fatura.ordemId}/extrato`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Extrato da ordem
                  </a>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Compra</TableHead>
                  <TableHead className="hidden md:table-cell">Data</TableHead>
                  <TableHead className="hidden lg:table-cell">Centro de custo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {det.itens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20">
                      <p className="text-muted-foreground text-center text-sm">Nenhuma compra nesta fatura.</p>
                    </TableCell>
                  </TableRow>
                )}
                {det.itens.map((i) => (
                  <TableRow key={i.id} className={i.conta ? "" : "opacity-60"}>
                    <TableCell className="max-w-80">
                      <a
                        href={`/painel/perfil/cartao/despesa/${i.id}/extrato`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {i.favorecido ?? i.codigo ?? "—"}
                      </a>
                      <span className="text-muted-foreground block truncate text-xs">{i.descricao}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{i.data ? formatarData(i.data) : "—"}</TableCell>
                    <TableCell className="hidden text-xs lg:table-cell">{i.centro ?? "—"}</TableCell>
                    <TableCell>
                      <SituacaoBadge situacao={i.situacao} />
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${i.conta ? "" : "line-through"}`}>{formatarMoeda(i.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  )
}

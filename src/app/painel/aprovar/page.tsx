import type { Metadata } from "next"
import Link from "next/link"
import { CheckCheck, ExternalLink, FileSignature, HandCoins, Receipt } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { paraAprovar } from "@/lib/db/diretor-home"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { DecisaoForm } from "./decisao-form"

export const metadata: Metadata = { title: "Aprovar — Confluir" }

/**
 * APROVAR PELO CELULAR (onda 4, D2): uma lista só do que espera a decisão
 * da pessoa — ordens na alçada, documentos para assinar, diárias — em cards
 * de uma coluna, com botões grandes. O 2FA vale como em toda tela sensível.
 */
export default async function AprovarPage() {
  const sessao = await requireSessaoPainel()
  const a = await paraAprovar(sessao)
  const total = a.ordens.length + a.assinaturas.length + a.diarias.length

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Aprovar</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {total === 0 ? "Nada espera a sua decisão agora." : `${total} ${total === 1 ? "item" : "itens"} esperando você.`}
          {a.ordensAcima > 0 ? ` Há ${a.ordensAcima} ${a.ordensAcima === 1 ? "ordem" : "ordens"} acima da sua alçada.` : ""}
        </p>
      </div>

      {total === 0 && (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <CheckCheck className="size-6" />
            Tudo em dia.
          </CardContent>
        </Card>
      )}

      {a.ordens.length > 0 && (
        <section className="mb-6 grid gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Receipt className="text-muted-foreground size-4" />
            Ordens de pagamento na sua alçada ({a.ordens.length})
          </h2>
          {a.ordens.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle className="text-base">{formatarMoeda(o.valor_inicial_cobranca ?? 0)}</CardTitle>
                <CardDescription className="text-xs">
                  {[o.tipo, o.favorecidoNome, o.departamentoNome].filter(Boolean).join(" · ")}
                  {o.vencimento ? ` · vence ${formatarData(o.vencimento)}` : ""}
                  {o.alertas > 0 ? ` · ${o.alertas} alerta${o.alertas === 1 ? "" : "s"} da auditoria` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(o.produto ?? o.descricao) && <p className="text-sm">{o.produto ?? o.descricao}</p>}
                {o.aposEstorno && (
                  <p className="text-muted-foreground text-xs">
                    Reenviada após estorno: {o.aposEstorno.motivo}
                    {o.aposEstorno.correcao ? ` — ${o.aposEstorno.correcao}` : ""}
                  </p>
                )}
                <Link
                  href={o.processo_compra_id ? `/painel/compras/${o.processo_compra_id}` : `/painel/financeiro/ordens/${o.id}/extrato`}
                  className="text-muted-foreground inline-flex min-h-9 items-center gap-1 text-xs underline underline-offset-4"
                >
                  <ExternalLink className="size-3.5" />
                  Ver detalhes
                </Link>
                <DecisaoForm tipo="ordem" id={o.id} resumo={`a ordem de ${formatarMoeda(o.valor_inicial_cobranca ?? 0)}`} rotuloVoltar="Devolver" />
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {a.assinaturas.length > 0 && (
        <section className="mb-6 grid gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <FileSignature className="text-muted-foreground size-4" />
            Documentos para assinar ({a.assinaturas.length})
          </h2>
          {a.assinaturas.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {s.documentoTipo === "minuta" ? "Contrato" : s.documentoTipo === "termo" ? "Termo" : "Ofício"}
                    {s.papel ? ` · ${s.papel}` : ""}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {s.enviadoEm ? `enviado em ${formatarDataHora(s.enviadoEm)}` : ""}
                  </span>
                </span>
                <Link href={`/assinar/${encodeURIComponent(s.token)}`} className="bg-primary text-primary-foreground inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium">
                  <FileSignature className="size-4" />
                  Assinar
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {a.diarias.length > 0 && (
        <section className="mb-6 grid gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <HandCoins className="text-muted-foreground size-4" />
            Diárias aguardando ({a.diarias.length})
          </h2>
          {a.diarias.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {d.funcionarioNome ?? "—"}
                  {d.valor_total !== null ? ` · ${formatarMoeda(d.valor_total + d.valorDespesas)}` : ""}
                </CardTitle>
                <CardDescription className="text-xs">
                  {[d.tipoNome, d.quantidade ? `${d.quantidade} diária${d.quantidade === 1 ? "" : "s"}` : null, d.departamentoNome].filter(Boolean).join(" · ")}
                  {d.data_inicio ? ` · ${formatarData(d.data_inicio)}${d.data_termino && d.data_termino !== d.data_inicio ? ` a ${formatarData(d.data_termino)}` : ""}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {d.motivo && <p className="text-sm">{d.motivo}</p>}
                <Link
                  href={d.beneficiarioTipo === "diretor" ? `/painel/institucional/diretoria/diarias/${d.id}` : `/painel/pessoal/diarias/${d.id}`}
                  className="text-muted-foreground inline-flex min-h-9 items-center gap-1 text-xs underline underline-offset-4"
                >
                  <ExternalLink className="size-3.5" />
                  Ver detalhes e despesas
                </Link>
                <DecisaoForm tipo="diaria" id={d.id} resumo={`a diária de ${d.funcionarioNome ?? "—"}`} rotuloVoltar="Reprovar" />
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"

import { SituacaoProcessoBadge } from "@/components/compras"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { cotacaoForaDoPrazo, diasUteisDesde } from "@/lib/compras-prazo"
import { listarMinhasSolicitacoes, type MinhaSolicitacao } from "@/lib/db/compras"
import { hojeSP } from "@/lib/db/comum"
import { lerComprasConfig } from "@/lib/db/compras-config"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Minhas solicitações — Confluir" }

/** O que está acontecendo com a solicitação, em uma frase. */
function andamento(s: MinhaSolicitacao, hoje: string, prazo: number | null): { texto: string; alerta?: boolean } {
  switch (s.situacao) {
    case "solicitada": {
      const dias = diasUteisDesde(s.created_at?.slice(0, 10) ?? null, hoje)
      const fora = cotacaoForaDoPrazo(s.created_at?.slice(0, 10) ?? null, hoje, prazo)
      return {
        texto: `Esperando o comprador iniciar a cotação${dias ? ` há ${dias} dia${dias === 1 ? "" : "s"} út${dias === 1 ? "il" : "eis"}` : ""}${fora ? " — fora do prazo" : ""}`,
        alerta: fora,
      }
    }
    case "em_cotacao":
      return { texto: `Em cotação${s.cotacao_inicio ? ` desde ${formatarData(s.cotacao_inicio)}` : ""}: o comprador está coletando propostas` }
    case "cotada":
      return { texto: "Cotação encerrada: falta o comprador efetivar a compra" }
    case "comprada":
      return {
        texto: `Comprada${s.compra_data ? ` em ${formatarData(s.compra_data)}` : ""}${s.compra_valor ? ` por ${formatarMoeda(s.compra_valor)}` : ""}: aguardando a entrega`,
      }
    case "recebida":
      return { texto: `Recebida${s.recebimento_data ? ` em ${formatarData(s.recebimento_data)}` : ""}` }
    case "cancelada":
      return { texto: `Cancelada${s.cancelado_motivo ? `: ${s.cancelado_motivo}` : ""}` }
    default:
      return { texto: "" }
  }
}

/**
 * Minhas solicitações (16/11/2026): quem pede uma compra Via Aquisição
 * acompanha a etapa de cada pedido sem abrir processo por processo.
 */
export default async function MinhasSolicitacoesPage() {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_compra_direta",
    "aquisicoes_comprador",
  ])
  const [lista, config] = await Promise.all([listarMinhasSolicitacoes(sessao.usuario.id), lerComprasConfig()])
  const hoje = hojeSP()
  const abertas = lista.filter((s) => !["recebida", "cancelada"].includes(s.situacao))
  const encerradas = lista.filter((s) => ["recebida", "cancelada"].includes(s.situacao))

  const Linha = ({ s }: { s: MinhaSolicitacao }) => {
    const a = andamento(s, hoje, config.prazoCotacao)
    return (
      <Link
        href={`/painel/compras/${s.id}`}
        className="hover:border-primary/40 grid gap-1 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
            <span className="text-primary tabular-nums">{s.codigo ?? "(sem código)"}</span>
            <span className="min-w-0 truncate">{s.produto ?? "—"}</span>
          </p>
          <p className={`mt-0.5 text-xs ${a.alerta ? "text-warning-fg font-medium" : "text-muted-foreground"}`}>{a.texto}</p>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
            {s.departamentoNome && <span>{s.departamentoNome}</span>}
            {s.created_at && <span>Solicitada em {formatarData(s.created_at)}</span>}
            {s.data_limite && <span>Receber até {formatarData(s.data_limite)}</span>}
          </p>
        </div>
        <SituacaoProcessoBadge situacao={s.situacao} />
      </Link>
    )
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Minhas solicitações</h1>
          <Button asChild>
            <Link href="/painel/compras/nova">
              <Plus />
              Nova solicitação
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          As compras que você pediu Via Aquisição e em que etapa cada uma está. Você é avisado quando a compra é feita e
          quando o item chega (ligue "Sua solicitação de compra foi comprada ou recebida" em Meu perfil → Avisos para
          receber também por e-mail, Telegram ou celular).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Em andamento ({abertas.length})</CardTitle>
          <CardDescription>Da solicitação à entrega.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {abertas.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Nenhuma solicitação em andamento.</p>
          ) : (
            abertas.map((s) => <Linha key={s.id} s={s} />)
          )}
        </CardContent>
      </Card>

      {encerradas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recebidas e canceladas ({encerradas.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {encerradas.map((s) => (
              <Linha key={s.id} s={s} />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}

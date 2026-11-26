import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CopyPlus, Plus } from "lucide-react"

import { SituacaoProcessoBadge } from "@/components/compras"
import { LembrarLista } from "@/components/voltar-lista"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { cotacaoForaDoPrazo, diasUteisDesde } from "@/lib/compras-prazo"
import { ROTULOS_SITUACAO_PROCESSO, SITUACOES_PROCESSO } from "@/lib/compras-constantes"
import { semAcento } from "@/lib/texto"
import { listarMinhasSolicitacoes, type MinhaSolicitacao } from "@/lib/db/compras"
import { hojeSP } from "@/lib/db/comum"
import { lerComprasConfig } from "@/lib/db/compras-config"
import { ordensDevolvidasDe } from "@/lib/db/compras-ordens-devolvidas"
import { DIAS_DEVOLVIDA_ESQUECIDA } from "@/lib/db/ordens-devolvidas-paradas"

/** Dias desde a devolução (AAAA-MM-DD). */
const diasParada = (desde: string) => Math.round((Date.now() - Date.parse(desde.slice(0, 10))) / 86_400_000)
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Minhas solicitações — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

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
export default async function MinhasSolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; situacao?: string }>
}) {
  const sp = await searchParams
  const busca = (sp.busca ?? "").trim()
  const situacao = (SITUACOES_PROCESSO as readonly string[]).includes(sp.situacao ?? "") ? sp.situacao! : ""
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_compra_direta",
    "aquisicoes_comprador",
  ])
  const [lista, config, devolvidas] = await Promise.all([
    listarMinhasSolicitacoes(sessao.usuario.id),
    lerComprasConfig(),
    ordensDevolvidasDe(sessao.usuario.id).catch(() => []),
  ])
  const hoje = hojeSP()
  const podeRepetir = podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])
  // Filtros (24/11/2026): busca por código ou produto, sem acento, e a etapa.
  const termo = semAcento(busca.toLowerCase())
  const filtrada = lista.filter(
    (s) =>
      (!situacao || s.situacao === situacao) &&
      (!termo || semAcento(`${s.codigo ?? ""} ${s.produto ?? ""}`.toLowerCase()).includes(termo))
  )
  const temFiltro = Boolean(busca || situacao)
  const abertas = filtrada.filter((s) => !["recebida", "cancelada"].includes(s.situacao))
  const encerradas = filtrada.filter((s) => ["recebida", "cancelada"].includes(s.situacao))
  // Recorte atual, para a compra voltar a ele (mesma chave dos Processos de compra).
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (situacao) q.set("situacao", situacao)
  const urlAtual = `/painel/compras/minhas${q.size ? `?${q}` : ""}`

  const Linha = ({ s }: { s: MinhaSolicitacao }) => {
    const a = andamento(s, hoje, config.prazoCotacao)
    return (
      <div className="hover:border-primary/40 relative grid gap-1 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <Link href={`/painel/compras/${s.id}`} className="absolute inset-0 rounded-md" aria-label={`Abrir ${s.codigo ?? "a solicitação"}`} />
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
        <div className="relative flex items-center gap-2 sm:justify-end">
          <SituacaoProcessoBadge situacao={s.situacao} />
          {podeRepetir && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link href={`/painel/compras/nova?repetir=${s.id}`} title="Nova solicitação com os dados desta">
                <CopyPlus />
                Repetir
              </Link>
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <LembrarLista chave="compras-lista" url={urlAtual} />
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
          quando o item chega (ligue &ldquo;Sua solicitação de compra foi comprada ou recebida&rdquo; em Meu perfil → Avisos para
          receber também por e-mail, Telegram ou celular).
        </p>
      </div>

      {devolvidas.length > 0 && (
        <Card id="devolvidas" className="border-warning/50 scroll-mt-24">
          <CardHeader>
            <CardTitle className="text-base">Compras devolvidas para você ({devolvidas.length})</CardTitle>
            <CardDescription>
              Ordens que você lançou e o avaliador devolveu pedindo ajuste. Abra a compra para corrigir ou responder e
              reenviar para autorização.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {devolvidas.map((d) => (
              <Link
                key={d.id}
                href={d.processoId ? `/painel/compras/${d.processoId}#ordem-devolvida` : `/painel/financeiro/ordens/${d.id}`}
                className="hover:border-primary/40 grid gap-1 rounded-md border p-3"
              >
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
                  <span className="text-primary tabular-nums">{d.processoCodigo ?? d.codigo ?? "(sem código)"}</span>
                  <span className="text-muted-foreground min-w-0 truncate text-xs">{d.descricao ?? ""}</span>
                </p>
                <p className="text-warning-fg text-xs font-medium">Motivo: {d.motivo ?? "não informado"}</p>
                {d.devolvidaEm && diasParada(d.devolvidaEm) > DIAS_DEVOLVIDA_ESQUECIDA && (
                  <p className="text-destructive text-xs font-medium">
                    Parada há {diasParada(d.devolvidaEm)} dias. Corrija e reenvie — ou, se não vai mais ser paga, peça
                    ao Financeiro para cancelá-la.
                  </p>
                )}
                <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                  <span>Ordem {d.codigo ?? "—"}</span>
                  {d.valor !== null && <span>{formatarMoeda(d.valor)}</span>}
                  {d.devolvidaEm && (
                    <span>
                      Devolvida em {formatarData(d.devolvidaEm)}
                      {d.devolvidaPorNome ? ` por ${d.devolvidaPorNome}` : ""}
                    </span>
                  )}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <form action="/painel/compras/minhas" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Código ou produto/serviço"
          aria-label="Buscar por código ou produto/serviço"
          className={`${FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} aria-label="Etapa" className={FILTRO}>
          <option value="">Todas as etapas</option>
          {SITUACOES_PROCESSO.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO_PROCESSO[s]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Filtrar
        </Button>
        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-9" asChild>
            <Link href="/painel/compras/minhas">Limpar</Link>
          </Button>
        )}
        {temFiltro && (
          <span className="text-muted-foreground text-xs">
            {filtrada.length} de {lista.length} solicitaç{lista.length === 1 ? "ão" : "ões"}
          </span>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Em andamento ({abertas.length})</CardTitle>
          <CardDescription>Da solicitação à entrega.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {abertas.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              {temFiltro ? "Nenhuma solicitação em andamento com estes filtros." : "Nenhuma solicitação em andamento."}
            </p>
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

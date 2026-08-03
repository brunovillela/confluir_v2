import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Filter, Receipt, X } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { SituacaoReembolsoBadge } from "@/components/juridico"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import {
  listarReembolsos,
  obterCentroCustoJuridico,
  urlComprovanteReembolso,
} from "@/lib/db/juridico"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import {
  FILTROS_SITUACAO_REEMBOLSO,
  filtroSituacaoReembolsoValido,
  type FiltroSituacaoReembolso,
} from "@/lib/juridico-constantes"

import {
  AvaliarReembolsoForm,
  ConfigCentroCustoForm,
} from "../processos/reembolso-forms"

export const metadata: Metadata = { title: "Reembolsos jurídicos — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = Record<string, string | undefined>

export default async function ReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])
  const podeAprovar = podeAcessar(sessao.permissoes, "juridico_gestao", [
    "juridico_geral",
  ])

  const p = await searchParams
  const situacao: FiltroSituacaoReembolso = filtroSituacaoReembolsoValido(
    p.situacao ?? ""
  )
    ? (p.situacao as FiltroSituacaoReembolso)
    : "aguardando"
  const busca = (p.busca ?? "").trim()

  const [{ linhas, disponivel }, centroCusto, centros] = await Promise.all([
    listarReembolsos({ busca, situacao }),
    podeAprovar
      ? obterCentroCustoJuridico()
      : Promise.resolve({ centroCustoId: null, centroCustoNome: null }),
    podeAprovar ? listarCentrosCusto() : Promise.resolve([]),
  ])

  // Sem restrição por classificação (tipo_da_conta): em multitenant cada
  // organização compõe seu próprio plano de contas. Só ocultamos as contas
  // marcadas como não usáveis — mesmo critério de Compras/Contratos.
  const opcoesCentro = centros
    .filter((c) => c.usavel !== false)
    .map((c) => ({
      id: c.id,
      rotulo:
        [c.classificador, c.nome_da_conta].filter(Boolean).join(" - ") ||
        c.nome_da_conta ||
        "(sem nome)",
    }))

  const comprovantes = new Map(
    await Promise.all(
      linhas.map(
        async (r) =>
          [r.id, await urlComprovanteReembolso(r.comprovante_despesa)] as const
      )
    )
  )

  const temFiltro = Boolean(busca) || situacao !== "aguardando"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/juridico">
            <ArrowLeft />
            Jurídico
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reembolsos jurídicos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Despesas dos escritórios: aprovação gera a ordem de pagamento
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Reembolsos ainda não configurados — rode{" "}
            <code>supabase/juridico-reembolsos.sql</code> no SQL Editor do
            Supabase.
          </AlertDescription>
        </Alert>
      )}

      {podeAprovar && (
        <GrupoColapsavel
          titulo="Centro de custo dos reembolsos"
          descricao="Conta que as ordens de reembolso aprovadas passam a carregar"
          resumo={
            <span className="text-muted-foreground text-sm">
              {centroCusto.centroCustoNome ?? "Não definido"}
            </span>
          }
        >
          {!centroCusto.centroCustoId && (
            <Alert variant="warning" className="mb-4">
              <AlertDescription>
                Nenhum centro de custo definido — as ordens geradas ao aprovar
                sairão sem centro de custo. Escolha uma conta abaixo.
              </AlertDescription>
            </Alert>
          )}
          <ConfigCentroCustoForm
            centros={opcoesCentro}
            atualId={centroCusto.centroCustoId}
          />
        </GrupoColapsavel>
      )}

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-center gap-2" action="/painel/juridico/reembolsos">
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Processo, escritório, despesa, solicitante…"
              className={`${CAMPO} w-80 max-w-full`}
            />
            <select name="situacao" defaultValue={situacao} className={CAMPO}>
              {FILTROS_SITUACAO_REEMBOLSO.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              <Filter />
              Filtrar
            </Button>
            {temFiltro && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/painel/juridico/reembolsos">
                  <X />
                  Limpar
                </Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {linhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-10 text-center text-sm">
              <Receipt className="mx-auto mb-2 size-5" />
              Nenhum reembolso {situacao === "aguardando" ? "aguardando aprovação" : "com estes filtros"}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {linhas.map((r) => (
            <Card key={r.id}>
              <CardContent className="grid gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatarMoeda(r.valor)}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {r.descricao_despesa ?? "—"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Processo{" "}
                      <Link
                        href={`/painel/juridico/processos/${r.processo.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.processo.numero_processo ?? "(sem número)"}
                      </Link>
                      {r.processo.escritorio && <> · {r.processo.escritorio}</>}
                      {r.solicitante && <> · por {r.solicitante}</>}
                      {r.created_at && <> · {formatarDataHora(r.created_at)}</>}
                      {r.data_despesa && <> · despesa em {formatarData(r.data_despesa)}</>}
                      {r.ordemCodigo && <> · ordem {r.ordemCodigo}</>}
                    </p>
                  </div>
                  <SituacaoReembolsoBadge situacao={r.situacaoExibida} />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {comprovantes.get(r.id) && (
                    <a
                      href={comprovantes.get(r.id)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      Comprovante
                    </a>
                  )}
                  {r.avaliacao_observacao && (
                    <span className="text-muted-foreground">
                      Obs.: {r.avaliacao_observacao}
                    </span>
                  )}
                </div>

                {podeAprovar && r.situacao === "aguardando" && (
                  <GrupoColapsavel titulo="Avaliar reembolso">
                    <AvaliarReembolsoForm
                      reembolsoId={r.id}
                      processoId={r.processo.id}
                    />
                  </GrupoColapsavel>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, PackageCheck, PackageOpen } from "lucide-react"

import { LembrarLista } from "@/components/voltar-lista"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarRecebimentosPendentes } from "@/lib/db/compras"
import { hojeSP } from "@/lib/db/comum"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { semAcento } from "@/lib/texto"

import { RecebimentoForm } from "../[id]/processo-forms"

export const metadata: Metadata = { title: "Recebimentos — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function RecebimentosComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; busca?: string; departamento?: string; atrasados?: string }>
}) {
  await requirePermissao("aquisicoes_recebimentos", [
    "aquisicoes_compras_edicao",
  ])
  const sp = await searchParams
  const { salvo } = sp
  const { disponivel, pendentes: todos } = await listarRecebimentosPendentes()
  const hoje = hojeSP()

  // Filtros (24/11/2026): busca por código, produto ou fornecedor (sem
  // acento), departamento e só os atrasados. A lista lembra o recorte na aba,
  // e registrar a chegada volta a ele (FILTROS_RECEBIMENTOS).
  const busca = (sp.busca ?? "").trim()
  const departamentos = [...new Set(todos.map((f) => f.departamentoNome).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  )
  const departamento = departamentos.includes(sp.departamento ?? "") ? sp.departamento! : ""
  const atrasados = sp.atrasados === "1"
  const termo = semAcento(busca.toLowerCase())
  const pendentes = todos.filter(
    (f) =>
      (!departamento || f.departamentoNome === departamento) &&
      (!atrasados || Boolean(f.entrega_esperada && f.entrega_esperada.data < hoje)) &&
      (!termo ||
        semAcento(`${f.processoCodigo ?? ""} ${f.produto ?? ""} ${f.fornecedorNome ?? ""}`.toLowerCase()).includes(termo))
  )
  const temFiltro = Boolean(busca || departamento || atrasados)
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (departamento) q.set("departamento", departamento)
  if (atrasados) q.set("atrasados", "1")
  const recorte = q.toString()
  const urlAtual = `/painel/compras/recebimentos${recorte ? `?${recorte}` : ""}`

  return (
    <>
      <LembrarLista chave="compras-lista" url={urlAtual} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recebimentos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Compras que ainda vão chegar: aquisição direta não recebida e
          compras via Aquisição já feitas. Confira e registre a chegada.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Recebimento registrado.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Rode <code>supabase/compras.sql</code> no Supabase para habilitar
            os fornecimentos.
          </AlertDescription>
        </Alert>
      )}

      {todos.length > 0 && (
        <form action="/painel/compras/recebimentos" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Código, produto ou fornecedor"
            aria-label="Buscar por código, produto ou fornecedor"
            className={`${FILTRO} w-64 max-w-full`}
          />
          {departamentos.length > 1 && (
            <select name="departamento" defaultValue={departamento} aria-label="Departamento" className={FILTRO}>
              <option value="">Todos os departamentos</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <label className="border-input flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
            <input type="checkbox" name="atrasados" value="1" defaultChecked={atrasados} className="accent-primary size-4" />
            Só atrasados
          </label>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Filtrar
          </Button>
          {temFiltro && (
            <>
              <Button variant="ghost" size="sm" className="h-9" asChild>
                <Link href="/painel/compras/recebimentos">Limpar</Link>
              </Button>
              <span className="text-muted-foreground text-xs">
                {pendentes.length} de {todos.length}
              </span>
            </>
          )}
        </form>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            A receber ({pendentes.length})
          </CardTitle>
          <CardDescription>
            Os atrasados primeiro. A data esperada é a previsão de entrega; sem ela, o prazo da solicitação; sem nenhum dos dois, 15 dias depois da compra. Clique na compra para registrar a chegada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {pendentes.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              <PackageOpen className="mx-auto mb-2 size-5" />
              {temFiltro ? "Nada aguardando chegada com estes filtros." : "Nada aguardando chegada."}
            </p>
          ) : (
            pendentes.map((f) => {
              const esperada = f.entrega_esperada
              const atrasado = !!esperada && esperada.data < hoje
              const rotuloData =
                esperada?.origem === "previsao"
                  ? "previsto para"
                  : esperada?.origem === "prazo_solicitacao"
                    ? "receber até"
                    : "esperado até"
              return (
                <details
                  key={f.id}
                  className="border-border group hover:border-primary/40 rounded-md border open:border-primary/40"
                >
                  <summary className="grid cursor-pointer list-none gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                    <div className="grid min-w-0 gap-1">
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
                        <Link
                          href={`/painel/compras/${f.processo_id}`}
                          className="text-primary tabular-nums hover:underline"
                        >
                          {f.processoCodigo ?? "(sem código)"}
                        </Link>
                        {f.fornecedorNome && (
                          <span className="min-w-0 truncate">{f.fornecedorNome}</span>
                        )}
                      </p>
                      <p
                        className="text-muted-foreground line-clamp-2 text-xs break-words"
                        title={f.produto ?? undefined}
                      >
                        {f.produto ?? "—"}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {f.departamentoNome && <span>{f.departamentoNome}</span>}
                        {f.data_compra && (
                          <span>Comprado em {formatarData(f.data_compra)}</span>
                        )}
                        {esperada ? (
                          <Badge
                            variant={atrasado ? "warning" : "outline"}
                            title={
                              esperada.origem === "padrao"
                                ? "Sem previsão nem prazo na solicitação: espera-se a entrega em 15 dias da compra"
                                : undefined
                            }
                          >
                            {atrasado ? `Atrasado · ${rotuloData} ` : `${rotuloData[0].toUpperCase()}${rotuloData.slice(1)} `}
                            {formatarData(esperada.data)}
                          </Badge>
                        ) : (
                          <span className="italic">Sem previsão de entrega</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                      <span className="text-base font-semibold whitespace-nowrap tabular-nums">
                        {formatarMoeda(f.valor)}
                      </span>
                      <span className="text-primary border-primary/40 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap group-open:hidden">
                        <PackageCheck className="size-3.5" />
                        Registrar chegada
                      </span>
                      <span className="text-muted-foreground hidden text-xs group-open:inline">
                        Fechar
                      </span>
                    </div>
                  </summary>
                  <div className="border-border mx-3 mb-3 border-t pt-3">
                    <RecebimentoForm processoId="" fornecimentoId={f.id} recorte={recorte} />
                  </div>
                </details>
              )
            })
          )}
        </CardContent>
      </Card>
    </>
  )
}

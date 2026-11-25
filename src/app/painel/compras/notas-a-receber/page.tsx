import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileClock, Wallet } from "lucide-react"

import { LembrarLista } from "@/components/voltar-lista"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { DIAS_AVISO_NOTA, listarComprasSemNota, listarNotasAReceber } from "@/lib/db/compras-marketplace"
import { creditosEmAberto, DIAS_AVISO_VALIDADE } from "@/lib/db/compras-cancelamento"
import { DarCreditoComoPerdido, MarcarCreditoUsado } from "../[id]/cancelamento-compra"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Notas a receber — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Compras em marketplace cuja nota fiscal ainda não chegou (16/10/2026). Quem
 * comprou vê as suas; o comprador central, todas. A ordem de pagamento não
 * espera a nota — a lista é o que falta para a compra ficar completa.
 */
export default async function NotasAReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; departamento?: string; antigas?: string }>
}) {
  const sp = await searchParams
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_compra_direta",
    "aquisicoes_comprador",
  ])
  const escopo = podeAcessar(sessao.permissoes, "aquisicoes_comprador")
    ? null
    : await escopoComprasDoUsuario(sessao.usuario.id)
  const [{ disponivel, itens: todosItens }, creditos, todasSemNota] = await Promise.all([
    listarNotasAReceber(escopo),
    creditosEmAberto().catch(() => ({ disponivel: false, itens: [] })),
    listarComprasSemNota(escopo).catch(() => []),
  ])
  // Quem ajusta o pagamento da compra (a action confere o escopo do processo).
  const podeMarcar = podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao", [
    "aquisicoes_comprador",
    "aquisicoes_compra_direta",
  ])
  // Filtros (24/11/2026) nas duas listas de notas — os créditos ficam de fora:
  // busca (código, produto, fornecedor, vendedor, marketplace ou comprador,
  // sem acento), departamento e só as que esperam há DIAS_AVISO_NOTA ou mais.
  const busca = (sp.busca ?? "").trim()
  const departamentos = [
    ...new Set([...todosItens, ...todasSemNota].map((x) => x.departamentoNome).filter((v): v is string => Boolean(v))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const departamento = departamentos.includes(sp.departamento ?? "") ? sp.departamento! : ""
  const antigas = sp.antigas === "1"
  const termo = semAcento(busca.toLowerCase())
  const passa = (x: { departamentoNome: string | null; dias: number }, texto: (string | null)[]) =>
    (!departamento || x.departamentoNome === departamento) &&
    (!antigas || x.dias >= DIAS_AVISO_NOTA) &&
    (!termo || semAcento(texto.filter(Boolean).join(" ").toLowerCase()).includes(termo))
  const itens = todosItens.filter((i) => passa(i, [i.codigo, i.produto, i.marketplace, i.vendedor, i.comprador]))
  const semNota = todasSemNota.filter((c) => passa(c, [c.codigo, c.produto, c.fornecedor, c.comprador]))
  const temFiltro = Boolean(busca || departamento || antigas)
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (departamento) q.set("departamento", departamento)
  if (antigas) q.set("antigas", "1")
  const urlAtual = `/painel/compras/notas-a-receber${q.size ? `?${q}` : ""}`
  const totalCreditos = creditos.itens.reduce((s, c) => s + (c.valor ?? 0), 0)
  const atrasadas = itens.filter((i) => i.dias >= DIAS_AVISO_NOTA).length

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

      {todosItens.length + todasSemNota.length > 0 && (
        <form action="/painel/compras/notas-a-receber" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Código, produto, fornecedor ou comprador"
            aria-label="Buscar por código, produto, fornecedor, vendedor ou comprador"
            className={`${FILTRO} w-72 max-w-full`}
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
            <input type="checkbox" name="antigas" value="1" defaultChecked={antigas} className="accent-primary size-4" />
            Há {DIAS_AVISO_NOTA} dias ou mais
          </label>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Filtrar
          </Button>
          {temFiltro && (
            <>
              <Button variant="ghost" size="sm" className="h-9" asChild>
                <Link href="/painel/compras/notas-a-receber">Limpar</Link>
              </Button>
              <span className="text-muted-foreground text-xs">
                {itens.length + semNota.length} de {todosItens.length + todasSemNota.length}
              </span>
            </>
          )}
        </form>
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
            {DIAS_AVISO_NOTA} dias sem a nota, quem comprou recebe um e-mail (uma vez). Se o vendedor cancelou a
            compra, use <strong>Compra cancelada pelo vendedor</strong> na compra: ela sai daqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {temFiltro && todosItens.length > 0 ? "Nenhuma nota pendente com estes filtros." : "Nenhuma nota pendente."}
            </p>
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

      {semNota.length > 0 && (
        <Card id="sem-nota">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileClock className="size-4" />
              {semNota.length} compra{semNota.length === 1 ? "" : "s"} sem nota fiscal
            </CardTitle>
            <CardDescription>
              Compras comuns (fora do marketplace) sem nota na compra nem em nenhuma ordem dela, e sem RPA. Abra a
              compra e anexe a nota no ícone do documento fiscal. Se o vendedor cancelou, use{" "}
              <strong>Compra cancelada pelo vendedor</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {semNota.map((c) => (
                <li key={c.fornecimentoId} className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="min-w-0">
                    <p className="font-medium">{c.fornecedor}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      <Link href={`/painel/compras/${c.processoId}`} className="text-primary hover:underline">
                        {c.codigo ?? "(sem código)"}
                      </Link>
                      {c.produto ? ` · ${c.produto}` : ""}
                      {c.departamentoNome ? ` · ${c.departamentoNome}` : ""}
                      {c.comprador ? ` · ${c.comprador}` : ""}
                    </p>
                  </div>
                  <span className="text-right tabular-nums">{formatarMoeda(c.valor)}</span>
                  <Badge variant={c.dias >= DIAS_AVISO_NOTA ? "warning" : "outline"}>
                    {c.dias} dia{c.dias === 1 ? "" : "s"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {creditos.itens.length > 0 && (
        <Card id="creditos">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4" />
              Créditos com fornecedores ({creditos.itens.length} · {formatarMoeda(totalCreditos)})
            </CardTitle>
            <CardDescription>
              Compras canceladas pelo vendedor que viraram crédito, com o saldo. Ele é abatido sozinho na compra
              nova com o mesmo fornecedor; vencido, deixa de ser abatido e pode ser dado como perdido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {creditos.itens.map((c) => (
                <li key={c.fornecimentoId} className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="min-w-0">
                    <p className="font-medium">{c.fornecedor}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      <Link href={`/painel/compras/${c.processoId}`} className="text-primary hover:underline">
                        {c.codigo ?? "(sem código)"}
                      </Link>
                      {c.produto ? ` · ${c.produto}` : ""}
                      {c.data ? ` · cancelada em ${formatarData(c.data)}` : ""}
                      {c.obs ? ` · ${c.obs}` : ""}
                    </p>
                  </div>
                  <span className="grid justify-items-end gap-0.5">
                    <span className="font-medium tabular-nums">{formatarMoeda(c.valor)}</span>
                    {c.validade &&
                      (c.diasParaVencer !== null && c.diasParaVencer < 0 ? (
                        <Badge variant="destructive">venceu em {formatarData(c.validade)}</Badge>
                      ) : c.diasParaVencer !== null && c.diasParaVencer <= DIAS_AVISO_VALIDADE ? (
                        <Badge variant="warning">
                          vence {c.diasParaVencer === 0 ? "hoje" : `em ${c.diasParaVencer} dia${c.diasParaVencer === 1 ? "" : "s"}`}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">válido até {formatarData(c.validade)}</span>
                      ))}
                  </span>
                  {podeMarcar ? (
                    c.diasParaVencer !== null && c.diasParaVencer < 0 ? (
                      <DarCreditoComoPerdido processoId={c.processoId} fornecimentoId={c.fornecimentoId} />
                    ) : (
                      <MarcarCreditoUsado processoId={c.processoId} fornecimentoId={c.fornecimentoId} />
                    )
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

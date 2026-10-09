import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileCheck2, Plus, ReceiptText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Badge } from "@/components/ui/badge"
import { requirePermissao } from "@/lib/auth"
import { listarRpas, obterConfigRpa } from "@/lib/db/compras-rpa"
import { Paginacao } from "@/components/paginacao"
import { LembrarLista } from "@/components/voltar-lista"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"
import { semAcento } from "@/lib/texto"

import { ConfigRpaForm, ExcluirRpa } from "./rpa-forms"

export const metadata: Metadata = { title: "RPA — Confluir" }

const PADRAO_POR_PAGINA = 30
const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const RECIBOS = [
  { valor: "", rotulo: "Assinados e a assinar" },
  { valor: "assinado", rotulo: "Assinados" },
  { valor: "a_assinar", rotulo: "A assinar" },
] as const
const ORIGENS = [
  { valor: "", rotulo: "Todas as origens" },
  { valor: "contrato", rotulo: "De contrato" },
  { valor: "compra", rotulo: "De compra de serviço" },
  { valor: "anterior", rotulo: "Sem contrato (anterior)" },
] as const

export default async function RpaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // Área própria de Aquisição (saiu de dentro de Contratos em 09/10): quem
  // vê contratos vê todos os RPAs; quem só opera compras, os RPAs de compra.
  const permissoesCompra = ["aquisicoes_compras_edicao", "aquisicoes_comprador", "aquisicoes_compra_direta"]
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
    ...permissoesCompra,
  ])
  const veContratos = podeAcessar(sessao.permissoes, "aquisicoes_contratos", ["aquisicoes_contratos_edicao"])
  const podeEditar =
    podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao") ||
    permissoesCompra.some((p) => podeAcessar(sessao.permissoes, p))
  const sp = await searchParams
  const excluido = sp.excluido
  const busca = (sp.busca ?? "").trim()
  const recibo = RECIBOS.some((r) => r.valor === sp.recibo) ? sp.recibo! : ""
  const origem = ORIGENS.some((o) => o.valor === sp.origem) ? sp.origem! : ""
  const pag = lerPaginacao(sp, PADRAO_POR_PAGINA)

  const [{ ativo, linhas: todosOsRpas }, config] = await Promise.all([
    listarRpas(),
    obterConfigRpa(),
  ])
  const todas = veContratos ? todosOsRpas : todosOsRpas.filter((r) => r.compraId)

  const termo = semAcento(busca.toLowerCase())
  const filtradas = todas.filter((r) => {
    if (recibo === "assinado" && !r.arquivoAssinado) return false
    if (recibo === "a_assinar" && r.arquivoAssinado) return false
    if (origem === "compra" && !r.compraId) return false
    if (origem === "contrato" && (r.compraId || !r.contratoId)) return false
    if (origem === "anterior" && (r.compraId || r.contratoId)) return false
    if (termo) {
      const alvo = semAcento(
        [r.numero, r.fornecedorNome, r.contratoCodigo, r.contratoObjeto, r.compraCodigo, r.ordemCodigo]
          .filter((v) => v != null)
          .join(" ")
          .toLowerCase()
      )
      if (!alvo.includes(termo)) return false
    }
    return true
  })
  const { linhas, pagina, totalPaginas, total } = paginar(filtradas, pag)
  const temFiltro = Boolean(busca || recibo || origem)

  // Recorte atual, para o RPA voltar a ele.
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (recibo) q.set("recibo", recibo)
  if (origem) q.set("origem", origem)
  if (pagina > 1) q.set("pagina", String(pagina))
  if (pag.porPagina !== PADRAO_POR_PAGINA) q.set("porPagina", String(pag.porPagina))
  const urlAtual = `/painel/compras/rpa${q.size ? `?${q}` : ""}`

  return (
    <>
      <LembrarLista chave="rpas" url={urlAtual} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/compras">
              <ArrowLeft />
              Aquisição
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            RPA — Recibo de Pagamento a Autônomo
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Recibo do prestador autônomo (pessoa física) — de um contrato com ele ou de uma compra de serviço.
            Gera a ordem de pagamento do líquido e, assinado, vale como comprovante fiscal do
            serviço.{" "}
            {temFiltro
              ? `${total} de ${todas.length} recibo${todas.length === 1 ? "" : "s"}.`
              : `${total} recibo${total === 1 ? "" : "s"}.`}
          </p>
        </div>
        {podeEditar && (
          <Button asChild>
            <Link href="/painel/compras/rpa/novo">
              <Plus />
              Novo RPA
            </Link>
          </Button>
        )}
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não está completo — rode{" "}
            <code>supabase/compras-rpa.sql</code> e{" "}
            <code>supabase/contratos-rpa.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>RPA excluído.</AlertDescription>
        </Alert>
      )}

      <form action="/painel/compras/rpa" className="flex flex-wrap items-center gap-2">
        {pag.porPagina !== PADRAO_POR_PAGINA && (
          <input type="hidden" name="porPagina" value={pag.porPagina} />
        )}
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nº, prestador, contrato ou compra"
          aria-label="Buscar RPA"
          className={`${FILTRO} w-64 max-w-full`}
        />
        <select name="recibo" defaultValue={recibo} aria-label="Recibo" className={FILTRO}>
          {RECIBOS.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.rotulo}
            </option>
          ))}
        </select>
        <select name="origem" defaultValue={origem} aria-label="Origem" className={FILTRO}>
          {ORIGENS.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Filtrar
        </Button>
        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-9" asChild>
            <Link href="/painel/compras/rpa">Limpar</Link>
          </Button>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nº</TableHead>
              <TableHead>Prestador e contrato</TableHead>
              <TableHead className="hidden sm:table-cell">Serviço em</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Retenções
              </TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="hidden lg:table-cell">Emitido por</TableHead>
              <TableHead>Recibo</TableHead>
              {podeEditar && <TableHead className="w-10" aria-label="Ações" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={podeEditar ? 9 : 8} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <ReceiptText className="size-6" />
                    <p className="text-sm">
                      {temFiltro ? "Nenhum RPA encontrado com estes filtros." : "Nenhum RPA emitido ainda."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {linhas.map((r) => {
              const retencoes =
                (r.inss ?? 0) + (r.irrf ?? 0) + (r.iss ?? 0)
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium tabular-nums">
                    <Link
                      href={`/painel/compras/rpa/${r.id}`}
                      className="hover:underline"
                    >
                      {r.numero ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="block truncate">{r.fornecedorNome ?? "—"}</span>
                    {r.compraId ? (
                      <Link
                        href={`/painel/compras/${r.compraId}`}
                        className="text-muted-foreground block truncate text-xs tabular-nums hover:underline"
                      >
                        Compra {r.compraCodigo ?? "(sem código)"}
                      </Link>
                    ) : r.contratoId ? (
                      <Link
                        href={`/painel/compras/contratos/${r.contratoId}`}
                        className="text-muted-foreground block truncate text-xs tabular-nums hover:underline"
                      >
                        {r.contratoCodigo ?? "(sem código)"}
                        {r.contratoObjeto ? ` — ${r.contratoObjeto}` : ""}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground block text-xs">Sem contrato (anterior)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                    {r.data_servico ? formatarData(r.data_servico) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarMoeda(r.valor_bruto)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                    {formatarMoeda(retencoes)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatarMoeda(r.valor_liquido)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-40 truncate lg:table-cell">
                    {r.criadoPorNome ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.arquivoAssinado ? (
                      <span className="inline-flex items-center gap-2">
                        <Badge variant="success">Assinado</Badge>
                        <a
                          href={`/painel/compras/rpa/${r.id}/assinado`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          title="Abrir o RPA assinado"
                        >
                          <FileCheck2 className="size-3.5" />
                          Ver
                        </a>
                      </span>
                    ) : (
                      <Badge variant="outline">A assinar</Badge>
                    )}
                  </TableCell>
                  {podeEditar && (
                    <TableCell className="w-10 text-right">
                      {!r.arquivoAssinado && <ExcluirRpa id={r.id} numero={r.numero} compacto />}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <Paginacao
        total={total}
        pagina={pagina}
        totalPaginas={totalPaginas}
        porPagina={pag.porPagina}
        padrao={PADRAO_POR_PAGINA}
      />

      {podeEditar && (
        <GrupoColapsavel titulo="Tabelas de retenção (INSS, IRRF e ISS)">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Configuração das retenções
              </CardTitle>
              <CardDescription>
                Teto e alíquota do INSS, tabela progressiva do IRRF (com dedução
                por dependente) e alíquota padrão do ISS do município.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigRpaForm config={config} />
            </CardContent>
          </Card>
        </GrupoColapsavel>
      )}
    </>
  )
}

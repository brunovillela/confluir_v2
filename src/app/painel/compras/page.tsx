import type { Metadata } from "next"
import Link from "next/link"
import {
  ClipboardCheck,
  PackageOpen,
  Plus,
  ScrollText,
  ShoppingCart,
  Truck,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AquisicaoBadge, SituacaoProcessoBadge } from "@/components/compras"
import { requirePermissao } from "@/lib/auth"
import {
  ROTULOS_SITUACAO_PROCESSO,
  SITUACOES_PROCESSO,
  type SituacaoProcesso,
} from "@/lib/compras-constantes"
import { listarProcessos, resumoCompras } from "@/lib/db/compras"
import { resumoContratos } from "@/lib/db/contratos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Compras — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  situacao?: string
  aquisicao?: string
  pagina?: string
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_avaliacoes",
    "aquisicoes_recebimentos",
    "aquisicoes_fornecedores",
    "aquisicoes_contratos",
  ])
  const p = sessao.permissoes

  const brutos = await searchParams
  const situacao = (SITUACOES_PROCESSO as readonly string[]).includes(
    brutos.situacao ?? ""
  )
    ? (brutos.situacao as SituacaoProcesso)
    : "todas"
  const aquisicao =
    brutos.aquisicao === "direta" || brutos.aquisicao === "via_compras"
      ? brutos.aquisicao
      : "todas"
  const busca = (brutos.busca ?? "").trim()
  const pagina = Number(brutos.pagina) > 0 ? Number(brutos.pagina) : 1

  const [resumo, lista, resumoContr] = await Promise.all([
    resumoCompras(),
    listarProcessos({ busca, situacao, aquisicao, pagina }),
    resumoContratos(),
  ])

  const podeCriar = podeAcessar(p, "aquisicoes_compras", [
    "aquisicoes_compras_edicao",
  ])
  const veAvaliacoes = podeAcessar(p, "aquisicoes_avaliacoes")
  const veRecebimentos = podeAcessar(p, "aquisicoes_recebimentos", [
    "aquisicoes_compras_edicao",
  ])
  const veFornecedores = podeAcessar(p, "aquisicoes_fornecedores", [
    "aquisicoes_compras_edicao",
  ])
  const veContratos = podeAcessar(p, "aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ])

  const filtrosQuery = (mudancas: Record<string, string>) => {
    const q = new URLSearchParams()
    const estado: Record<string, string> = {
      busca,
      situacao,
      aquisicao,
      ...mudancas,
    }
    for (const [chave, valor] of Object.entries(estado)) {
      if (valor && valor !== "todas") q.set(chave, valor)
    }
    const s = q.toString()
    return s ? `?${s}` : ""
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Processos de aquisição: solicitação, cotação, compra, cobrança e
            recebimento
          </p>
        </div>
        {podeCriar && (
          <Button asChild>
            <Link href="/painel/compras/nova">
              <Plus />
              Nova compra
            </Link>
          </Button>
        )}
      </div>

      {(veAvaliacoes || veRecebimentos || veFornecedores || veContratos) && (
        <div className="flex flex-wrap gap-2">
          {veAvaliacoes && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/compras/avaliacoes">
                <ClipboardCheck />
                Avaliações
                {resumo.ordensEmAutorizacao > 0 && (
                  <Badge variant="warning">{resumo.ordensEmAutorizacao}</Badge>
                )}
              </Link>
            </Button>
          )}
          {veRecebimentos && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/compras/recebimentos">
                <PackageOpen />
                Recebimentos
                {(resumo.aReceber ?? 0) > 0 && (
                  <Badge variant="info">{resumo.aReceber}</Badge>
                )}
              </Link>
            </Button>
          )}
          {veFornecedores && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/compras/fornecedores">
                <Truck />
                Fornecedores
              </Link>
            </Button>
          )}
          {veContratos && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/compras/contratos">
                <ScrollText />
                Contratos
                {resumoContr.vencendo > 0 && (
                  <Badge variant="warning">{resumoContr.vencendo}</Badge>
                )}
              </Link>
            </Button>
          )}
        </div>
      )}

      {resumo.aReceber === null && (
        <Alert variant="warning">
          <AlertDescription>
            Compras ainda não configuradas por completo — rode{" "}
            <code>supabase/compras.sql</code> no SQL Editor do Supabase para
            habilitar cotações, fornecimentos e recebimentos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo
          rotulo="Em cotação"
          valor={resumo.emCotacao}
          href={filtrosQuery({ situacao: "em_cotacao", pagina: "" })}
        />
        <CardResumo
          rotulo="Cotadas (aguardando compra)"
          valor={resumo.aguardandoCompra}
          href={filtrosQuery({ situacao: "cotada", pagina: "" })}
        />
        <CardResumo
          rotulo="Ordens em autorização"
          valor={resumo.ordensEmAutorizacao}
          href={veAvaliacoes ? "/painel/compras/avaliacoes" : undefined}
        />
        <CardResumo
          rotulo="Fornecimentos a receber"
          valor={resumo.aReceber ?? "—"}
          href={veRecebimentos ? "/painel/compras/recebimentos" : undefined}
        />
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/painel/compras">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Código ou produto/serviço"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
          <option value="todas">Todas as situações</option>
          {SITUACOES_PROCESSO.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO_PROCESSO[s]}
            </option>
          ))}
        </select>
        <select
          name="aquisicao"
          defaultValue={aquisicao}
          className={SELECT_FILTRO}
        >
          <option value="todas">Direta e via Compras</option>
          <option value="direta">Aquisição direta</option>
          <option value="via_compras">Via Compras</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {lista.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ShoppingCart className="mx-auto mb-2 size-5" />
              Nenhum processo encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto ou serviço</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Aquisição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        href={`/painel/compras/${l.id}`}
                        className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                      >
                        {l.codigo ?? "(sem código)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <span className="line-clamp-2">
                        {l.produto ?? (
                          <span className="text-muted-foreground">
                            (migração parcial — sem descrição)
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{l.departamentoNome ?? "—"}</TableCell>
                    <TableCell>
                      <AquisicaoBadge direta={l.aquisicao_direta} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(l.compra_valor)}
                    </TableCell>
                    <TableCell>
                      <SituacaoProcessoBadge situacao={l.situacao} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(l.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lista.totalPaginas > 1 && (
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="tabular-nums">
                Página {lista.pagina} de {lista.totalPaginas} ·{" "}
                {lista.total.toLocaleString("pt-BR")} processos
              </span>
              <div className="flex gap-2">
                {lista.pagina > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={filtrosQuery({ pagina: String(lista.pagina - 1) })}
                    >
                      Anterior
                    </Link>
                  </Button>
                )}
                {lista.pagina < lista.totalPaginas && (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={filtrosQuery({ pagina: String(lista.pagina + 1) })}
                    >
                      Próxima
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({
  rotulo,
  valor,
  href,
}: {
  rotulo: string
  valor: number | string
  href?: string
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </p>
    </CardContent>
  )
  if (!href) return <Card>{conteudo}</Card>
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 transition-colors">
        {conteudo}
      </Card>
    </Link>
  )
}

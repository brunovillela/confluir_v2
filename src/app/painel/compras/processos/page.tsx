import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, ShoppingCart } from "lucide-react"

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
import { ColunaOrdenavel, linkDeOrdem } from "@/components/coluna-ordenavel"
import { EmpresaCombobox } from "@/components/empresa-combobox"
import { ExportarXlsx } from "@/components/exportar-xlsx"
import { Paginacao } from "@/components/paginacao"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import {
  ROTULOS_SITUACAO_PROCESSO,
  SITUACOES_PROCESSO,
  type SituacaoProcesso,
} from "@/lib/compras-constantes"
import {
  listarDepartamentos,
  listarFornecedores,
  listarProcessos,
  ORDENS_PROCESSOS,
  type OrdemProcessos,
} from "@/lib/db/compras"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Processos de compra — Confluir" }

const PADRAO_POR_PAGINA = 30
const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  situacao?: string
  aquisicao?: string
  fornecedor?: string
  meus?: string
  ordem?: string
  dir?: string
  pagina?: string
  porPagina?: string
}

/**
 * Lista dos processos de compra que a pessoa alcança (departamentos de
 * Aquisição + as que ela registrou), com filtros, ordenação e paginação.
 */
export default async function ProcessosDeCompraPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_compra_direta",
    "aquisicoes_avaliacoes",
    "aquisicoes_recebimentos",
    "aquisicoes_fornecedores",
    "aquisicoes_contratos",
  ])
  const sp = await searchParams
  const situacao = (SITUACOES_PROCESSO as readonly string[]).includes(sp.situacao ?? "")
    ? (sp.situacao as SituacaoProcesso)
    : "todas"
  const aquisicao = sp.aquisicao === "direta" || sp.aquisicao === "via_compras" ? sp.aquisicao : "todas"
  const busca = (sp.busca ?? "").trim()
  const fornecedor = /^[0-9a-f-]{36}$/i.test(sp.fornecedor ?? "") ? sp.fornecedor! : ""
  const meus = sp.meus === "1"
  const ordem: OrdemProcessos = (ORDENS_PROCESSOS as readonly string[]).includes(sp.ordem ?? "")
    ? (sp.ordem as OrdemProcessos)
    : "registro"
  const dir = sp.dir === "asc" ? "asc" : "desc"
  const pag = lerPaginacao(sp, PADRAO_POR_PAGINA)

  const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
  const [lista, fornecedores, departamentos] = await Promise.all([
    listarProcessos({
      busca,
      situacao,
      aquisicao,
      fornecedorId: fornecedor || undefined,
      criadoPor: meus ? sessao.usuario.id : undefined,
      ordem,
      dir,
      pagina: pag.pagina,
      porPagina: pag.porPagina,
      escopo,
    }),
    listarFornecedores(),
    escopo.todos ? Promise.resolve([]) : listarDepartamentos(),
  ])
  const nomesDosDepartamentos = departamentos
    .filter((d) => escopo.departamentoIds.includes(d.id))
    .map((d) => d.nome)
  const podeCriar = podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])

  const filtrosAtivos = {
    busca,
    situacao: situacao === "todas" ? "" : situacao,
    aquisicao: aquisicao === "todas" ? "" : aquisicao,
    fornecedor,
    meus: meus ? "1" : "",
    porPagina: sp.porPagina,
  }
  const hrefOrdem = linkDeOrdem("/painel/compras/processos", filtrosAtivos, ordem, dir, ["pagina"])
  const temFiltro = Boolean(busca || situacao !== "todas" || aquisicao !== "todas" || fornecedor || meus)

  // Endereço do recorte atual, para o processo voltar a ele.
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filtrosAtivos)) if (v) q.set(k, v)
  if (ordem !== "registro") q.set("ordem", ordem)
  if (dir !== "desc") q.set("dir", dir)
  if (pag.pagina > 1) q.set("pagina", String(pag.pagina))
  const urlAtual = `/painel/compras/processos${q.size ? `?${q}` : ""}`

  return (
    <>
      <LembrarLista chave="processos-compra" url={urlAtual} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Processos de compra</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {escopo.todos ? (
                "Todas as compras da entidade: solicitação, cotação, compra, cobrança e recebimento"
              ) : (
                <>
                  Compras de <strong>{nomesDosDepartamentos.join(", ") || "seus departamentos"}</strong> e as
                  que você registrou
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportarXlsx href="/painel/compras/exportar" />
            {podeCriar && (
              <Button asChild>
                <Link href="/painel/compras/nova">
                  <Plus />
                  Nova compra
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/painel/compras/processos">
        {ordem !== "registro" && <input type="hidden" name="ordem" value={ordem} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        {sp.porPagina && <input type="hidden" name="porPagina" value={sp.porPagina} />}
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Código ou produto/serviço"
          aria-label="Buscar por código ou produto/serviço"
          className={`${SELECT_FILTRO} w-60 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} aria-label="Situação" className={SELECT_FILTRO}>
          <option value="todas">Todas as situações</option>
          {SITUACOES_PROCESSO.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO_PROCESSO[s]}
            </option>
          ))}
        </select>
        <select name="aquisicao" defaultValue={aquisicao} aria-label="Modalidade" className={SELECT_FILTRO}>
          <option value="todas">Direta e via Aquisição</option>
          <option value="direta">Aquisição direta</option>
          <option value="via_compras">Via Aquisição</option>
        </select>
        <div className="w-80 max-w-full">
          <EmpresaCombobox
            name="fornecedor"
            defaultId={fornecedor || undefined}
            empresas={fornecedores.map((f) => ({
              id: f.id,
              nome: f.nome,
              cnpj_cpf: f.cnpj_cpf,
              razao: f.nome_razao ?? null,
              bloqueado: f.bloqueado,
            }))}
          />
        </div>
        <label className="border-input flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
          <input type="checkbox" name="meus" value="1" defaultChecked={meus} className="accent-primary size-4" />
          Criadas por mim
        </label>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Filtrar
        </Button>
        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-9" asChild>
            <Link href="/painel/compras/processos">Limpar</Link>
          </Button>
        )}
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
                  <ColunaOrdenavel chave="codigo" rotulo="Código" ordem={ordem} dir={dir} href={hrefOrdem} />
                  <ColunaOrdenavel chave="produto" rotulo="Produto ou serviço" ordem={ordem} dir={dir} href={hrefOrdem} />
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Aquisição</TableHead>
                  <ColunaOrdenavel
                    chave="valor"
                    rotulo="Valor"
                    ordem={ordem}
                    dir={dir}
                    href={hrefOrdem}
                    className="text-right"
                  />
                  <TableHead>Situação</TableHead>
                  <ColunaOrdenavel chave="compra" rotulo="Compra" ordem={ordem} dir={dir} href={hrefOrdem} />
                  <ColunaOrdenavel chave="registro" rotulo="Registro" ordem={ordem} dir={dir} href={hrefOrdem} />
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
                    <TableCell className="max-w-72 min-w-48">
                      <span className="line-clamp-2 whitespace-normal">
                        {l.produto ?? (
                          <span className="text-muted-foreground">(migração parcial — sem descrição)</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <span className="line-clamp-2 whitespace-normal">
                        {l.fornecedorNome ?? <span className="text-muted-foreground">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-44">
                      <span className="line-clamp-2 whitespace-normal">{l.departamentoNome ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <AquisicaoBadge direta={l.aquisicao_direta} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(l.compra_valor)}
                    </TableCell>
                    <TableCell>
                      <SituacaoProcessoBadge situacao={l.situacao} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(l.compra_data)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(l.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4">
            <Paginacao
              total={lista.total}
              pagina={lista.pagina}
              totalPaginas={lista.totalPaginas}
              porPagina={pag.porPagina}
              padrao={PADRAO_POR_PAGINA}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

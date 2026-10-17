import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Table2 } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { SituacaoReembolsoBadge } from "@/components/reembolsos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { listarReembolsos, type ReembolsoAct } from "@/lib/db/reembolsos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaSolicitacoesReembolso } from "./solicitacoes-lista"

export const metadata: Metadata = { title: "Reembolsos do ACT — Confluir" }

const ORDENS = ["nome", "quantidade", "valor", "aguardando", "ultimo"] as const
const anoDe = (r: ReembolsoAct) => (r.created_at ?? "").slice(0, 4)
/** O que conta como reembolsado: aprovado (a pagar no contracheque) ou pago. */
const reembolsado = (r: ReembolsoAct) => r.situacao === "aprovado" || r.situacao === "pago"

/**
 * Reembolsos do ACT — nível 1 do padrão das áreas do Pessoal: a fila de
 * avaliação no topo, indicadores e as abas Funcionários (inicial) e Solicitações.
 */
export default async function ReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_reembolsos"])
  const sp = await searchParams
  const aba = sp.aba === "solicitacoes" ? "solicitacoes" : "funcionarios"
  const [{ disponivel, reembolsos }, funcionarios] = await Promise.all([listarReembolsos(), funcionariosDaArea()])

  const anoAtual = new Date().getFullYear().toString()
  const aguardando = reembolsos.filter((r) => r.situacao === "aguardando")
  const aPagar = reembolsos.filter((r) => r.situacao === "aprovado")
  const pagosAno = reembolsos.filter((r) => r.situacao === "pago" && anoDe(r) === anoAtual)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reembolsos do ACT</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Benefícios do acordo coletivo — o pagamento acontece no contracheque
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/reembolsos/tipos">
              <Table2 />
              Tipos do ACT
            </Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            Os reembolsos ainda não estão configurados no banco — rode <code>supabase/reembolsos-act.sql</code> no SQL
            Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Aguardando avaliação" valor={String(aguardando.length)} href="#fila" />
        <TileIndicador
          rotulo="Aprovados a pagar"
          valor={String(aPagar.length)}
          nota={aPagar.length ? formatarMoeda(aPagar.reduce((s, r) => s + (r.valor_aprovado ?? 0), 0)) : "nada a lançar no contracheque"}
          href="/painel/pessoal/reembolsos?aba=solicitacoes&situacao=aprovado"
        />
        <TileIndicador
          rotulo={`Pagos em ${anoAtual}`}
          valor={formatarMoeda(pagosAno.reduce((s, r) => s + (r.valor_aprovado ?? 0), 0))}
          nota={`${pagosAno.length} reembolso(s)`}
        />
        <TileIndicador
          rotulo={`Funcionários atendidos em ${anoAtual}`}
          valor={String(new Set(reembolsos.filter((r) => reembolsado(r) && anoDe(r) === anoAtual).map((r) => r.funcionario_id)).size)}
        />
      </section>

      {aguardando.length > 0 && (
        <Card id="fila" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">
              Aguardando avaliação
              <span className="text-muted-foreground ml-2 text-sm font-normal">{aguardando.length}</span>
            </CardTitle>
            <CardDescription>Do pedido mais antigo ao mais recente.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[...aguardando].reverse().map((r) => (
              <Link
                key={r.id}
                href={`/painel/pessoal/reembolsos/${r.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{r.funcionarioNome ?? "(sem nome)"}</span>
                  <span className="text-muted-foreground"> · {r.tipoNome ?? "—"} · pedido em {formatarData(r.created_at)}</span>
                </span>
                <span className="tabular-nums">{formatarMoeda(r.valor_solicitado)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <AbasLink
        rotulo="Visões dos reembolsos"
        abas={[
          { href: "/painel/pessoal/reembolsos", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/reembolsos?aba=solicitacoes", rotulo: "Solicitações", ativo: aba === "solicitacoes", contador: reembolsos.length },
        ]}
      />

      {aba === "solicitacoes" ? (
        <ListaSolicitacoesReembolso brutos={sp} />
      ) : (
        <AbaFuncionarios sp={sp} reembolsos={reembolsos} funcionarios={funcionarios} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  reembolsos,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  reembolsos: ReembolsoAct[]
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  const anos = [...new Set(reembolsos.map(anoDe).filter(Boolean))].sort().reverse()
  const anoAtual = new Date().getFullYear().toString()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos.includes(anoAtual) ? anoAtual : anos[0]
  type Resumo = { quantidade: number; valor: number; aguardando: number; ultimo: ReembolsoAct | null }
  const resumo = new Map<string, Resumo>()
  // Lista vem do mais recente ao mais antigo: o primeiro de cada um é o último pedido.
  for (const r of reembolsos.filter((x) => anoDe(x) === ano)) {
    if (!r.funcionario_id) continue
    const s = resumo.get(r.funcionario_id) ?? { quantidade: 0, valor: 0, aguardando: 0, ultimo: null }
    s.quantidade++
    if (reembolsado(r)) s.valor += r.valor_aprovado ?? 0
    if (r.situacao === "aguardando") s.aguardando++
    s.ultimo ??= r
    resumo.set(r.funcionario_id, s)
  }

  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const r = resumo.get(l.usuarioId)
    switch (f.ordem) {
      case "quantidade":
        return r?.quantidade
      case "valor":
        return r?.valor
      case "aguardando":
        return r?.aguardando
      case "ultimo":
        return r?.ultimo?.created_at
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { ano: sp.ano })
  const urlAtual = `/painel/pessoal/reembolsos?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="reembolsos-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios
        filtros={f}
        departamentos={departamentosDaLista(funcionarios)}
        extras={
          anos.length > 0 && (
            <SelectNativo name="ano" defaultValue={ano} aria-label="Ano" className="h-9 w-auto">
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectNativo>
          )
        }
      />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/reembolsos", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/reembolsos/funcionario/${l.usuarioId}${ano ? `?ano=${ano}` : ""}`}
        colunas={[
          {
            chave: "quantidade",
            rotulo: `Pedidos ${ano ?? ""}`.trim(),
            className: "text-right tabular-nums",
            valor: (l) => resumo.get(l.usuarioId)?.quantidade ?? "—",
          },
          {
            chave: "valor",
            rotulo: "Reembolsado",
            className: "text-right tabular-nums",
            valor: (l) => {
              const v = resumo.get(l.usuarioId)?.valor
              return v ? formatarMoeda(v) : "—"
            },
          },
          {
            chave: "aguardando",
            rotulo: "Aguardando",
            className: "hidden text-right md:table-cell",
            valor: (l) => {
              const n = resumo.get(l.usuarioId)?.aguardando ?? 0
              return n ? <span className="text-warning-fg font-medium tabular-nums">{n}</span> : <span className="text-muted-foreground">—</span>
            },
          },
          {
            chave: "ultimo",
            rotulo: "Último pedido",
            className: "hidden lg:table-cell",
            valor: (l) => {
              const u = resumo.get(l.usuarioId)?.ultimo
              if (!u) return <span className="text-muted-foreground">—</span>
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Link href={`/painel/pessoal/reembolsos/${u.id}`} className="hover:underline">
                    {u.tipoNome ?? "Reembolso"}
                  </Link>
                  <SituacaoReembolsoBadge situacao={u.situacao} />
                </span>
              )
            },
          },
        ]}
      />
    </>
  )
}

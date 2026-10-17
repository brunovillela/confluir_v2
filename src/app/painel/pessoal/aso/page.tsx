import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { listarAsos, type Aso } from "@/lib/db/pessoal-saude"
import { ROTULO_SITUACAO_ASO as ROTULO, situacaoAso, VARIANTE_SITUACAO_ASO as VARIANTE } from "@/lib/aso-situacao"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaRegistrosAso } from "./registros-lista"

export const metadata: Metadata = { title: "ASOs — Confluir" }

const ORDENS = ["nome", "ultimo", "vencimento", "quantidade"] as const

/**
 * ASOs — nível 1 do padrão das áreas do Pessoal: a situação do exame de cada
 * funcionário (indicadores e aba Funcionários, a inicial) e os Registros.
 */
export default async function AsoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_aso"])
  const sp = await searchParams
  const aba = sp.aba === "registros" ? "registros" : "funcionarios"
  const [asos, funcionarios] = await Promise.all([listarAsos(), funcionariosDaArea()])
  const hoje = hojeSP()

  // O ASO realizado mais recente de cada pessoa.
  const ultimoDe = new Map<string, Aso>()
  for (const a of asos) {
    if (!a.funcionario_id || a.realizado === false) continue
    const atual = ultimoDe.get(a.funcionario_id)
    if (!atual || (a.data ?? "") > (atual.data ?? "")) ultimoDe.set(a.funcionario_id, a)
  }
  const ativos = funcionarios.filter((f) => f.ativo)
  const conta = (s: ReturnType<typeof situacaoAso>) => ativos.filter((f) => situacaoAso(ultimoDe.get(f.usuarioId), hoje) === s).length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">ASOs — Atestados de Saúde Ocupacional</h1>
        <p className="text-muted-foreground mt-1 text-xs">Exames ocupacionais (NR-7) e a vigência de cada funcionário</p>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>ASO salvo.</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Em dia" valor={`${conta("em_dia")} de ${ativos.length}`} nota="funcionários ativos" />
        <TileIndicador rotulo="Vencem em 90 dias" valor={String(conta("vencendo"))} href="/painel/pessoal/aso?situacaoAso=vencendo" />
        <TileIndicador rotulo="Vencidos" valor={String(conta("vencido"))} href="/painel/pessoal/aso?situacaoAso=vencido" />
        <TileIndicador rotulo="Sem ASO" valor={String(conta("sem"))} nota="ativos sem exame realizado" href="/painel/pessoal/aso?situacaoAso=sem" />
      </section>

      <AbasLink
        rotulo="Visões dos ASOs"
        abas={[
          { href: "/painel/pessoal/aso", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/aso?aba=registros", rotulo: "Registros", ativo: aba === "registros", contador: asos.length },
        ]}
      />

      {aba === "registros" ? (
        <ListaRegistrosAso brutos={sp} />
      ) : (
        <AbaFuncionarios sp={sp} asos={asos} ultimoDe={ultimoDe} funcionarios={funcionarios} hoje={hoje} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  asos,
  ultimoDe,
  funcionarios,
  hoje,
}: {
  sp: Record<string, string | undefined>
  asos: Aso[]
  ultimoDe: Map<string, Aso>
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
  hoje: string
}) {
  const quantos = new Map<string, number>()
  for (const a of asos) if (a.funcionario_id) quantos.set(a.funcionario_id, (quantos.get(a.funcionario_id) ?? 0) + 1)
  const filtroSit = ["sem", "vencido", "vencendo", "em_dia"].includes(sp.situacaoAso ?? "") ? sp.situacaoAso : ""

  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const u = ultimoDe.get(l.usuarioId)
    switch (f.ordem) {
      case "ultimo":
        return u?.data
      case "vencimento":
        return u?.vencimento
      case "quantidade":
        return quantos.get(l.usuarioId)
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(
    filtrarFuncionarios(funcionarios, f).filter((l) => !filtroSit || situacaoAso(ultimoDe.get(l.usuarioId), hoje) === filtroSit),
    f.dir,
    valor
  )
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { situacaoAso: filtroSit || undefined })
  const urlAtual = `/painel/pessoal/aso?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="aso-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios
        filtros={f}
        departamentos={departamentosDaLista(funcionarios)}
        extras={
          <SelectNativo name="situacaoAso" defaultValue={filtroSit} aria-label="Situação do ASO" className="h-9 w-auto">
            <option value="">Todas as situações do ASO</option>
            <option value="vencido">Vencido</option>
            <option value="vencendo">Vence em 90 dias</option>
            <option value="em_dia">Em dia</option>
            <option value="sem">Sem ASO</option>
          </SelectNativo>
        }
      />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/aso", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/aso/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "ultimo",
            rotulo: "Último ASO",
            valor: (l) => {
              const u = ultimoDe.get(l.usuarioId)
              return u ? (
                <Link href={`/painel/pessoal/aso/${u.id}`} className="hover:underline">
                  {formatarData(u.data)} · {u.tipo ?? "ASO"}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            },
          },
          {
            chave: "vencimento",
            rotulo: "Vencimento",
            className: "whitespace-nowrap",
            valor: (l) => {
              const u = ultimoDe.get(l.usuarioId)
              const s = situacaoAso(u, hoje)
              return (
                <span className="inline-flex items-center gap-1.5">
                  {u?.vencimento ? formatarData(u.vencimento) : ""}
                  <Badge variant={VARIANTE[s]}>{ROTULO[s]}</Badge>
                </span>
              )
            },
          },
          {
            chave: "quantidade",
            rotulo: "Exames",
            className: "hidden text-right tabular-nums md:table-cell",
            valor: (l) => quantos.get(l.usuarioId) ?? "—",
          },
        ]}
      />
    </>
  )
}

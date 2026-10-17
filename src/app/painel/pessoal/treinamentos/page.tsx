import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { carregarBaseTreinamentos, type Matricula } from "@/lib/db/treinamentos-area"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { CatalogoTreinamentos } from "./catalogo"

export const metadata: Metadata = { title: "Treinamentos — Confluir" }

const ORDENS = ["nome", "concluidos", "vencidos", "pendentes", "ultimo"] as const

/**
 * Treinamentos — nível 1 do padrão das áreas do Pessoal: indicadores e as
 * abas Funcionários (inicial: trilha de cada um) e Catálogo.
 */
export default async function TreinamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const aba = sp.aba === "catalogo" ? "catalogo" : "funcionarios"
  const [{ treinamentos, matriculas, matrizDe, usaMatriz }, funcionarios] = await Promise.all([
    carregarBaseTreinamentos(),
    funcionariosDaArea(),
  ])
  const ativos = new Set(funcionarios.filter((f) => f.ativo).map((f) => f.usuarioId))
  // Certificado vencido conta só se não houver outro válido do mesmo treinamento.
  const vencidosDe = (id: string) => {
    const daPessoa = matriculas.filter((m) => m.alunoId === id)
    return daPessoa.filter((m) => m.vencido && !daPessoa.some((o) => o.treinamentoId === m.treinamentoId && !o.vencido)).length
  }
  const comVencido = [...ativos].filter((id) => vencidosDe(id) > 0).length
  const pendentes = [...ativos].reduce((s, id) => s + (matrizDe.get(id)?.pendentes ?? 0), 0)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Treinamentos</h1>
        <p className="text-muted-foreground mt-1 text-xs">Catálogo, alunos, certificados e a trilha de cada funcionário</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Treinamentos no catálogo" valor={String(treinamentos.length)} href="/painel/pessoal/treinamentos?aba=catalogo" />
        <TileIndicador rotulo="Matrículas" valor={String(matriculas.length)} nota="em todo o histórico" />
        <TileIndicador
          rotulo="Ativos com certificado vencido"
          valor={String(comVencido)}
          href="/painel/pessoal/treinamentos?ordem=vencidos&dir=desc"
        />
        <TileIndicador
          rotulo="Exigidos pendentes"
          valor={usaMatriz ? String(pendentes) : "—"}
          nota={usaMatriz ? "pela matriz de Atribuições e SST" : "sem exigências na matriz de SST"}
          href={usaMatriz ? "/painel/pessoal/treinamentos?ordem=pendentes&dir=desc" : undefined}
        />
      </section>

      <AbasLink
        rotulo="Visões dos treinamentos"
        abas={[
          { href: "/painel/pessoal/treinamentos", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/treinamentos?aba=catalogo", rotulo: "Catálogo", ativo: aba === "catalogo", contador: treinamentos.length },
        ]}
      />

      {aba === "catalogo" ? (
        <CatalogoTreinamentos brutos={sp} />
      ) : (
        <AbaFuncionarios
          sp={sp}
          funcionarios={funcionarios}
          matriculas={matriculas}
          vencidosDe={vencidosDe}
          pendentesDe={(id) => matrizDe.get(id)?.pendentes ?? 0}
          usaMatriz={usaMatriz}
        />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  funcionarios,
  matriculas,
  vencidosDe,
  pendentesDe,
  usaMatriz,
}: {
  sp: Record<string, string | undefined>
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
  matriculas: Matricula[]
  vencidosDe: (id: string) => number
  pendentesDe: (id: string) => number
  usaMatriz: boolean
}) {
  const porPessoa = new Map<string, Matricula[]>()
  for (const m of matriculas) porPessoa.set(m.alunoId, [...(porPessoa.get(m.alunoId) ?? []), m])
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    switch (f.ordem) {
      case "concluidos":
        return porPessoa.get(l.usuarioId)?.length
      case "vencidos":
        return vencidosDe(l.usuarioId)
      case "pendentes":
        return pendentesDe(l.usuarioId)
      case "ultimo":
        return porPessoa.get(l.usuarioId)?.[0]?.inicio
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f)
  const urlAtual = `/painel/pessoal/treinamentos?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="treinamentos-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios filtros={f} departamentos={departamentosDaLista(funcionarios)} />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/treinamentos", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/treinamentos/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "concluidos",
            rotulo: "Matrículas",
            className: "text-right tabular-nums",
            valor: (l) => porPessoa.get(l.usuarioId)?.length ?? "—",
          },
          {
            chave: "vencidos",
            rotulo: "Vencidos",
            className: "text-right",
            valor: (l) => {
              const n = vencidosDe(l.usuarioId)
              return n ? <Badge variant="warning">{n}</Badge> : <span className="text-muted-foreground">—</span>
            },
          },
          ...(usaMatriz
            ? [
                {
                  chave: "pendentes",
                  rotulo: "Exigidos pendentes",
                  className: "hidden text-right md:table-cell",
                  valor: (l: (typeof funcionarios)[number]) => {
                    const n = pendentesDe(l.usuarioId)
                    return n ? <Badge variant="destructive">{n}</Badge> : <span className="text-muted-foreground">—</span>
                  },
                },
              ]
            : []),
          {
            chave: "ultimo",
            rotulo: "Último",
            className: "hidden lg:table-cell",
            valor: (l) => {
              const u = porPessoa.get(l.usuarioId)?.[0]
              return u ? (
                <Link href={`/painel/pessoal/treinamentos/${u.treinamentoId}`} className="hover:underline">
                  {u.treinamento} · {formatarData(u.inicio)}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            },
          },
        ]}
      />
    </>
  )
}

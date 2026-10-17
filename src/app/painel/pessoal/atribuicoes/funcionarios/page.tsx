import type { Metadata } from "next"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { RiscoBadge } from "@/components/pessoal/risco-badge"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Badge } from "@/components/ui/badge"
import { LembrarLista, VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { matrizTreinamento, relatorioDeFuncionarios, type LinhaMatriz, type RelatorioPessoa } from "@/lib/db/pessoal-sst"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

export const metadata: Metadata = { title: "SST por funcionário — Confluir" }

const ORDENS = ["nome", "funcao", "atividades", "ocupacao", "risco", "pendentes"] as const

/** Pior risco residual (o que sobra depois das medidas) — senão, o pior bruto. */
const piorRisco = (r: RelatorioPessoa | undefined) => {
  const niveis = (r?.riscos ?? []).map((x) => x.piorResidual ?? x.pior).filter((n): n is NonNullable<typeof n> => Boolean(n))
  return niveis.sort((a, b) => b.valor - a.valor)[0] ?? null
}

/**
 * Atribuições e SST por funcionário — nível 1 do padrão das áreas do Pessoal
 * (o hub de Atribuições continua com o catálogo: atividades, funções, GHE…).
 */
export default async function SstFuncionariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const funcionarios = await funcionariosDaArea()
  const [relatorio, matriz] = await Promise.all([
    relatorioDeFuncionarios(funcionarios.map((f) => f.usuarioId)).catch(() => [] as RelatorioPessoa[]),
    matrizTreinamento().catch(() => [] as LinhaMatriz[]),
  ])
  const rel = new Map(relatorio.map((r) => [r.funcionarioId, r]))
  const pend = new Map(matriz.map((m) => [m.funcionarioId, m.pendentes]))
  const ativos = funcionarios.filter((f) => f.ativo)
  const semFuncao = ativos.filter((f) => !rel.get(f.usuarioId)?.funcaoNome).length
  const altos = ativos.filter((f) => (piorRisco(rel.get(f.usuarioId))?.valor ?? 0) >= 10).length
  const sobrecarregados = ativos.filter((f) => (rel.get(f.usuarioId)?.ocupacaoPct ?? 0) > 100).length

  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const r = rel.get(l.usuarioId)
    switch (f.ordem) {
      case "funcao":
        return r?.funcaoNome
      case "atividades":
        return r?.atividades.length
      case "ocupacao":
        return r?.ocupacaoPct
      case "risco":
        return piorRisco(r)?.valor
      case "pendentes":
        return pend.get(l.usuarioId)
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f)
  const urlAtual = `/painel/pessoal/atribuicoes/funcionarios?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <VoltarLista chave="sst-hub" base="/painel/pessoal/atribuicoes" rotulo="Atribuições e SST" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SST por funcionário</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Função, atividades, ocupação da jornada, pior risco e treinamentos exigidos de cada pessoa
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Ativos sem função" valor={String(semFuncao)} nota={`de ${ativos.length}`} href="/painel/pessoal/atribuicoes/funcionarios?ordem=funcao&dir=asc" />
        <TileIndicador rotulo="Risco substancial ou pior" valor={String(altos)} nota="pior risco residual ≥ 10" href="/painel/pessoal/atribuicoes/funcionarios?ordem=risco&dir=desc" />
        <TileIndicador rotulo="Ocupação acima de 100%" valor={String(sobrecarregados)} nota="atividades além da jornada" href="/painel/pessoal/atribuicoes/funcionarios?ordem=ocupacao&dir=desc" />
        <TileIndicador
          rotulo="Treinamentos exigidos pendentes"
          valor={String(ativos.reduce((s, x) => s + (pend.get(x.usuarioId) ?? 0), 0))}
          href="/painel/pessoal/atribuicoes/funcionarios?ordem=pendentes&dir=desc"
        />
      </section>

      <LembrarLista chave="sst-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios filtros={f} departamentos={departamentosDaLista(funcionarios)} />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/atribuicoes/funcionarios", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/atribuicoes/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "funcao",
            rotulo: "Função",
            valor: (l) => rel.get(l.usuarioId)?.funcaoNome ?? <span className="text-muted-foreground">sem função</span>,
          },
          {
            chave: "atividades",
            rotulo: "Atividades",
            className: "hidden text-right tabular-nums md:table-cell",
            valor: (l) => rel.get(l.usuarioId)?.atividades.length || "—",
          },
          {
            chave: "ocupacao",
            rotulo: "Ocupação",
            className: "text-right tabular-nums",
            valor: (l) => {
              const p = rel.get(l.usuarioId)?.ocupacaoPct
              return p == null ? "—" : <span className={p > 100 ? "text-destructive font-medium" : ""}>{Math.round(p)}%</span>
            },
          },
          { chave: "risco", rotulo: "Pior risco", valor: (l) => <RiscoBadge nivel={piorRisco(rel.get(l.usuarioId))} /> },
          {
            chave: "pendentes",
            rotulo: "Treinos pendentes",
            className: "hidden text-right lg:table-cell",
            valor: (l) => {
              const n = pend.get(l.usuarioId) ?? 0
              return n ? <Badge variant="destructive">{n}</Badge> : <span className="text-muted-foreground">—</span>
            },
          },
        ]}
      />
    </>
  )
}

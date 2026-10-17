import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Percent, Plus, Table2 } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { avancaAte, carregarCarreira } from "@/lib/db/carreira-area"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaLancamentosNiveis } from "./lancamentos-lista"

export const metadata: Metadata = { title: "Níveis salariais — Confluir" }

const ORDENS = ["nome", "nivel", "salario", "desde", "proximo"] as const

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Níveis salariais — nível 1 do padrão das áreas do Pessoal: indicadores e as
 * abas Funcionários (inicial: o degrau atual de cada um) e Lançamentos. O
 * nome leva à Carreira do funcionário (nível 2).
 */
export default async function NiveisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])
  // Reajuste mexe em todos os salários — só a gestão completa vê o atalho.
  const temGestao = podeAcessar(sessao.permissoes, "pessoal_gestao")
  const sp = await searchParams
  const aba = sp.aba === "lancamentos" ? "lancamentos" : "funcionarios"
  const [{ niveis, nivelDe }, funcionarios] = await Promise.all([carregarCarreira(), funcionariosDaArea()])

  const hoje = hojeSP()
  const em30 = somarDias(hoje, 30)
  const ativos = funcionarios.filter((f) => f.ativo)
  const comNivel = ativos.filter((f) => nivelDe.has(f.usuarioId))
  // Avanço previsto que já passou e ninguém lançou o novo nível.
  const atrasados = comNivel.filter((f) => {
    const d = nivelDe.get(f.usuarioId)!.proximo?.data
    return Boolean(d && d < hoje)
  })
  const avancam = comNivel.filter((f) => avancaAte(nivelDe.get(f.usuarioId)!.proximo?.data, hoje, em30))
  const salarios = comNivel.map((f) => nivelDe.get(f.usuarioId)!.salario).filter((v): v is number => v !== null)
  const folhaBase = salarios.reduce((s, v) => s + v, 0)

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
            <h1 className="text-2xl font-semibold tracking-tight">Níveis salariais</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Degraus do acordo coletivo que definem o salário básico por cargo
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {temGestao && (
              <Button variant="outline" asChild>
                <Link href="/painel/pessoal/niveis/reajuste">
                  <Percent />
                  Reajuste salarial
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/niveis/tabela">
                <Table2 />
                Tabela salarial
              </Link>
            </Button>
            <Button asChild>
              <Link href="/painel/pessoal/niveis/novo">
                <Plus />
                Novo lançamento
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Lançamento salvo.</AlertDescription>
        </Alert>
      )}
      {sp.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Lançamento excluído.</AlertDescription>
        </Alert>
      )}

      {atrasados.length > 0 && (
        <Alert>
          <AlertDescription>
            Avanço previsto já passou, sem novo lançamento:{" "}
            {atrasados.map((f, i) => (
              <span key={f.usuarioId}>
                {i > 0 && ", "}
                <Link href={`/painel/pessoal/carreira/funcionario/${f.usuarioId}`} className="hover:underline">
                  {f.nome}
                </Link>{" "}
                ({formatarData(nivelDe.get(f.usuarioId)!.proximo?.data ?? null)})
              </span>
            ))}
            .
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Ativos com nível" valor={`${comNivel.length} de ${ativos.length}`} />
        <TileIndicador
          rotulo="Avançam em 30 dias"
          valor={String(avancam.length)}
          nota={avancam.length ? avancam.map((f) => f.nome.split(" ")[0]).join(", ") : "nenhum"}
          href="/painel/pessoal/niveis?ordem=proximo&dir=asc"
        />
        <TileIndicador
          rotulo="Salário básico (soma)"
          valor={salarios.length ? formatarMoeda(folhaBase) : "—"}
          nota={salarios.length ? `média ${formatarMoeda(folhaBase / salarios.length)}` : "sem salários na tabela"}
        />
        <TileIndicador rotulo="Lançamentos" valor={niveis.length.toLocaleString("pt-BR")} nota="em todo o histórico" />
      </section>

      <AbasLink
        rotulo="Visões dos níveis salariais"
        abas={[
          { href: "/painel/pessoal/niveis", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/niveis?aba=lancamentos", rotulo: "Lançamentos", ativo: aba === "lancamentos", contador: niveis.length },
        ]}
      />

      {aba === "lancamentos" ? (
        <ListaLancamentosNiveis brutos={sp} />
      ) : (
        <AbaFuncionarios sp={sp} funcionarios={funcionarios} nivelDe={nivelDe} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  funcionarios,
  nivelDe,
}: {
  sp: Record<string, string | undefined>
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
  nivelDe: Awaited<ReturnType<typeof carregarCarreira>>["nivelDe"]
}) {
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const n = nivelDe.get(l.usuarioId)
    switch (f.ordem) {
      case "nivel":
        return n?.rotulo
      case "salario":
        return n?.salario
      case "desde":
        return n?.desde
      case "proximo":
        return n?.proximo?.data
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f)
  const urlAtual = `/painel/pessoal/niveis?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="carreira-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios filtros={f} departamentos={departamentosDaLista(funcionarios)} />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/niveis", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/carreira/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "nivel",
            rotulo: "Nível atual",
            valor: (l) => {
              const n = nivelDe.get(l.usuarioId)
              return n ? (
                <Link href={`/painel/pessoal/niveis/${n.atual.id}?de=funcionarios`} className="hover:underline">
                  {n.rotulo}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            },
          },
          {
            chave: "salario",
            rotulo: "Salário básico",
            className: "text-right tabular-nums",
            valor: (l) => {
              const s = nivelDe.get(l.usuarioId)?.salario
              return s !== null && s !== undefined ? formatarMoeda(s) : "—"
            },
          },
          {
            chave: "desde",
            rotulo: "Desde",
            className: "text-muted-foreground hidden whitespace-nowrap md:table-cell",
            valor: (l) => formatarData(nivelDe.get(l.usuarioId)?.desde ?? null),
          },
          {
            chave: "proximo",
            rotulo: "Próximo avanço",
            className: "whitespace-nowrap",
            valor: (l) => {
              const p = nivelDe.get(l.usuarioId)?.proximo
              return p ? (
                <>
                  {formatarData(p.data)}
                  {p.data && p.data < hojeSP() && (
                    <Badge variant="warning" className="ml-1.5">
                      Atrasado
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-1 hidden text-xs lg:inline">{p.rotulo}</span>
                </>
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

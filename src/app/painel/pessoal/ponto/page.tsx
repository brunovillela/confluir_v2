import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, BarChart3, Plus, UserX } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { requirePermissao } from "@/lib/auth"
import { funcionariosParaSelecao, listarRemessasPonto } from "@/lib/db/pessoal"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { anosDaBase, carregarBasePonto, indicadoresDe, rotuloCompetenciaPonto } from "@/lib/db/ponto-analise"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { percentuaisHoraExtra, regrasApuracaoPonto } from "@/lib/db/ponto-config"
import { isentosNaCompetencia, listarIsencoesPonto, situacaoIsencao } from "@/lib/db/ponto-isencoes"

import { horas } from "./analise/componentes"
import { RegrasHoraExtraForm } from "./faixas-form"
import { IsencaoPontoForm } from "./isencoes-form"
import { TabelaIsencoes } from "./isencoes-tabela"
import { ListaRemessasPonto } from "./remessas-lista"

export const metadata: Metadata = { title: "Controle de ponto — Confluir" }

const ORDENS = ["nome", "he", "he100", "meses", "saldo", "alertas"] as const

/**
 * Controle de ponto — nível 1 do padrão das áreas do Pessoal: indicadores do
 * ano, a remessa aberta e as abas Funcionários (inicial), Remessas e Isenções.
 */
export default async function PontoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const aba = sp.aba === "remessas" || sp.aba === "isencoes" ? sp.aba : "funcionarios"

  const [base, remessas, funcionarios, percentuais, isencoes, regras] = await Promise.all([
    carregarBasePonto(),
    listarRemessasPonto(),
    funcionariosDaArea(),
    percentuaisHoraExtra(),
    listarIsencoesPonto(),
    regrasApuracaoPonto(),
  ])
  const { faixas } = base
  const anos = anosDaBase(base)
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos[0]
  const ind = ano ? indicadoresDe(base, { escopo: "ano", ano }) : null

  // Remessa em andamento: a mais recente ainda não finalizada.
  const aberta = remessas
    .filter((r) => r.finalizada !== true)
    .map((r) => ({ ...r, comp: base.remessas.find((b) => b.id === r.id)?.competencia ?? "" }))
    .sort((a, b) => b.comp.localeCompare(a.comp))[0]
  // Isentos de registro no mês inteiro da remessa aberta: só a nota (alguns
  // podem ter registro mesmo assim; a lista de pendentes fica na remessa).
  const isentosAberta = (await isentosNaCompetencia(aberta?.comp || null)).inteiro
  const ativos = funcionarios.filter((f) => f.ativo).length
  const vigentes = isencoes.filter((i) => situacaoIsencao(i) === "vigente").length

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
            <h1 className="text-2xl font-semibold tracking-tight">Controle de ponto</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Espelhos de ponto, horas extras e banco de horas — por funcionário e por remessa mensal
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/painel/pessoal/ponto/analise${ano ? `?ano=${ano}` : ""}`}>
                <BarChart3 />
                Indicadores e resenhas
              </Link>
            </Button>
            <Button asChild>
              <Link href="/painel/pessoal/ponto/nova">
                <Plus />
                Nova remessa
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {sp.excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa excluída.</AlertDescription>
        </Alert>
      )}

      {ind && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TileIndicador rotulo={`Horas extras em ${ano}`} valor={horas(ind.he)} nota={`${horas(ind.he100)} a ${faixas["100"]}`} />
          <TileIndicador rotulo="Funcionários com horas extras" valor={`${ind.comHE} de ${ind.funcionarios}`} />
          <TileIndicador rotulo="Banco de horas" valor={horas(ind.saldo)} nota="saldo na última remessa de cada um" />
          <TileIndicador
            rotulo="Em atenção"
            valor={String(ind.pessoas.filter((p) => p.alertas.length).length)}
            nota="com algum alerta no ano"
            href={`/painel/pessoal/ponto/analise?ano=${ano}`}
          />
          <TileIndicador
            rotulo="Meses sem remessa"
            valor={String(ind.mesesSemRemessa.length)}
            nota={ind.mesesSemRemessa.length ? ind.mesesSemRemessa.map(rotuloCompetenciaPonto).join(", ") : "nenhum"}
          />
        </section>
      )}

      {aberta && (
        <Link href={`/painel/pessoal/ponto/${aberta.id}`} className="group block">
          <Card className="group-hover:border-primary transition-colors">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{aberta.nome_remessa ?? "Remessa"} — aberta</p>
                <p className="text-muted-foreground text-xs">
                  {aberta.itens} de {ativos} funcionário(s) ativo(s) lançado(s)
                  {isentosAberta.size > 0 && ` · ${isentosAberta.size} isento(s) de registro`}
                </p>
              </div>
              <span className="text-primary inline-flex items-center gap-1 text-sm">
                Continuar <ArrowRight className="size-4" />
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      <AbasLink
        rotulo="Visões do controle de ponto"
        abas={[
          { href: "/painel/pessoal/ponto", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/ponto?aba=remessas", rotulo: "Remessas", ativo: aba === "remessas", contador: remessas.length },
          { href: "/painel/pessoal/ponto?aba=isencoes", rotulo: "Isenções", ativo: aba === "isencoes", contador: vigentes },
        ]}
      />

      {aba === "remessas" ? (
        <ListaRemessasPonto brutos={sp} />
      ) : aba === "isencoes" ? (
        <AbaIsencoes sp={sp} isencoes={isencoes} />
      ) : (
        <AbaFuncionarios sp={sp} ano={ano} anos={anos} ind={ind} funcionarios={funcionarios} />
      )}

      {/* ?regras=1 (links da importação) abre o grupo já expandido. */}
      <div id="regras-hora-extra" className="scroll-mt-20">
        <GrupoColapsavel
          titulo="Regras de hora extra"
          descricao="Percentual de cada faixa e como as horas do mês são apuradas pelas batidas na importação do relatório de ponto."
          resumo={<span className="text-muted-foreground text-sm">{faixas["70"]} e {faixas["100"]}</span>}
          aberto={sp.regras === "1"}
        >
          <RegrasHoraExtraForm faixa1={percentuais.faixa1} faixa2={percentuais.faixa2} regras={regras} />
        </GrupoColapsavel>
      </div>
    </>
  )
}

/**
 * Isenções de registro de ponto: quem não registra ponto num período, com a
 * justificativa. Formulário fechado até "Nova isenção" (?nova=1).
 */
async function AbaIsencoes({
  sp,
  isencoes,
}: {
  sp: Record<string, string | undefined>
  isencoes: Awaited<ReturnType<typeof listarIsencoesPonto>>
}) {
  const aberto = sp.nova === "1"
  const funcionarios = aberto ? await funcionariosParaSelecao() : []
  return (
    <>
      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Isenção registrada.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Quem está isento no mês inteiro de uma remessa não aparece entre os funcionários sem registro. Encerrar
          uma isenção mantém o histórico.
        </p>
        {!aberto && (
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/ponto?aba=isencoes&nova=1">
              <UserX />
              Nova isenção
            </Link>
          </Button>
        )}
      </div>
      {aberto && <IsencaoPontoForm funcionarios={funcionarios} voltar="/painel/pessoal/ponto?aba=isencoes" />}
      <TabelaIsencoes isencoes={isencoes} />
    </>
  )
}

function AbaFuncionarios({
  sp,
  ano,
  anos,
  ind,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  ano: string | undefined
  anos: string[]
  ind: ReturnType<typeof indicadoresDe> | null
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const pessoa = new Map((ind?.pessoas ?? []).map((p) => [p.id, p]))
  const valor = (l: (typeof funcionarios)[number]) => {
    const p = pessoa.get(l.usuarioId)
    switch (f.ordem) {
      case "he":
        return p?.he
      case "he100":
        return p?.he100
      case "meses":
        return p?.mesesComHE
      case "saldo":
        return p?.saldo
      case "alertas":
        return p?.alertas.length
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const extras = { ano: sp.ano }
  const params = paramsDosFiltros(f, extras)
  const urlAtual = `/painel/pessoal/ponto?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="ponto-funcionarios" url={urlAtual} />
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
        linkOrdem={linkDeOrdem("/painel/pessoal/ponto", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/ponto/funcionario/${l.usuarioId}${ano ? `?ano=${ano}` : ""}`}
        colunas={[
          {
            chave: "he",
            rotulo: `Horas extras ${ano ?? ""}`.trim(),
            className: "text-right tabular-nums",
            valor: (l) => (pessoa.has(l.usuarioId) ? horas(pessoa.get(l.usuarioId)!.he) : "—"),
          },
          {
            chave: "he100",
            rotulo: `A ${ind?.faixas["100"] ?? "faixa 2"}`,
            className: "hidden text-right tabular-nums md:table-cell",
            valor: (l) => (pessoa.has(l.usuarioId) ? horas(pessoa.get(l.usuarioId)!.he100) : "—"),
          },
          {
            chave: "meses",
            rotulo: "Meses com HE",
            className: "hidden text-right tabular-nums md:table-cell",
            valor: (l) => {
              const p = pessoa.get(l.usuarioId)
              return p ? `${p.mesesComHE}/${p.meses}` : "—"
            },
          },
          {
            chave: "saldo",
            rotulo: "Banco",
            className: "text-right tabular-nums",
            valor: (l) => (pessoa.has(l.usuarioId) ? horas(pessoa.get(l.usuarioId)!.saldo) : "—"),
          },
          {
            chave: "alertas",
            rotulo: "Alertas",
            className: "text-right",
            valor: (l) => {
              const n = pessoa.get(l.usuarioId)?.alertas.length ?? 0
              return n ? (
                <span className="text-warning-fg font-medium tabular-nums">{n}</span>
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

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Table2 } from "lucide-react"

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
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaLancamentosAnuenios } from "./lancamentos-lista"

export const metadata: Metadata = { title: "Anuênios — Confluir" }

const ORDENS = ["nome", "nivel", "desde", "proximo", "contabilidade"] as const

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Anuênios — nível 1 do padrão das áreas do Pessoal: indicadores e as abas
 * Funcionários (inicial: o anuênio atual de cada um) e Lançamentos. O nome
 * leva à Carreira do funcionário (nível 2).
 */
export default async function AnueniosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])
  const sp = await searchParams
  const aba = sp.aba === "lancamentos" ? "lancamentos" : "funcionarios"
  const [{ anuenios, anuenioDe }, funcionarios] = await Promise.all([carregarCarreira(), funcionariosDaArea()])

  const hoje = hojeSP()
  const em30 = somarDias(hoje, 30)
  const ativos = funcionarios.filter((f) => f.ativo)
  const comAnuenio = ativos.filter((f) => anuenioDe.has(f.usuarioId))
  // Avanço previsto que já passou e ninguém lançou o novo nível.
  const atrasados = comAnuenio.filter((f) => {
    const d = anuenioDe.get(f.usuarioId)!.proximo?.data
    return Boolean(d && d < hoje)
  })
  const avancam = comAnuenio.filter((f) => avancaAte(anuenioDe.get(f.usuarioId)!.proximo?.data, hoje, em30))
  const pendentesContab = comAnuenio.filter((f) => !anuenioDe.get(f.usuarioId)!.informado)

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
            <h1 className="text-2xl font-semibold tracking-tight">Anuênios</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Alíquota sobre o salário básico por ano de casa; avança no aniversário de emprego
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/anuenios/tabela">
                <Table2 />
                Tabela de alíquotas
              </Link>
            </Button>
            <Button asChild>
              <Link href="/painel/pessoal/anuenios/novo">
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
                ({formatarData(anuenioDe.get(f.usuarioId)!.proximo?.data ?? null)})
              </span>
            ))}
            .
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Ativos com anuênio" valor={`${comAnuenio.length} de ${ativos.length}`} />
        <TileIndicador
          rotulo="Avançam em 30 dias"
          valor={String(avancam.length)}
          nota={avancam.length ? avancam.map((f) => f.nome.split(" ")[0]).join(", ") : "nenhum"}
          href="/painel/pessoal/anuenios?ordem=proximo&dir=asc"
        />
        <TileIndicador
          rotulo="Não informados à contabilidade"
          valor={String(pendentesContab.length)}
          nota="no lançamento mais recente de cada um"
          href="/painel/pessoal/anuenios?ordem=contabilidade&dir=asc"
        />
        <TileIndicador rotulo="Lançamentos" valor={anuenios.length.toLocaleString("pt-BR")} nota="em todo o histórico" />
      </section>

      <AbasLink
        rotulo="Visões dos anuênios"
        abas={[
          { href: "/painel/pessoal/anuenios", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/anuenios?aba=lancamentos", rotulo: "Lançamentos", ativo: aba === "lancamentos", contador: anuenios.length },
        ]}
      />

      {aba === "lancamentos" ? (
        <ListaLancamentosAnuenios brutos={sp} />
      ) : (
        <AbaFuncionarios sp={sp} funcionarios={funcionarios} anuenioDe={anuenioDe} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  funcionarios,
  anuenioDe,
}: {
  sp: Record<string, string | undefined>
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
  anuenioDe: Awaited<ReturnType<typeof carregarCarreira>>["anuenioDe"]
}) {
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const a = anuenioDe.get(l.usuarioId)
    switch (f.ordem) {
      case "nivel":
        return a ? Number(a.atual.nivelAtual?.nivel ?? 0) : null
      case "desde":
        return a?.desde
      case "proximo":
        return a?.proximo?.data
      case "contabilidade":
        return a ? (a.informado ? 1 : 0) : null
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f)
  const urlAtual = `/painel/pessoal/anuenios?${new URLSearchParams(
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
        linkOrdem={linkDeOrdem("/painel/pessoal/anuenios", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/carreira/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "nivel",
            rotulo: "Anuênio atual",
            valor: (l) => {
              const a = anuenioDe.get(l.usuarioId)
              return a ? (
                <Link href={`/painel/pessoal/anuenios/${a.atual.id}?de=funcionarios`} className="hover:underline">
                  {a.rotulo} · {a.aliquota}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            },
          },
          {
            chave: "desde",
            rotulo: "Desde",
            className: "text-muted-foreground hidden whitespace-nowrap md:table-cell",
            valor: (l) => formatarData(anuenioDe.get(l.usuarioId)?.desde ?? null),
          },
          {
            chave: "proximo",
            rotulo: "Próximo avanço",
            className: "whitespace-nowrap",
            valor: (l) => {
              const p = anuenioDe.get(l.usuarioId)?.proximo
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
          {
            chave: "contabilidade",
            rotulo: "Contabilidade",
            className: "hidden md:table-cell",
            valor: (l) => {
              const a = anuenioDe.get(l.usuarioId)
              if (!a) return <span className="text-muted-foreground">—</span>
              return a.informado ? <Badge variant="success">Informado</Badge> : <Badge variant="warning">Pendente</Badge>
            },
          },
        ]}
      />
    </>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"

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
import { carregarBaseInformes, type InformeArea } from "@/lib/db/informes-area"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaRemessasInformes } from "./remessas-lista"

export const metadata: Metadata = { title: "Informes de rendimentos — Confluir" }

const ORDENS = ["nome", "ultimo", "quantidade"] as const

/**
 * Informes de rendimentos — nível 1 do padrão das áreas do Pessoal:
 * indicadores do último ano-base e as abas Funcionários (inicial) e Remessas.
 */
export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])
  const sp = await searchParams
  const aba = sp.aba === "remessas" ? "remessas" : "funcionarios"
  const [{ remessas, informes }, funcionarios] = await Promise.all([carregarBaseInformes(), funcionariosDaArea()])

  const ultimoAno = [...remessas].map((r) => r.ano_referencia_os ?? "").filter(Boolean).sort().reverse()[0]
  const doUltimo = informes.filter((i) => i.ano === ultimoAno)
  const comInforme = new Set(doUltimo.map((i) => i.funcionarioId))
  const ativos = funcionarios.filter((f) => f.ativo)
  const semInforme = ultimoAno ? ativos.filter((f) => !comInforme.has(f.usuarioId)) : []

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
            <h1 className="text-2xl font-semibold tracking-tight">Informes de rendimentos</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Um informe por funcionário e ano-base, para o imposto de renda
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/pessoal/informes/nova">
              <Plus />
              Nova remessa
            </Link>
          </Button>
        </div>
      </div>

      {sp.excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa excluída.</AlertDescription>
        </Alert>
      )}

      {ultimoAno && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TileIndicador rotulo={`Informes do ano-base ${ultimoAno}`} valor={String(doUltimo.length)} nota={`${ativos.length} funcionário(s) ativo(s)`} />
          <TileIndicador
            rotulo="Bloqueados"
            valor={String(doUltimo.filter((i) => !i.liberado).length)}
            nota="ainda não visíveis ao funcionário"
          />
          <TileIndicador
            rotulo={`Ativos sem informe ${ultimoAno}`}
            valor={String(semInforme.length)}
            nota={semInforme.length ? semInforme.map((f) => f.nome.split(" ")[0]).join(", ") : "todos têm"}
          />
          <TileIndicador rotulo="Anos-base" valor={String(remessas.length)} nota={`${informes.length} informe(s) no total`} />
        </section>
      )}

      <AbasLink
        rotulo="Visões dos informes"
        abas={[
          { href: "/painel/pessoal/informes", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/informes?aba=remessas", rotulo: "Remessas", ativo: aba === "remessas", contador: remessas.length },
        ]}
      />

      {aba === "remessas" ? (
        <ListaRemessasInformes remessas={remessas} />
      ) : (
        <AbaFuncionarios sp={sp} informes={informes} funcionarios={funcionarios} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  informes,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  informes: InformeArea[]
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const porPessoa = new Map<string, InformeArea[]>()
  for (const i of informes) porPessoa.set(i.funcionarioId, [...(porPessoa.get(i.funcionarioId) ?? []), i])
  const valor = (l: (typeof funcionarios)[number]) => {
    const lista = porPessoa.get(l.usuarioId)
    switch (f.ordem) {
      case "ultimo":
        return lista?.[0]?.ano
      case "quantidade":
        return lista?.length
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f)
  const urlAtual = `/painel/pessoal/informes?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="informes-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios filtros={f} departamentos={departamentosDaLista(funcionarios)} />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/informes", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/informes/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "ultimo",
            rotulo: "Último ano-base",
            valor: (l) => {
              const u = porPessoa.get(l.usuarioId)?.[0]
              if (!u) return <span className="text-muted-foreground">—</span>
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Link href={`/painel/pessoal/informes/funcionario/${l.usuarioId}/${u.id}`} className="hover:underline">
                    {u.ano}
                  </Link>
                  {!u.liberado && <Badge variant="warning">Bloqueado</Badge>}
                </span>
              )
            },
          },
          {
            chave: "quantidade",
            rotulo: "Informes",
            className: "text-right tabular-nums",
            valor: (l) => porPessoa.get(l.usuarioId)?.length ?? "—",
          },
        ]}
      />
    </>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Plus, Settings } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { carregarBaseContracheques, resumirContracheques, type ContrachequeArea } from "@/lib/db/contracheques-area"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaRemessasContracheques } from "./remessas-lista"

export const metadata: Metadata = { title: "Contracheques — Confluir" }

const ORDENS = ["nome", "quantidade", "bloqueados", "valor", "ultimo"] as const

/**
 * Contracheques — nível 1 do padrão das áreas do Pessoal: indicadores do ano,
 * a remessa aberta, quem ficou sem contracheque e as abas Funcionários
 * (inicial) e Remessas.
 */
export default async function ContrachequesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
  const gestao = podeAcessar(sessao.permissoes, "pessoal_gestao")
  const sp = await searchParams
  const aba = sp.aba === "remessas" ? "remessas" : "funcionarios"

  const [{ remessas, contracheques }, funcionarios] = await Promise.all([carregarBaseContracheques(), funcionariosDaArea()])
  const anos = [...new Set(contracheques.map((c) => c.ano).filter(Boolean))].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos[0]
  const doAno = contracheques.filter((c) => c.ano === ano)
  const resumo = resumirContracheques(doAno)

  const aberta = remessas.filter((r) => r.finalizada !== true).sort((a, b) => (b.ordem ?? 0) - (a.ordem ?? 0))[0]
  // Quem está ativo e ficou de fora da última remessa mensal.
  const ultimaMensal = contracheques.find((c) => c.natureza === "Mensal")
  const naUltima = new Set(contracheques.filter((c) => c.remessaId === ultimaMensal?.remessaId).map((c) => c.funcionarioId))
  const semNaUltima = ultimaMensal ? funcionarios.filter((f) => f.ativo && !naUltima.has(f.usuarioId)) : []
  const ativos = funcionarios.filter((f) => f.ativo).length

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
            <h1 className="text-2xl font-semibold tracking-tight">Contracheques</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Contracheques por funcionário e por remessa — mensal, adiantamento, 13º e férias
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {gestao && (
              <Button variant="outline" asChild>
                <Link href="/painel/pessoal/contracheques/configuracao">
                  <Settings />
                  Configuração
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/painel/pessoal/contracheques/nova">
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

      {ano && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TileIndicador
            rotulo={`Contracheques em ${ano}`}
            valor={resumo.quantidade.toLocaleString("pt-BR")}
            nota={`${new Set(doAno.map((c) => c.remessaId)).size} remessa(s)`}
          />
          <TileIndicador
            rotulo="Bloqueados"
            valor={resumo.bloqueados.toLocaleString("pt-BR")}
            nota="ainda não visíveis ao funcionário"
          />
          <TileIndicador
            rotulo="Valor líquido no ano"
            valor={resumo.comValor ? formatarMoeda(resumo.valor) : "—"}
            nota={resumo.comValor ? `${resumo.comValor} com valor informado` : "valores não informados nas remessas"}
          />
          <TileIndicador
            rotulo="Sem contracheque na última mensal"
            valor={String(semNaUltima.length)}
            nota={ultimaMensal ? ultimaMensal.remessaNome : "nenhuma remessa mensal"}
          />
        </section>
      )}

      {aberta && (
        <Link href={`/painel/pessoal/contracheques/${aberta.id}`} className="group block">
          <Card className="group-hover:border-primary transition-colors">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{aberta.nome_remessa ?? "Remessa"} — aberta</p>
                <p className="text-muted-foreground text-xs">
                  {aberta.itens} contracheque(s) lançado(s) · {ativos} funcionário(s) ativo(s)
                </p>
              </div>
              <span className="text-primary inline-flex items-center gap-1 text-sm">
                Continuar <ArrowRight className="size-4" />
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      {semNaUltima.length > 0 && ultimaMensal && (
        <Alert>
          <AlertDescription>
            Sem contracheque em {ultimaMensal.remessaNome}:{" "}
            {semNaUltima.map((f, i) => (
              <span key={f.usuarioId}>
                {i > 0 && ", "}
                <Link href={`/painel/pessoal/contracheques/funcionario/${f.usuarioId}`} className="hover:underline">
                  {f.nome}
                </Link>
              </span>
            ))}
            .
          </AlertDescription>
        </Alert>
      )}

      <AbasLink
        rotulo="Visões dos contracheques"
        abas={[
          { href: "/painel/pessoal/contracheques", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/contracheques?aba=remessas", rotulo: "Remessas", ativo: aba === "remessas", contador: remessas.length },
        ]}
      />

      {aba === "remessas" ? (
        <ListaRemessasContracheques brutos={sp} />
      ) : (
        <AbaFuncionarios sp={sp} ano={ano} anos={anos} doAno={doAno} funcionarios={funcionarios} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  ano,
  anos,
  doAno,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  ano: string | undefined
  anos: string[]
  doAno: ContrachequeArea[]
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const porPessoa = new Map<string, ContrachequeArea[]>()
  for (const c of doAno) {
    const l = porPessoa.get(c.funcionarioId) ?? []
    l.push(c)
    porPessoa.set(c.funcionarioId, l)
  }
  const resumo = new Map([...porPessoa].map(([id, l]) => [id, resumirContracheques(l)]))
  const valor = (l: (typeof funcionarios)[number]) => {
    const r = resumo.get(l.usuarioId)
    switch (f.ordem) {
      case "quantidade":
        return r?.quantidade
      case "bloqueados":
        return r?.bloqueados
      case "valor":
        return r?.comValor ? r.valor : null
      case "ultimo":
        return r?.ultimo?.remessaOrdem
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { ano: sp.ano })
  const urlAtual = `/painel/pessoal/contracheques?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="contracheques-funcionarios" url={urlAtual} />
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
        linkOrdem={linkDeOrdem("/painel/pessoal/contracheques", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/contracheques/funcionario/${l.usuarioId}${ano ? `?ano=${ano}` : ""}`}
        colunas={[
          {
            chave: "quantidade",
            rotulo: `Em ${ano ?? ""}`.trim(),
            className: "text-right tabular-nums",
            valor: (l) => resumo.get(l.usuarioId)?.quantidade ?? "—",
          },
          {
            chave: "bloqueados",
            rotulo: "Bloqueados",
            className: "hidden text-right tabular-nums md:table-cell",
            valor: (l) => {
              const n = resumo.get(l.usuarioId)?.bloqueados ?? 0
              return n ? <span className="text-warning-fg font-medium">{n}</span> : <span className="text-muted-foreground">—</span>
            },
          },
          {
            chave: "valor",
            rotulo: "Líquido no ano",
            className: "hidden text-right tabular-nums lg:table-cell",
            valor: (l) => {
              const r = resumo.get(l.usuarioId)
              return r?.comValor ? formatarMoeda(r.valor) : "—"
            },
          },
          {
            chave: "ultimo",
            rotulo: "Último",
            valor: (l) => {
              const u = resumo.get(l.usuarioId)?.ultimo
              if (!u) return <span className="text-muted-foreground">—</span>
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Link href={`/painel/pessoal/contracheques/funcionario/${l.usuarioId}/${u.id}`} className="hover:underline">
                    {u.remessaNome}
                  </Link>
                  {!u.liberado && <Badge variant="warning">Bloqueado</Badge>}
                </span>
              )
            },
          },
        ]}
      />
    </>
  )
}

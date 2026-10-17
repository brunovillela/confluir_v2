import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Settings } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { AVISO_SQL_FALTAS, lerConfigFaltas, listarFaltas, type FaltaJustificada } from "@/lib/db/faltas"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { resumoLimites, type ConfigFaltas } from "@/lib/faltas-constantes"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { DecisaoFalta, RegistrarFaltaForm } from "./faltas-forms"
import { ListaFaltasAno } from "./faltas-lista"
import { BadgeFalta, LinkComprovacao } from "./faltas-ui"

export const metadata: Metadata = { title: "Faltas justificadas — Confluir" }

const ORDENS = ["nome", "quantidade", "saldo", "aguardando", "ultima"] as const

/**
 * Faltas justificadas — nível 1 do padrão das áreas do Pessoal: os pedidos a
 * autorizar (a fila) no topo, indicadores, registrar falta e as abas
 * Funcionários (inicial: uso e saldo do limite) e Faltas do ano.
 */
export default async function FaltasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_faltas_justificadas"])
  const sp = await searchParams
  const aba = sp.aba === "faltas" ? "faltas" : "funcionarios"
  const hoje = hojeSP()
  const ano = /^\d{4}$/.test(sp.ano ?? "") ? sp.ano! : hoje.slice(0, 4)

  const [{ disponivel, faltas: doAno }, { faltas: todas }, { config, disponivel: configOk }, paraSelecao, funcionarios] =
    await Promise.all([
      listarFaltas({ ano }),
      // Aguardando de qualquer ano: um pedido antigo esquecido não some do radar.
      listarFaltas(),
      lerConfigFaltas(),
      funcionariosParaSelecao(),
      funcionariosDaArea(),
    ])
  const aguardando = todas.filter((f) => f.situacao === "aguardando").sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
  const anos = [...new Set([hoje.slice(0, 4), ...todas.map((f) => (f.data ?? "").slice(0, 4)).filter(Boolean)])].sort().reverse()

  // Uso por funcionário no ano (as que contam: não recusadas).
  const usoPorFuncionario = new Map<string, number>()
  for (const f of doAno) {
    if (f.situacao === "recusada" || !f.funcionarioId) continue
    usoPorFuncionario.set(f.funcionarioId, (usoPorFuncionario.get(f.funcionarioId) ?? 0) + 1)
  }
  const autorizadasNoAno = doAno.filter((f) => f.situacao === "autorizada").length
  const noLimite =
    config.limiteAno !== null ? [...usoPorFuncionario.values()].filter((n) => n >= config.limiteAno!).length : null

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
            <h1 className="text-2xl font-semibold tracking-tight">Faltas justificadas</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Pedidos dos funcionários e registros do departamento — limites: {resumoLimites(config)}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/faltas/configuracoes">
              <Settings />
              Configurações
            </Link>
          </Button>
        </div>
      </div>

      {(!disponivel || !configOk) && (
        <Alert>
          <AlertDescription>{AVISO_SQL_FALTAS}</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Aguardando autorização" valor={String(aguardando.length)} href="#fila" />
        <TileIndicador rotulo={`Autorizadas em ${ano}`} valor={String(autorizadasNoAno)} />
        <TileIndicador rotulo={`Funcionários com falta em ${ano}`} valor={String(usoPorFuncionario.size)} />
        <TileIndicador
          rotulo="No limite do ano"
          valor={noLimite === null ? "—" : String(noLimite)}
          nota={config.limiteAno === null ? "sem limite anual" : `${config.limiteAno} por ano`}
          href={noLimite ? "/painel/pessoal/faltas?ordem=saldo&dir=asc" : undefined}
        />
      </section>

      {aguardando.length > 0 && (
        <Card id="fila" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">
              Aguardando autorização
              <span className="text-muted-foreground ml-2 text-sm font-normal">{aguardando.length}</span>
            </CardTitle>
            <CardDescription>
              Autorizada, a falta entra como ausência &quot;Falta justificada&quot; do dia e o funcionário é avisado. A
              recusa pede o motivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead>Comprovação</TableHead>
                    <TableHead className="text-right">Decisão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aguardando.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-48 font-medium">
                        {f.funcionarioId ? (
                          <Link href={`/painel/pessoal/faltas/funcionario/${f.funcionarioId}`} className="line-clamp-1 hover:underline">
                            {f.funcionarioNome ?? "—"}
                          </Link>
                        ) : (
                          <span className="line-clamp-1">{f.funcionarioNome ?? "—"}</span>
                        )}
                        {f.funcionarioId && (
                          <span className="text-muted-foreground text-xs">{usoPorFuncionario.get(f.funcionarioId) ?? 0} no ano</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/painel/pessoal/faltas/${f.id}?de=area`} className="hover:underline">
                          {formatarData(f.data)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-72">
                        <span className="line-clamp-2 text-sm">{f.tipo ?? "—"}</span>
                        {f.observacao && <span className="text-muted-foreground line-clamp-2 text-xs">{f.observacao}</span>}
                      </TableCell>
                      <TableCell>
                        <LinkComprovacao caminho={f.comprovacao} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DecisaoFalta id={f.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <GrupoColapsavel titulo="Registrar falta" descricao="Lançamento pelo departamento — já autorizada">
        <RegistrarFaltaForm funcionarios={paraSelecao} tipos={config.tipos} hoje={hoje} />
      </GrupoColapsavel>

      <AbasLink
        rotulo="Visões das faltas"
        abas={[
          { href: `/painel/pessoal/faltas${sp.ano ? `?ano=${ano}` : ""}`, rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: `/painel/pessoal/faltas?aba=faltas&ano=${ano}`, rotulo: `Faltas de ${ano}`, ativo: aba === "faltas", contador: doAno.length },
        ]}
      />

      {aba === "faltas" ? (
        <ListaFaltasAno doAno={doAno} ano={ano} anos={anos} brutos={sp} funcionarios={paraSelecao} />
      ) : (
        <AbaFuncionarios sp={sp} ano={ano} anos={anos} doAno={doAno} config={config} funcionarios={funcionarios} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  ano,
  anos,
  doAno,
  config,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  ano: string
  anos: string[]
  doAno: FaltaJustificada[]
  config: ConfigFaltas
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  type Resumo = { quantidade: number; aguardando: number; ultima: FaltaJustificada | null }
  const resumo = new Map<string, Resumo>()
  // A lista vem da data mais recente para a mais antiga.
  for (const f of doAno) {
    if (!f.funcionarioId) continue
    const r = resumo.get(f.funcionarioId) ?? { quantidade: 0, aguardando: 0, ultima: null }
    if (f.situacao !== "recusada") r.quantidade++
    if (f.situacao === "aguardando") r.aguardando++
    r.ultima ??= f
    resumo.set(f.funcionarioId, r)
  }
  const saldo = (id: string) => (config.limiteAno === null ? null : config.limiteAno - (resumo.get(id)?.quantidade ?? 0))

  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const r = resumo.get(l.usuarioId)
    switch (f.ordem) {
      case "quantidade":
        return r?.quantidade
      case "saldo":
        return saldo(l.usuarioId)
      case "aguardando":
        return r?.aguardando
      case "ultima":
        return r?.ultima?.data
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { ano: sp.ano })
  const urlAtual = `/painel/pessoal/faltas?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="faltas-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios
        filtros={f}
        departamentos={departamentosDaLista(funcionarios)}
        extras={
          <SelectNativo name="ano" defaultValue={ano} aria-label="Ano" className="h-9 w-auto">
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectNativo>
        }
      />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/faltas", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/faltas/funcionario/${l.usuarioId}?ano=${ano}`}
        colunas={[
          {
            chave: "quantidade",
            rotulo: `Faltas ${ano}`,
            className: "text-right tabular-nums",
            valor: (l) => resumo.get(l.usuarioId)?.quantidade || "—",
          },
          ...(config.limiteAno !== null
            ? [
                {
                  chave: "saldo",
                  rotulo: `Saldo (de ${config.limiteAno})`,
                  className: "text-right tabular-nums",
                  valor: (l: (typeof funcionarios)[number]) => {
                    const s = saldo(l.usuarioId)!
                    return <span className={s <= 0 ? "text-destructive font-medium" : ""}>{s}</span>
                  },
                },
              ]
            : []),
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
            chave: "ultima",
            rotulo: "Última",
            className: "hidden lg:table-cell",
            valor: (l) => {
              const u = resumo.get(l.usuarioId)?.ultima
              if (!u) return <span className="text-muted-foreground">—</span>
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Link href={`/painel/pessoal/faltas/${u.id}`} className="hover:underline">
                    {formatarData(u.data)}
                  </Link>
                  <BadgeFalta situacao={u.situacao} />
                </span>
              )
            },
          },
        ]}
      />
    </>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  carreiraDoFuncionario,
  formatarAliquota,
  rotuloNivelSalarial,
  type CarreiraFuncionario,
} from "@/lib/db/carreira"
import { buscarPerfilFuncionario } from "@/lib/db/pessoal"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Funcionário — Confluir" }

function formatarHoras(valor: number | null): string {
  if (valor === null || valor === undefined) return "—"
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

function BadgeSimNao({
  valor,
  sim = "Sim",
  nao = "Não",
}: {
  valor: boolean | null
  sim?: string
  nao?: string
}) {
  if (valor === true)
    return (
      <Badge
        variant="outline"
        className="border-success/40 text-success-fg"
      >
        {sim}
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {nao}
    </Badge>
  )
}

function LinkArquivo({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>
  // URLs migradas do Bubble vêm protocolo-relativas (//cdn.bubble.io/…)
  const href = url.startsWith("//") ? `https:${url}` : url
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
    >
      Abrir
      <ExternalLink className="size-3.5" />
    </a>
  )
}

function TituloComTotal({
  titulo,
  exibindo,
  total,
}: {
  titulo: string
  exibindo: number
  total: number
}) {
  return (
    <CardTitle className="text-base">
      {titulo}
      <span className="text-muted-foreground ml-2 text-sm font-normal">
        {total > exibindo
          ? `últimos ${exibindo} de ${total.toLocaleString("pt-BR")}`
          : `${total.toLocaleString("pt-BR")} registro${total === 1 ? "" : "s"}`}
      </span>
    </CardTitle>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">{children}</p>
  )
}

export default async function FuncionarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", [
    "pessoal_contracheque",
  ])
  // Gestão vê tudo; a chave dedicada `pessoal_contracheque` libera só a
  // seção de contracheques (espelha o modelo de permissão do Bubble).
  const temGestao = podeAcessar(sessao.permissoes, "pessoal_gestao")
  const temContracheque =
    temGestao || podeAcessar(sessao.permissoes, "pessoal_contracheque")

  const { id } = await params
  const perfil = await buscarPerfilFuncionario(id)
  if (!perfil) notFound()

  // Anuênios e níveis salariais são remuneração — só a gestão vê.
  const carreira: CarreiraFuncionario = temGestao
    ? await carreiraDoFuncionario(id)
    : { anuenios: [], niveis: [] }

  const {
    usuario,
    vinculos,
    contracheques,
    ponto,
    feriasPeriodos,
    feriasGozos,
    ausencias,
    faltas,
    atestados,
    asos,
    dependentes,
  } = perfil

  const vinculoAtual = vinculos.find((v) => !v.contrato_demissao) ?? vinculos[0]
  const ativo = Boolean(vinculoAtual && !vinculoAtual.contrato_demissao)

  return (
    <>
      <div>
        <div className="mb-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/painel/pessoal">
              <ArrowLeft />
              Pessoal
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {usuario.nome_completo ?? usuario.nome_guerra ?? "(sem nome)"}
          </h1>
          {ativo ? (
            <Badge
              variant="outline"
              className="border-success/40 text-success-fg"
            >
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Desligado
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {[
            vinculoAtual?.cargo,
            vinculoAtual?.lotacao,
            vinculoAtual?.matricula && `matrícula ${vinculoAtual.matricula}`,
          ]
            .filter(Boolean)
            .join(" · ") || "Sem vínculo ativo"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vínculos com o sindicato
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {vinculos.length} registro{vinculos.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Lotação
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Regime
                  </TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead>Demissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vinculos.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="max-w-52 truncate font-medium">
                      {v.cargo ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-40 truncate md:table-cell">
                      {v.lotacao ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-48 truncate lg:table-cell">
                      {v.regime_trabalho ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.matricula ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatarData(v.contrato_admissao)}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatarData(v.contrato_demissao)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {temContracheque && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <TituloComTotal
                titulo="Contracheques"
                exibindo={contracheques.ultimas.length}
                total={contracheques.total}
              />
            </CardHeader>
            <CardContent>
              {contracheques.ultimas.length === 0 ? (
                <Vazio>Nenhum contracheque registrado.</Vazio>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Remessa</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Natureza
                      </TableHead>
                      <TableHead>Liberado</TableHead>
                      <TableHead>Arquivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracheques.ultimas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-44 truncate font-medium">
                          {c.remessa ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">
                          {c.remessaTipo ?? "Mensal"}
                        </TableCell>
                        <TableCell>
                          <BadgeSimNao valor={c.liberado} />
                        </TableCell>
                        <TableCell>
                          <LinkArquivo url={c.arquivo} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {temGestao && (
            <Card>
              <CardHeader>
                <TituloComTotal
                  titulo="Registro de ponto"
                  exibindo={ponto.ultimas.length}
                  total={ponto.total}
                />
              </CardHeader>
              <CardContent>
                {ponto.ultimas.length === 0 ? (
                  <Vazio>Nenhum registro de ponto.</Vazio>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Remessa</TableHead>
                          <TableHead className="text-right">
                            Horas 70%
                          </TableHead>
                          <TableHead className="text-right">
                            Saldo 70%
                          </TableHead>
                          <TableHead className="text-right">
                            Horas 100%
                          </TableHead>
                          <TableHead className="text-right">
                            Saldo 100%
                          </TableHead>
                          <TableHead>Arquivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ponto.ultimas.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="max-w-36 truncate font-medium">
                              {p.remessa ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarHoras(p.horas_realizadas_70)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarHoras(p.saldo_remanescente_70)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarHoras(p.horas_realizadas_100)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarHoras(p.saldo_remanescente_100)}
                            </TableCell>
                            <TableCell>
                              <LinkArquivo url={p.arquivo} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {temGestao && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Anuênios
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {carreira.anuenios.length} registro
                    {carreira.anuenios.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href="/painel/pessoal/anuenios"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {carreira.anuenios.length === 0 ? (
                  <Vazio>Nenhum lançamento de anuênio.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">Nível</TableHead>
                        <TableHead className="text-right">Alíquota</TableHead>
                        <TableHead>Vale desde</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Próximo nível
                        </TableHead>
                        <TableHead>Contabilidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carreira.anuenios.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-right font-medium tabular-nums">
                            {a.nivelAtual?.nivel ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatarAliquota(a.nivelAtual?.aliquota)}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatarData(a.nivel_atual_data)}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                            {a.proximoNivel
                              ? formatarData(a.proximo_nivel_data)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <BadgeSimNao
                              valor={a.informado_contabilidade}
                              sim="Informado"
                              nao="Pendente"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Níveis salariais
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {carreira.niveis.length} registro
                    {carreira.niveis.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href="/painel/pessoal/niveis"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {carreira.niveis.length === 0 ? (
                  <Vazio>Nenhum lançamento de nível salarial.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nível</TableHead>
                        <TableHead className="text-right">
                          Salário básico
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Avanço
                        </TableHead>
                        <TableHead>Vale desde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carreira.niveis.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {rotuloNivelSalarial(n.nivelAtual)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">
                            {formatarMoeda(n.nivelAtual?.salario_base)}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden sm:table-cell">
                            {n.tipo_avanco ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatarData(n.nivel_atual_data)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Períodos de férias
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {feriasPeriodos.length} registro
                    {feriasPeriodos.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href="/painel/pessoal/ferias"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {feriasPeriodos.length === 0 ? (
                  <Vazio>Nenhum período de férias registrado.</Vazio>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Aquisitivo</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            Concessivo
                          </TableHead>
                          <TableHead className="text-right">
                            Dias disp.
                          </TableHead>
                          <TableHead>Situação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feriasPeriodos.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {formatarData(f.aquisitivo_inicio)} –{" "}
                              {formatarData(f.aquisitivo_termino)}
                            </TableCell>
                            <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                              {formatarData(f.concessivo_inicio)} –{" "}
                              {formatarData(f.concessivo_termino)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarHoras(f.dias_disponiveis)}
                            </TableCell>
                            <TableCell>
                              <BadgeSimNao
                                valor={f.finalizado}
                                sim="Finalizado"
                                nao="Em aberto"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Gozos de férias
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {feriasGozos.length} registro
                    {feriasGozos.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href="/painel/pessoal/ferias"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {feriasGozos.length === 0 ? (
                  <Vazio>Nenhum gozo de férias registrado.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead>Autorizado</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Aviso
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feriasGozos.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatarData(g.inicio)} – {formatarData(g.termino)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatarHoras(g.dias)}
                          </TableCell>
                          <TableCell>
                            <BadgeSimNao valor={g.autorizado} />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <LinkArquivo url={g.aviso_ferias_url} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Ausências
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {ausencias.total > ausencias.ultimas.length
                      ? `últimas ${ausencias.ultimas.length} de ${ausencias.total}`
                      : `${ausencias.total} registro${ausencias.total === 1 ? "" : "s"}`}
                  </span>
                  <Link
                    href="/painel/pessoal/atestados?aba=ausencias"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ausencias.ultimas.length === 0 ? (
                  <Vazio>Nenhuma ausência registrada.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ausencias.ultimas.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatarData(a.inicio)}
                            {a.termino && a.termino !== a.inicio && (
                              <> – {formatarData(a.termino)}</>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-56 truncate">
                            {a.motivo ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <TituloComTotal
                  titulo="Faltas justificadas"
                  exibindo={faltas.ultimas.length}
                  total={faltas.total}
                />
              </CardHeader>
              <CardContent>
                {faltas.ultimas.length === 0 ? (
                  <Vazio>Nenhuma falta justificada registrada.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Justificativa</TableHead>
                        <TableHead>Autorizada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faltas.ultimas.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatarData(f.data_falta)}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-48 truncate">
                            {f.justificativa_tipo ?? "—"}
                          </TableCell>
                          <TableCell>
                            <BadgeSimNao valor={f.autorizado} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Atestados médicos
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {atestados.total > atestados.ultimas.length
                      ? `últimos ${atestados.ultimas.length} de ${atestados.total}`
                      : `${atestados.total} registro${atestados.total === 1 ? "" : "s"}`}
                  </span>
                  <Link
                    href="/painel/pessoal/atestados"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {atestados.ultimas.length === 0 ? (
                  <Vazio>Nenhum atestado registrado.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          CID-10
                        </TableHead>
                        <TableHead>Arquivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {atestados.ultimas.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatarData(a.inicio)}
                            {a.termino && a.termino !== a.inicio && (
                              <> – {formatarData(a.termino)}</>
                            )}
                            {a.atestado_acompanhamento === true && (
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                (acompanhamento)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.quantidade_dias ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden sm:table-cell">
                            {a.cid10 ?? "—"}
                          </TableCell>
                          <TableCell>
                            <LinkArquivo url={a.atestado} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  ASOs
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {asos.length} registro{asos.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href="/painel/pessoal/aso"
                    className="text-primary ml-3 text-sm font-normal hover:underline"
                  >
                    Gerenciar
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {asos.length === 0 ? (
                  <Vazio>Nenhum ASO registrado.</Vazio>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Vencimento
                        </TableHead>
                        <TableHead>Realizado</TableHead>
                        <TableHead>Arquivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {asos.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatarData(a.data)}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-36 truncate">
                            {a.tipo ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                            {formatarData(a.vencimento)}
                          </TableCell>
                          <TableCell>
                            <BadgeSimNao valor={a.realizado} />
                          </TableCell>
                          <TableCell>
                            <LinkArquivo url={a.arquivo} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Dependentes
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {dependentes.length} registro
                  {dependentes.length === 1 ? "" : "s"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dependentes.length === 0 ? (
                <Vazio>Nenhum dependente registrado.</Vazio>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Parentesco</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Nascimento
                      </TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dependentes.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="max-w-64 truncate font-medium">
                          {d.nome_completo ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.grau_parentesco ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                          {formatarData(d.nascimento)}
                        </TableCell>
                        <TableCell>
                          <BadgeSimNao valor={d.ativo} sim="Ativo" nao="Inativo" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

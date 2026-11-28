import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { conferenciaDoMes, obterContratoSaude } from "@/lib/db/plano-saude"
import { obterFatura, pessoasParaIncluir } from "@/lib/db/plano-saude-fatura"
import { deslocarCompetencia, moeda } from "@/lib/plano-saude"
import { compararFatura, linhaDaEntidade, sugerirPessoa, type ComoCasou, type SituacaoItem } from "@/lib/plano-saude-fatura"

import {
  ApagarFaturaBotao,
  CasarLinhaForm,
  ConferirFaturaForm,
  IncluirLinhaForm,
  IncluirSugeridosForm,
  LancarCopartForm,
  LerFaturaForm,
} from "./forms"

export const metadata: Metadata = { title: "Plano de saúde: fatura da operadora — Confluir" }

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const rotulo = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`
const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso))

const SITUACAO: Record<SituacaoItem, { rotulo: string; classe: string }> = {
  so_na_fatura: { rotulo: "Cobrado sem estar no plano", classe: "border-destructive/40 text-destructive" },
  so_no_sistema: { rotulo: "No plano, sem cobrança", classe: "border-warning/50 text-warning-fg" },
  diferente: { rotulo: "Valor diferente", classe: "border-warning/50 text-warning-fg" },
  confere: { rotulo: "Confere", classe: "border-success/40 text-success-fg" },
  entidade: { rotulo: "Valor da entidade", classe: "text-muted-foreground" },
}
const CASOU: Record<ComoCasou, string> = {
  carteirinha: "pela carteirinha",
  cpf: "pelo CPF",
  nome: "pelo nome",
  nome_parcial: "pelo primeiro e último nome",
  manual: "à mão",
}

/**
 * FATURA DA OPERADORA (Fase 3 do plano de saúde, 25/11/2026): lê a fatura do
 * mês por IA e compara, beneficiário por beneficiário, com a conferência do
 * mês. Linha que não casou se casa à mão; a coparticipação da fatura pode ser
 * lançada no mês; a fatura é marcada como conferida, com observação.
 */
export default async function FaturaPage({ searchParams }: { searchParams: Promise<{ mes?: string; contrato?: string }> }) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesAtual()
  const { disponivel, contratos } = await conferenciaDoMes(mes)
  const atual = contratos.find((c) => c.contrato.id === sp.contrato) ?? contratos[0] ?? null
  const href = (m: string, c = atual?.contrato.id) => `/painel/pessoal/plano-saude/fatura?mes=${m}${c ? `&contrato=${c}` : ""}`

  const [{ disponivel: temTabela, fatura }, completo] = atual
    ? await Promise.all([obterFatura(atual.contrato.id, mes), obterContratoSaude(atual.contrato.id)])
    : [{ disponivel: true, fatura: null }, null]
  const comp = fatura && atual ? compararFatura(fatura.linhas, atual.grupos, fatura.total) : null
  const nomes = new Map((completo?.beneficiarios ?? []).map((b) => [b.id, b.nome]))
  const titulares = new Map(atual?.grupos.map((g) => [g.titular.id, g.titular.nome]) ?? [])
  const opcoes = (completo?.beneficiarios ?? [])
    .map((b) => ({ id: b.id, nome: `${b.nome}${b.tipo === "titular" ? "" : ` (${b.grau}, de ${b.titularNome})`}${b.exclusao ? " — excluído" : ""}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const diferencaTotal = comp && comp.totais.totalFatura !== null ? Math.round((comp.totais.totalFatura - comp.totais.somaLinhas) * 100) / 100 : 0
  const pendentes = comp ? comp.contagem.diferente + comp.contagem.so_na_fatura + comp.contagem.so_no_sistema : 0
  // Carga inicial: as linhas que não casaram com ninguém do plano podem virar
  // adesões, com a pessoa do cadastro sugerida pelo nome.
  const soltas = fatura && !fatura.conferidaEm ? fatura.linhas.map((l, i) => ({ l, i })).filter(({ l }) => !l.beneficiarioId && !linhaDaEntidade(l)) : []
  const pessoas = soltas.length ? await pessoasParaIncluir() : []
  const sugestoes = soltas.map(({ l, i }) => ({ l, i, sugerida: sugerirPessoa(l.nome, pessoas) }))
  const produtosAtivos = (completo?.produtos ?? []).filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))

  return (
    <>
      <RotuloTrilha valores={{ fatura: "Fatura da operadora" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/plano-saude">
            <ArrowLeft />
            Plano de saúde
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Fatura da operadora</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Envie a fatura do mês (PDF, planilha, CSV ou foto): a IA lê o valor de cada beneficiário e o sistema compara com a{" "}
          <Link href={`/painel/pessoal/plano-saude/mes?mes=${mes}`} className="underline">
            conferência do mês
          </Link>
          . O arquivo não é guardado, e da coparticipação só entra o valor.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild aria-label="Mês anterior">
          <Link href={href(deslocarCompetencia(mes, -1))}>
            <ChevronLeft />
          </Link>
        </Button>
        <span className="min-w-40 text-center font-medium">{rotulo(mes)}</span>
        <Button variant="outline" size="icon-sm" asChild aria-label="Próximo mês">
          <Link href={href(deslocarCompetencia(mes, 1))}>
            <ChevronRight />
          </Link>
        </Button>
        {contratos.length > 1 &&
          contratos.map((c) => (
            <Button key={c.contrato.id} variant={c.contrato.id === atual?.contrato.id ? "default" : "outline"} size="sm" asChild>
              <Link href={href(mes, c.contrato.id)}>{c.contrato.nome}</Link>
            </Button>
          ))}
      </div>

      {(!disponivel || !temTabela) && (
        <Alert>
          <AlertDescription>A leitura da fatura ainda não está ligada nesta entidade (falta aplicar a atualização do banco de dados).</AlertDescription>
        </Alert>
      )}
      {disponivel && !atual && (
        <Alert>
          <AlertDescription>Nenhum contrato ativo.</AlertDescription>
        </Alert>
      )}

      {atual && temTabela && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {atual.contrato.nome} · {rotulo(mes)}
            </CardTitle>
            <CardDescription>
              {fatura
                ? `${fatura.arquivoNome ?? "Fatura"} · lida em ${dataHora(fatura.criadaEm)} · ${fatura.linhas.length} linhas`
                : "Ainda sem a fatura deste mês."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {fatura?.conferidaEm && (
              <Alert>
                <CheckCircle2 />
                <AlertDescription>
                  Conferida em {dataHora(fatura.conferidaEm)}
                  {fatura.conferidaPorNome ? ` por ${fatura.conferidaPorNome}` : ""}
                  {fatura.observacao ? ` — ${fatura.observacao}` : ""}.
                </AlertDescription>
              </Alert>
            )}
            {!fatura?.conferidaEm && <LerFaturaForm contratoId={atual.contrato.id} competencia={mes} substituir={Boolean(fatura)} />}
          </CardContent>
        </Card>
      )}

      {atual && fatura && comp && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <TileIndicador rotulo="Mensalidades calculadas" valor={moeda(comp.totais.esperado)} nota="pela conferência do mês" />
            <TileIndicador rotulo="Mensalidades cobradas" valor={moeda(comp.totais.cobradoMensalidades)} />
            <TileIndicador rotulo="Coparticipação" valor={moeda(comp.totais.coparticipacao)} nota="na fatura" />
            <TileIndicador rotulo="Outros valores" valor={moeda(comp.totais.outros)} nota="taxas, pró-rata, ajustes" />
            <TileIndicador
              rotulo="Total da fatura"
              valor={moeda(comp.totais.totalFatura ?? comp.totais.somaLinhas)}
              nota={
                comp.totais.totalFatura === null
                  ? "soma das linhas (total não encontrado)"
                  : Math.abs(diferencaTotal) >= 0.01
                    ? `as linhas somam ${moeda(comp.totais.somaLinhas)}`
                    : "fecha com as linhas"
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Beneficiário por beneficiário</CardTitle>
              <CardDescription>
                {pendentes
                  ? `${pendentes} para olhar: ${[
                      comp.contagem.so_na_fatura && `${comp.contagem.so_na_fatura} cobrado(s) sem estar no plano`,
                      comp.contagem.so_no_sistema && `${comp.contagem.so_no_sistema} no plano sem cobrança`,
                      comp.contagem.diferente && `${comp.contagem.diferente} com valor diferente`,
                    ]
                      .filter(Boolean)
                      .join(", ")}. ${comp.contagem.confere} conferem.`
                  : `Todos os ${comp.contagem.confere} conferem.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Beneficiário</th>
                    <th className="py-1.5 pr-3 font-medium">Situação</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Calculado</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Cobrado</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Diferença</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Copart.</th>
                    <th className="py-1.5 text-right font-medium">Outros</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.itens.map((it) => (
                    <tr key={it.chave} className="border-t align-top">
                      <td className="py-1.5 pr-3">
                        {it.nome}
                        {it.titularId && titulares.get(it.titularId) !== it.nome && (
                          <div className="text-muted-foreground text-xs">de {titulares.get(it.titularId)}</div>
                        )}
                        {it.casou && <div className="text-muted-foreground text-xs">casou {CASOU[it.casou]}</div>}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline" className={SITUACAO[it.situacao].classe}>
                          {SITUACAO[it.situacao].rotulo}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(it.esperado)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(it.cobrado)}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${Math.abs(it.diferenca) >= 0.01 ? "font-medium" : "text-muted-foreground"}`}>
                        {Math.abs(it.diferenca) >= 0.01 ? moeda(it.diferenca) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{it.coparticipacao ? moeda(it.coparticipacao) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums" title={it.outrosDescricao ?? undefined}>
                        {it.outros ? moeda(it.outros) : "—"}
                        {it.outrosDescricao && <div className="text-muted-foreground text-xs">{it.outrosDescricao}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {sugestoes.length > 0 && produtosAtivos.length > 0 && atual && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incluir no plano quem está na fatura</CardTitle>
                <CardDescription>
                  {sugestoes.length} linha{sugestoes.length === 1 ? "" : "s"} sem ninguém do plano. Se a pessoa é funcionária ou
                  dependente cadastrado, inclua no plano daqui (a carteirinha vem da fatura); a linha já fica casada. Agregados e
                  quem não está no cadastro se incluem pela página do contrato.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <IncluirSugeridosForm
                  faturaId={fatura.id}
                  contratoId={atual.contrato.id}
                  sugeridos={sugestoes.filter((x) => x.sugerida).length}
                  produtos={produtosAtivos}
                  inclusao={`${mes}-01`}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left text-xs">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Na fatura</th>
                        <th className="py-1.5 font-medium">Quem é, produto e inclusão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sugestoes.map(({ l, i, sugerida }) => (
                        <tr key={i} className="border-t align-top">
                          <td className="py-1.5 pr-3">
                            {l.nome}
                            <div className="text-muted-foreground text-xs">
                              {moeda(l.mensalidade)}
                              {l.carteirinha ? ` · carteirinha ${l.carteirinha}` : ""}
                              {sugerida ? " · sugerido pelo nome" : " · sem sugestão"}
                            </div>
                          </td>
                          <td className="py-1.5">
                            <IncluirLinhaForm
                              faturaId={fatura.id}
                              contratoId={atual.contrato.id}
                              indice={i}
                              sugerida={sugerida}
                              pessoas={pessoas}
                              produtos={produtosAtivos}
                              inclusao={`${mes}-01`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linhas da fatura</CardTitle>
              <CardDescription>
                Como a IA leu cada linha e com quem ela casou. A linha que não casou, ou casou errado, se casa à mão aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Na fatura</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Mensalidade</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Copart.</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Outros</th>
                    <th className="py-1.5 font-medium">Beneficiário</th>
                  </tr>
                </thead>
                <tbody>
                  {fatura.linhas.map((l, i) => (
                    <tr key={i} className={`border-t align-top ${l.beneficiarioId ? "" : "bg-destructive/5"}`}>
                      <td className="py-1.5 pr-3">
                        {l.nome}
                        {l.carteirinha && <div className="text-muted-foreground text-xs">carteirinha {l.carteirinha}</div>}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(l.mensalidade)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{l.coparticipacao ? moeda(l.coparticipacao) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{l.outros ? moeda(l.outros) : "—"}</td>
                      <td className="py-1.5">
                        {fatura.conferidaEm ? (
                          (l.beneficiarioId && nomes.get(l.beneficiarioId)) || <span className="text-muted-foreground">—</span>
                        ) : (
                          <CasarLinhaForm faturaId={fatura.id} indice={i} atual={l.beneficiarioId} opcoes={opcoes} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {atual.contrato.coparticipacao && comp.copartPorTitular.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coparticipação da fatura</CardTitle>
                <CardDescription>
                  O total de cada titular (com os dependentes), pronto para o desconto do mês. Lançar substitui o valor já lançado na
                  conferência do mês.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <ul className="grid gap-1 text-sm">
                  {[...comp.copartPorTitular].map(([id, v]) => {
                    const lancado = atual.grupos.find((g) => g.titular.id === id)?.coparticipacao ?? 0
                    return (
                      <li key={id} className="flex flex-wrap justify-between gap-2">
                        <span>{titulares.get(id) ?? "(titular)"}</span>
                        <span className="tabular-nums">
                          {moeda(v)}
                          <span className="text-muted-foreground">
                            {" "}
                            {Math.abs(lancado - v) < 0.005 ? "· já lançado" : lancado ? `· lançado hoje ${moeda(lancado)}` : "· não lançado"}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <LancarCopartForm
                  contratoId={atual.contrato.id}
                  competencia={mes}
                  resumo={`${comp.copartPorTitular.size} titular${comp.copartPorTitular.size === 1 ? "" : "es"}, ${moeda(comp.totais.coparticipacao)}`}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conferência da fatura</CardTitle>
              <CardDescription>
                {fatura.conferidaEm
                  ? "Conferida. Para mudar algo (ler de novo ou casar uma linha), desfaça a conferência."
                  : pendentes
                  ? "Resolva ou explique as diferenças (pró-rata, inclusão ou exclusão fora do mês, reajuste) e marque como conferida."
                  : "Tudo confere: marque como conferida."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-3">
              <ConferirFaturaForm faturaId={fatura.id} conferida={Boolean(fatura.conferidaEm)} />
              {!fatura.conferidaEm && <ApagarFaturaBotao faturaId={fatura.id} />}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

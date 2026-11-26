import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarRange, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { funcionariosDaArea } from "@/lib/db/pessoal-area"
import {
  contratosParaVincular,
  dependentesDoCadastro,
  obterContratoSaude,
  ROTULO_MOTIVO_TABELA,
  ROTULO_TIPO_CONTRATACAO,
  type BeneficiarioSaude,
  type RegraCusteioSaude,
  type TabelaSaude,
} from "@/lib/db/plano-saude"
import { avisosTabelaANS, CONDICOES_TITULAR, FAIXAS_ANS, idadeEm, moeda } from "@/lib/plano-saude"

import {
  ApagarContratoBotao,
  ApagarItemBotao,
  BeneficiarioForm,
  ContratoForm,
  ProdutoForm,
  RegraCusteioForm,
  RegraDependenteForm,
  TabelaForm,
} from "../forms"

export const metadata: Metadata = { title: "Contrato do plano de saúde — Confluir" }

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const dataBr = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—")
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())

function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

function Adicionar({ rotulo, aberto, children }: { rotulo: string; aberto?: boolean; children: React.ReactNode }) {
  return (
    <details open={aberto} className="rounded-md border p-3">
      <summary className="text-primary cursor-pointer text-sm font-medium">{rotulo}</summary>
      <div className="pt-3">{children}</div>
    </details>
  )
}

function EditarLink({ href }: { href: string }) {
  return (
    <Button variant="ghost" size="icon-sm" asChild aria-label="Editar" title="Editar">
      <Link href={href}>
        <Pencil />
      </Link>
    </Button>
  )
}

/** "Titular, Cônjuge · ativo · Diretor · 0 a 23 anos" — a quem a regra se aplica. */
function alcance(r: RegraCusteioSaude, produtos: Map<string, string>, pessoas: Map<string, string>): string {
  const partes = [
    r.beneficiarios?.map((b) => (b === "titular" ? "Titular" : b)).join(", "),
    r.condicoes?.map((c) => CONDICOES_TITULAR.find((x) => x.chave === c)?.rotulo.split(" (")[0] ?? c).join(", "),
    r.produtos?.map((p) => produtos.get(p) ?? "produto apagado").join(", "),
    r.cargos?.join(", "),
    r.departamentos?.join(", "),
    r.funcionarios?.map((f) => pessoas.get(f) ?? "pessoa").join(", "),
    r.idadeMin !== null || r.idadeMax !== null ? `${r.idadeMin ?? 0} a ${r.idadeMax ?? "∞"} anos` : null,
  ].filter(Boolean)
  return partes.length ? partes.join(" · ") : "Todos"
}

function pagamento(r: RegraCusteioSaude): string {
  const base = r.modo === "percentual" ? `Entidade paga ${String(r.entidadePercentual ?? 0).replace(".", ",")}%` : `Entidade paga ${moeda(r.entidadeValor)}`
  return [
    base,
    r.entidadeTeto !== null ? `teto ${moeda(r.entidadeTeto)}` : null,
    r.copartFuncionarioPercentual !== null ? `coparticipação: funcionário ${String(r.copartFuncionarioPercentual).replace(".", ",")}%` : null,
    r.copartLimiteMensal !== null ? `limite ${moeda(r.copartLimiteMensal)}/mês` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export default async function ContratoSaudePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; apagado?: string; nova_tabela?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const sp = await searchParams
  const [dados, area, vinculaveis] = await Promise.all([obterContratoSaude(id), funcionariosDaArea(), contratosParaVincular().catch(() => [])])
  if (!dados) notFound()
  const { contrato: c, produtos, tabelas, regras, regrasDependentes, beneficiarios } = dados
  const [editTipo, editId] = (sp.editar ?? "").split(":")
  const aqui = `/painel/pessoal/plano-saude/${id}`
  const hoje = hojeSP()

  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]))
  const nomePessoa = new Map(area.map((f) => [f.usuarioId, f.nome]))
  const cargos = [...new Set(area.map((f) => f.cargo).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const departamentos = [...new Set(area.map((f) => f.departamento).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const titulares = area
    .map((f) => ({ id: f.usuarioId, nome: f.nome, ativo: f.ativo }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"))
  const dependentes = await dependentesDoCadastro(titulares.map((t) => t.id))
  const produtosLista = produtos.map((p) => ({ id: p.id, nome: p.nome }))

  const tabelasDe = (produtoId: string) => tabelas.filter((t) => t.produtoId === produtoId).sort((a, b) => b.inicio.localeCompare(a.inicio))
  const vigenteHoje = (lista: TabelaSaude[]) => lista.find((t) => t.inicio <= hoje && (!t.fim || t.fim >= hoje))

  // Beneficiários por titular: ativos primeiro; excluídos em separado.
  const ativos = beneficiarios.filter((b) => !b.exclusao || b.exclusao >= hoje)
  const excluidos = beneficiarios.filter((b) => b.exclusao && b.exclusao < hoje)
  const porTitular = (lista: BeneficiarioSaude[]) => {
    const m = new Map<string, BeneficiarioSaude[]>()
    for (const b of lista) m.set(b.titularId, [...(m.get(b.titularId) ?? []), b])
    return [...m.values()]
      .map((bs) => bs.sort((a, b) => (a.tipo === "titular" ? -1 : b.tipo === "titular" ? 1 : a.nome.localeCompare(b.nome, "pt-BR"))))
      .sort((a, b) => a[0].titularNome.localeCompare(b[0].titularNome, "pt-BR"))
  }
  const emEdicaoBen = editTipo === "beneficiario" ? beneficiarios.find((b) => b.id === editId) : undefined

  return (
    <>
      <RotuloTrilha valores={{ [c.id]: c.nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/plano-saude">
            <ArrowLeft />
            Plano de saúde
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {c.nome}
              {!c.ativo && <Badge variant="outline">Inativo</Badge>}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {c.operadora} · {ROTULO_TIPO_CONTRATACAO[c.tipoContratacao]}
              {c.mesAniversario ? ` · reajuste anual em ${MESES[c.mesAniversario - 1]}` : ""}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/painel/pessoal/plano-saude/mes">
              <CalendarRange />
              Conferência do mês
            </Link>
          </Button>
        </div>
      </div>

      {(sp.salvo || sp.apagado) && (
        <Alert>
          <AlertDescription>{sp.apagado ? "Registro apagado." : "Salvo."}</AlertDescription>
        </Alert>
      )}

      <nav className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[
          ["contrato", "Contrato"],
          ["produtos", "Produtos"],
          ["tabelas", "Tabelas de preço"],
          ["custeio", "Custeio"],
          ["dependentes", "Dependentes"],
          ["beneficiarios", "Quem está no plano"],
        ].map(([a, r]) => (
          <a key={a} href={`#${a}`} className="hover:text-foreground underline-offset-4 hover:underline">
            {r}
          </a>
        ))}
      </nav>

      <Secao id="contrato" titulo="Contrato">
        {editTipo === "contrato" ? (
          <ContratoForm contrato={c} vinculaveis={vinculaveis} cancelarHref={`${aqui}#contrato`} />
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {[
                ["Registro na ANS", c.registroAnsOperadora ?? "—"],
                ["Vigência", `${dataBr(c.inicio)} a ${c.fim ? dataBr(c.fim) : "em vigor"}`],
                ["Faixa etária muda", c.faixaMuda === "mes_aniversario" ? "no mês do aniversário" : "no mês seguinte ao aniversário"],
                ["Coparticipação", c.coparticipacao ? "Sim" : "Não"],
                ["Contrato em Contratos", vinculaveis.find((v) => v.id === c.contratoId)?.rotulo ?? (c.contratoId ? "Vinculado" : "—")],
                ["Observações", c.observacoes ?? "—"],
              ].map(([r, v]) => (
                <div key={r}>
                  <dt className="text-muted-foreground text-xs">{r}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?editar=contrato#contrato`}>
                  <Pencil />
                  Editar contrato
                </Link>
              </Button>
              {beneficiarios.length === 0 && <ApagarContratoBotao id={c.id} />}
            </div>
          </>
        )}
      </Secao>

      <Secao id="produtos" titulo="Produtos" descricao="Os planos do contrato (Básico, Executivo…). Cada um tem a sua tabela de preço.">
        {produtos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Produto</th>
                  <th className="py-2 pr-3 font-medium">Registro ANS</th>
                  <th className="py-2 pr-3 font-medium">Acomodação</th>
                  <th className="py-2 pr-3 font-medium">Abrangência</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 ${p.ativo ? "" : "text-muted-foreground"}`}>
                    <td className="py-2 pr-3 font-medium">
                      {p.nome}
                      {!p.ativo && " (inativo)"}
                    </td>
                    <td className="py-2 pr-3">{p.registroAns ?? "—"}</td>
                    <td className="py-2 pr-3 capitalize">{p.acomodacao ?? "—"}</td>
                    <td className="py-2 pr-3">{p.abrangencia ?? "—"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <EditarLink href={`${aqui}?editar=produto:${p.id}#produtos`} />
                      <ApagarItemBotao tipo="produto" id={p.id} contratoId={id} pergunta={`Apagar o produto ${p.nome} e as tabelas dele?`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editTipo === "produto" && produtos.some((p) => p.id === editId) ? (
          <ProdutoForm contratoId={id} produto={produtos.find((p) => p.id === editId)} cancelarHref={`${aqui}#produtos`} />
        ) : (
          <Adicionar rotulo="+ Adicionar produto" aberto={produtos.length === 0}>
            <ProdutoForm contratoId={id} />
          </Adicionar>
        )}
      </Secao>

      <Secao
        id="tabelas"
        titulo="Tabelas de preço por faixa etária"
        descricao="As 10 faixas da ANS. Cada reajuste é uma tabela nova, a partir da data em que vale: as antigas ficam, e os meses passados continuam certos."
      >
        {produtos.length === 0 && <p className="text-muted-foreground text-sm">Cadastre um produto primeiro.</p>}
        {produtos.map((p) => {
          const lista = tabelasDe(p.id)
          const atual = vigenteHoje(lista)
          const emEdicao = editTipo === "tabela" ? lista.find((t) => t.id === editId) : undefined
          return (
            <div key={p.id} className="grid gap-3">
              <h3 className="font-medium">{p.nome}</h3>
              {lista.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma tabela.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left text-xs">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-medium">Vigência</th>
                        {FAIXAS_ANS.map((f) => (
                          <th key={f.rotulo} className="py-2 pr-3 text-right font-medium whitespace-nowrap">
                            {f.rotulo}
                          </th>
                        ))}
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((t) => {
                        const avisos = avisosTabelaANS(t.precos)
                        return (
                          <tr key={t.id} className={`border-b align-top last:border-0 ${t === atual ? "" : "text-muted-foreground"}`}>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {dataBr(t.inicio)}
                              {t.fim ? ` a ${dataBr(t.fim)}` : ""}
                              {t === atual && (
                                <Badge variant="success" className="ml-2">
                                  Vigente
                                </Badge>
                              )}
                              <div className="text-xs">
                                {ROTULO_MOTIVO_TABELA[t.motivo] ?? t.motivo}
                                {t.percentual !== null ? ` · ${String(t.percentual).replace(".", ",")}%` : ""}
                              </div>
                              {avisos.length > 0 && <div className="text-warning-fg max-w-xs text-xs whitespace-normal">{avisos.join(" ")}</div>}
                            </td>
                            {t.precos.map((v, i) => (
                              <td key={i} className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                                {moeda(v)}
                              </td>
                            ))}
                            <td className="py-2 text-right whitespace-nowrap">
                              <EditarLink href={`${aqui}?editar=tabela:${t.id}#tabelas`} />
                              <ApagarItemBotao tipo="tabela" id={t.id} contratoId={id} pergunta="Apagar esta tabela de preço?" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {emEdicao ? (
                <TabelaForm produtoId={p.id} tabela={emEdicao} cancelarHref={`${aqui}#tabelas`} />
              ) : (
                <Adicionar rotulo={lista.length ? "+ Nova tabela (reajuste)" : "+ Cadastrar a tabela"} aberto={sp.nova_tabela === p.id}>
                  <TabelaForm produtoId={p.id} base={lista[0]?.precos} />
                </Adicionar>
              )}
            </div>
          )
        })}
      </Secao>

      <Secao
        id="custeio"
        titulo="Regras de custeio"
        descricao="Quanto a entidade paga e quanto é descontado do funcionário. Vale a primeira regra que casa, pela prioridade (menor primeiro): ponha as exceções com prioridade menor que a regra geral."
      >
        {regras.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma regra: sem ela, a conferência do mês não sabe quanto descontar.</p>
        ) : (
          <ul className="divide-y text-sm">
            {regras.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-start justify-between gap-2 py-2 ${r.ativo ? "" : "text-muted-foreground"}`}>
                <div>
                  <p className="font-medium">
                    <span className="text-muted-foreground mr-2 tabular-nums">#{r.prioridade}</span>
                    {r.nome}
                    {!r.ativo && " (inativa)"}
                  </p>
                  <p>{pagamento(r)}</p>
                  <p className="text-muted-foreground text-xs">
                    Para: {alcance(r, nomeProduto, nomePessoa)}
                    {r.inicio || r.fim ? ` · vale ${r.inicio ? `de ${dataBr(r.inicio)}` : ""} ${r.fim ? `até ${dataBr(r.fim)}` : ""}` : ""}
                    {r.clausula ? ` · ${r.clausula}` : ""}
                  </p>
                </div>
                <div className="whitespace-nowrap">
                  <EditarLink href={`${aqui}?editar=regra:${r.id}#custeio`} />
                  <ApagarItemBotao tipo="regra" id={r.id} contratoId={id} pergunta={`Apagar a regra ${r.nome}?`} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {editTipo === "regra" && regras.some((r) => r.id === editId) ? (
          <RegraCusteioForm
            contratoId={id}
            regra={regras.find((r) => r.id === editId)}
            produtos={produtosLista}
            cargos={cargos}
            departamentos={departamentos}
            funcionarios={titulares}
            coparticipacao={c.coparticipacao}
            cancelarHref={`${aqui}#custeio`}
          />
        ) : (
          <Adicionar rotulo="+ Adicionar regra" aberto={regras.length === 0 && produtos.length > 0}>
            <RegraCusteioForm
              contratoId={id}
              produtos={produtosLista}
              cargos={cargos}
              departamentos={departamentos}
              funcionarios={titulares}
              coparticipacao={c.coparticipacao}
            />
          </Adicionar>
        )}
      </Secao>

      <Secao id="dependentes" titulo="Dependentes" descricao="Quem pode entrar no plano e até que idade. Quem cumpre a idade-limite aparece na conferência do mês.">
        {regrasDependentes.length > 0 && (
          <ul className="divide-y text-sm">
            {regrasDependentes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{r.grau}</span>
                  {" — "}
                  {r.permitido
                    ? r.idadeLimite !== null
                      ? `até os ${r.idadeLimite} anos${r.idadeLimiteEstudante !== null ? ` (${r.idadeLimiteEstudante} se estudante)` : ""}`
                      : "sem limite de idade"
                    : "não pode entrar"}
                  {r.observacao ? <span className="text-muted-foreground"> · {r.observacao}</span> : null}
                </div>
                <div className="whitespace-nowrap">
                  <EditarLink href={`${aqui}?editar=regra_dependente:${r.id}#dependentes`} />
                  <ApagarItemBotao tipo="regra_dependente" id={r.id} contratoId={id} pergunta={`Apagar a regra de ${r.grau}?`} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {editTipo === "regra_dependente" && regrasDependentes.some((r) => r.id === editId) ? (
          <RegraDependenteForm
            contratoId={id}
            regra={regrasDependentes.find((r) => r.id === editId)}
            usados={regrasDependentes.map((r) => r.grau)}
            cancelarHref={`${aqui}#dependentes`}
          />
        ) : (
          <Adicionar rotulo="+ Adicionar grau" aberto={regrasDependentes.length === 0}>
            <RegraDependenteForm contratoId={id} usados={regrasDependentes.map((r) => r.grau)} />
          </Adicionar>
        )}
      </Secao>

      <Secao
        id="beneficiarios"
        titulo="Quem está no plano"
        descricao={`${ativos.length} beneficiário${ativos.length === 1 ? "" : "s"} no plano hoje. A idade é a de hoje; a faixa de cada mês está na conferência.`}
      >
        {produtos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Cadastre um produto primeiro.</p>
        ) : (
          <>
            {porTitular(ativos).map((grupo) => (
              <ListaBeneficiarios key={grupo[0].titularId} grupo={grupo} nomeProduto={nomeProduto} aqui={aqui} contratoId={id} hoje={hoje} />
            ))}
            {emEdicaoBen ? (
              <BeneficiarioForm
                produtos={produtosLista}
                titulares={titulares}
                dependentes={dependentes}
                beneficiario={emEdicaoBen}
                cancelarHref={`${aqui}#beneficiarios`}
              />
            ) : (
              <Adicionar rotulo="+ Incluir no plano" aberto={ativos.length === 0}>
                <BeneficiarioForm produtos={produtosLista.filter((p) => produtos.find((x) => x.id === p.id)?.ativo)} titulares={titulares} dependentes={dependentes} />
              </Adicionar>
            )}
            {excluidos.length > 0 && (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Excluídos do plano ({excluidos.length})</summary>
                <div className="grid gap-3 pt-3">
                  {porTitular(excluidos).map((grupo) => (
                    <ListaBeneficiarios key={grupo[0].titularId} grupo={grupo} nomeProduto={nomeProduto} aqui={aqui} contratoId={id} hoje={hoje} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </Secao>
    </>
  )
}

function ListaBeneficiarios({
  grupo,
  nomeProduto,
  aqui,
  contratoId,
  hoje,
}: {
  grupo: BeneficiarioSaude[]
  nomeProduto: Map<string, string>
  aqui: string
  contratoId: string
  hoje: string
}) {
  return (
    <div className="rounded-md border">
      <p className="bg-muted/50 px-3 py-1.5 text-sm font-medium">{grupo[0].titularNome}</p>
      <ul className="divide-y text-sm">
        {grupo.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
            <div>
              <span className={b.tipo === "titular" ? "font-medium" : ""}>{b.nome}</span>
              <span className="text-muted-foreground">
                {" · "}
                {b.tipo === "titular" ? (CONDICOES_TITULAR.find((c) => c.chave === b.condicao)?.rotulo.split(" (")[0] ?? "Titular") : b.grau}
                {b.nascimento ? ` · ${idadeEm(b.nascimento, hoje)} anos` : " · sem nascimento"}
                {` · ${nomeProduto.get(b.produtoId) ?? "produto"}`}
                {b.carteirinha ? ` · cart. ${b.carteirinha}` : ""}
                {` · desde ${dataBr(b.inclusao)}`}
                {b.exclusao ? ` · excluído em ${dataBr(b.exclusao)}${b.motivoExclusao ? ` (${b.motivoExclusao})` : ""}` : ""}
                {b.estudanteAte ? ` · estudante até ${dataBr(b.estudanteAte)}` : ""}
              </span>
            </div>
            <div className="whitespace-nowrap">
              <EditarLink href={`${aqui}?editar=beneficiario:${b.id}#beneficiarios`} />
              <ApagarItemBotao
                tipo="beneficiario"
                id={b.id}
                contratoId={contratoId}
                pergunta={`Apagar o registro de ${b.nome}? Para tirar do plano, edite e informe a data de exclusão: assim o histórico fica.`}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

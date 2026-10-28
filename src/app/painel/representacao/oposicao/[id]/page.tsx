import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ExportarXlsx } from "@/components/exportar-xlsx"
import { Paginacao } from "@/components/paginacao"
import { podeNaOposicao, regrasDaCampanha, requireOposicao } from "@/lib/db/oposicao-regras"
import {
  fonteIdsDaCampanha,
  listarOpositores,
  obterCampanha,
  opcoesFontes,
} from "@/lib/db/oposicao"
import { previsaoEncerramentoSemCarta } from "@/lib/db/oposicao-gestao"
import { formatarData } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"
import {
  decisoesFaltando,
  DECISOES_JURIDICAS,
  rotuloOpcao,
  MODOS_FORMALIZACAO,
  ROTULO_SITUACAO_OPOSITOR,
  SITUACOES_OPOSITOR,
  type SituacaoOpositor,
} from "@/lib/oposicao-constantes"

import { EncerrarSemCarta, ListaOpositores } from "../gestao-forms"

import {
  AdicionarPergunta,
  BotaoExcluirPergunta,
  CampanhaForm,
} from "../oposicao-forms"

export const metadata: Metadata = {
  title: "Campanha de oposição — Confluir",
}

export default async function CampanhaOposicaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    situacao?: string
    busca?: string
    pagina?: string
    porPagina?: string
    editar?: string
    salvo?: string
    fonte?: string
    fila?: string
  }>
}) {
  const { id } = await params
  const sessao = await requireOposicao("consultar", id)
  const regrasCampanha = await regrasDaCampanha(id)
  const podeConfigurar = podeNaOposicao(sessao.permissoes, "configurar", regrasCampanha.efetivas.segregacao)
  const podeAvaliar = podeNaOposicao(sessao.permissoes, "avaliar", regrasCampanha.efetivas.segregacao)
  const faltamDecisoes = decisoesFaltando(regrasCampanha.efetivas)
  const brutos = await searchParams
  const campanha = await obterCampanha(id)
  if (!campanha) notFound()

  const editando = brutos.editar === "1" && podeConfigurar
  // As fontes servem ao formulário de edição e ao filtro da lista.
  const [fontes, fonteIds, encerramento] = await Promise.all([
    opcoesFontes(),
    fonteIdsDaCampanha(id),
    previsaoEncerramentoSemCarta(id),
  ])
  const fontesDaCampanha = fontes.filter((f) => fonteIds.includes(f.id))
  const fonte = brutos.fonte === "sem" || fonteIds.includes(brutos.fonte ?? "") ? (brutos.fonte as string) : ""

  const situacao = SITUACOES_OPOSITOR.some((s) => s.chave === brutos.situacao)
    ? (brutos.situacao as SituacaoOpositor)
    : "todas"
  const busca = (brutos.busca ?? "").trim()
  const { pagina, porPagina } = lerPaginacao(brutos, 50)

  const lista = await listarOpositores({
    campanhaId: id,
    situacao,
    busca,
    fonteId: fonte || undefined,
    pagina,
    porPagina,
  })

  const modo = MODOS_FORMALIZACAO.find(
    (m) => m.chave === campanha.modo_formalizacao
  )
  const aqui = `/painel/representacao/oposicao/${id}`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {campanha.nome ?? campanha.codigo ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Prazo {formatarData(campanha.prazo_inicio)} –{" "}
          {formatarData(campanha.prazo_fim)}
          {campanha.fontes.length > 0 && <> · {campanha.fontes.join(", ")}</>}
        </p>
      </div>

      {brutos.fila === "vazia" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Não há mais oposições não avaliadas nesta campanha.</AlertDescription>
        </Alert>
      )}

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Campanha salva.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados da campanha</CardTitle>
            {!editando && podeConfigurar && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando ? (
            <CampanhaForm
              campanha={campanha}
              fontes={fontes}
              fonteIds={fonteIds}
              aoCancelarHref={aqui}
              regrasEntidade={regrasCampanha.entidade}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Contribuição</dt>
                <dd className="mt-0.5 text-sm">
                  {campanha.detalhe_desconto ?? "—"}
                </dd>
              </div>
              <Campo rotulo="Código" valor={campanha.codigo} />
              <Campo rotulo="Formalização" valor={modo?.rotulo ?? null} />
              <Campo
                rotulo="Fontes pagadoras"
                valor={campanha.fontes.join(", ") || null}
              />
              <Campo
                rotulo="Perguntas do questionário"
                valor={String(campanha.perguntas.length)}
              />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className={faltamDecisoes.length ? "border-warning/50" : undefined}>
        <CardHeader>
          <CardTitle className="text-base">Decisões jurídicas</CardTitle>
          <CardDescription>
            O que vale nesta campanha. “Padrão da entidade” segue{" "}
            <Link href="/painel/representacao/oposicao/decisoes" className="text-primary hover:underline">
              Decisões jurídicas da entidade
            </Link>
            ; ao abrir a campanha, as decisões vigentes ficam gravadas nela.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {faltamDecisoes.length > 0 && (
            <Alert variant="warning">
              <AlertDescription>
                A campanha não pode ser aberta (nem receber oposições) sem estas decisões: {faltamDecisoes.join("; ")}.
                Defina na campanha (Editar) ou no padrão da entidade.
              </AlertDescription>
            </Alert>
          )}
          <dl className="grid gap-3 sm:grid-cols-2">
            {DECISOES_JURIDICAS.map((d) => {
              const propria = regrasCampanha.propria[d.chave]
              const vale = regrasCampanha.efetivas[d.chave]
              return (
                <div key={d.chave}>
                  <dt className="text-muted-foreground text-xs">{d.rotulo}</dt>
                  <dd className="mt-0.5 text-sm">
                    {vale ? rotuloOpcao(d.chave, vale) : <span className="text-warning-fg font-medium">Não decidido</span>}
                    {vale && !propria && <span className="text-muted-foreground"> · padrão da entidade</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questionário</CardTitle>
          <CardDescription>
            Perguntas respondidas pelo trabalhador ao se opor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {campanha.perguntas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma pergunta cadastrada.
            </p>
          ) : (
            <ul className="grid gap-2">
              {campanha.perguntas.map((p, i) => (
                <li
                  key={p.id}
                  className="border-border flex items-start justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <span>
                    <span className="text-muted-foreground mr-1 tabular-nums">
                      {i + 1}.
                    </span>
                    {p.pergunta ?? "—"}
                  </span>
                  {podeConfigurar && <BotaoExcluirPergunta perguntaId={p.id} campanhaId={id} />}
                </li>
              ))}
            </ul>
          )}
          {podeConfigurar && <AdicionarPergunta campanhaId={id} />}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SITUACOES_OPOSITOR.map((s) => (
          <Link key={s.chave} href={`${aqui}?situacao=${s.chave}`}>
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-semibold tabular-nums">
                  {campanha.contagem[s.chave].toLocaleString("pt-BR")}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {s.rotulo}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {podeAvaliar && encerramento.quantidade > 0 && !encerramento.prazoAberto && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">Carta não enviada no prazo</CardTitle>
            <CardDescription>
              {encerramento.quantidade.toLocaleString("pt-BR")} oposição(ões) ainda aguardam a carta assinada e o prazo
              {encerramento.prazoFim && <> terminou em {formatarData(encerramento.prazoFim)}</>}. Encerre-as como
              “carta não enviada” para fechar a lista ao empregador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EncerrarSemCarta campanhaId={id} quantidade={encerramento.quantidade} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Opositores</CardTitle>
              <CardDescription>
                {lista.total.toLocaleString("pt-BR")}
                {situacao !== "todas" ? (
                  <> · {ROTULO_SITUACAO_OPOSITOR[situacao]}</>
                ) : (
                  <> oposições · sem os {campanha.contagem.desistente.toLocaleString("pt-BR")} desistentes</>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}/empregadores`}>
                  <Building2 />
                  Relação por empregador
                </Link>
              </Button>
              <ExportarXlsx href={`${aqui}/exportar`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="mb-4 flex flex-wrap items-center gap-2" action={aqui}>
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Nome, CPF, matrícula, e-mail ou protocolo"
              className="border-input bg-background h-9 w-72 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none"
            />
            <select
              name="situacao"
              defaultValue={situacao}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
            >
              <option value="todas">Todas (sem desistentes)</option>
              {SITUACOES_OPOSITOR.map((s) => (
                <option key={s.chave} value={s.chave}>
                  {s.rotulo}
                </option>
              ))}
            </select>
            {fontesDaCampanha.length > 0 && (
              <select
                name="fonte"
                defaultValue={fonte}
                className="border-input bg-background h-9 max-w-56 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
              >
                <option value="">Todas as fontes</option>
                {fontesDaCampanha.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
                <option value="sem">Sem fonte informada</option>
              </select>
            )}
            <Button type="submit" variant="outline" size="sm">
              Filtrar
            </Button>
          </form>

          <ListaOpositores
            // O resultado do lote não vale para outro filtro.
            key={`${situacao}|${busca}|${fonte}|${lista.pagina}`}
            campanhaId={id}
            linhas={lista.linhas}
            total={lista.total}
            filtros={{ situacao, busca, fonte }}
            podeAvaliar={podeAvaliar}
          />
          <div className="mt-4">
            <Paginacao
              total={lista.total}
              pagina={lista.pagina}
              totalPaginas={lista.totalPaginas}
              porPagina={lista.porPagina}
              padrao={50}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}

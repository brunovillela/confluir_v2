import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, CalendarDays, CheckCircle2, Lock, Unlock } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { AbasLink } from "@/components/pessoal/abas-link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { AJUSTE_POR_CHAVE, descreverValor, valor } from "@/lib/congressos/config"
import { gerarSlug, resumoDireitos } from "@/lib/congressos/regras"
import {
  listarPapeis,
  listarParticipantes,
  listarPrograma,
  listarUnidades,
  obterCongresso,
  opcoesNovoCongresso,
  painelDoCongresso,
  ROTULO_ORIGEM_PARTICIPANTE,
  SITUACOES_CONGRESSO,
  SITUACOES_PARTICIPANTE,
  TIPOS_SESSAO,
  TIPOS_UNIDADE,
  versoesDaConfig,
  type Congresso,
} from "@/lib/db/congressos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { painelDoDia } from "@/lib/db/congressos-dia"
import { dadosDaRelatoria, ROTULO_FUNCAO, ROTULO_SITUACAO_PROPOSTA, type SituacaoProposta } from "@/lib/db/congressos-relatoria"
import { AplicarGrupos, ColarPropostas } from "../relatoria-componentes"
import { listarMocoes, ROTULO_SITUACAO_MOCAO } from "@/lib/db/congressos-mocoes"
import { NovaMocaoPainel, ProgressoLimiar } from "../mocoes-componentes"
import { AtualizarSozinho, CrachasEmLote, DesfazerTroca } from "../dia-componentes"
import { origemAtual } from "@/lib/tenant-url"

import { regimentoAprovadoAction } from "../actions"
import {
  AplicarOrdem,
  ConfiguracaoForm,
  DadosCongressoForm,
  EditarParticipante,
  EditarUnidade,
  EixoForm,
  GerarLink,
  GrupoForm,
  ImportarLista,
  PaginaPublicaForm,
  ImportarNatos,
  NovoParticipante,
  PapelForm,
  RemoverDoPrograma,
  RemoverPapel,
  SessaoForm,
  SituacaoForm,
  UnidadeForm,
} from "../formularios"

export const metadata: Metadata = { title: "Congresso — Confluir" }

const ABAS = ["geral", "dia", "relatoria", "mocoes", "configuracao", "papeis", "delegacao", "programa", "participantes"] as const
type Aba = (typeof ABAS)[number]
const ROTULO_ABA: Record<Aba, string> = {
  geral: "Visão geral",
  dia: "Dia do evento",
  relatoria: "Relatoria",
  mocoes: "Moções",
  configuracao: "Configuração",
  papeis: "Papéis e direitos",
  delegacao: "Delegações",
  programa: "Programa e grupos",
  participantes: "Participantes",
}

const ROTULO_SITUACAO = new Map(SITUACOES_CONGRESSO.map((s) => [s.valor, s.rotulo]))
const ROTULO_PART = new Map(SITUACOES_PARTICIPANTE.map((s) => [s.valor, s.rotulo]))

export default async function CongressoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string; papel?: string; unidade?: string; situacao?: string; busca?: string; sessao?: string }>
}) {
  const sessao = await requirePermissao("congressos", ["congressos_gestao", "congressos_credenciamento", "congressos_relatoria"])
  const gestor = podeAcessar(sessao.permissoes, "congressos_gestao")
  const operador = gestor || podeAcessar(sessao.permissoes, "congressos_credenciamento")
  const relator = gestor || podeAcessar(sessao.permissoes, "congressos_relatoria")
  const { id } = await params
  const sp = await searchParams
  const c = await obterCongresso(id)
  if (!c) notFound()
  const aba: Aba = (ABAS as readonly string[]).includes(sp.aba ?? "") ? (sp.aba as Aba) : "geral"
  const base = `/painel/representacao/congressos/${id}`
  const travado = !!c.regimentoAprovadoEm && valor(c.config, "regimento.trava") === "trava"

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {c.edicao ? `${c.edicao}º ` : ""}
            {c.nome}
          </h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{ROTULO_SITUACAO.get(c.situacao)}</Badge>
            {c.modo === "participa" && <Badge variant="outline">A entidade participa</Badge>}
            {c.inicio ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {formatarData(c.inicio)}
                {c.termino ? ` a ${formatarData(c.termino)}` : ""}
                {c.local ? ` · ${c.local}` : ""}
              </span>
            ) : (
              <span>Sem evento ligado</span>
            )}
            {c.tema && <span>· {c.tema}</span>}
          </p>
        </div>
        {c.eventoId && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/painel/eventos/${c.eventoId}`}>Abrir o evento</Link>
          </Button>
        )}
      </div>

      <AbasLink
        rotulo="Seções do congresso"
        abas={ABAS.map((a) => ({
          href: a === "geral" ? base : `${base}?aba=${a}`,
          rotulo: ROTULO_ABA[a],
          ativo: a === aba,
          contador: a === "participantes" ? c.participantes : undefined,
        }))}
      />

      {aba === "geral" && <AbaGeral c={c} gestor={gestor} />}
      {aba === "dia" && <AbaDia c={c} gestor={gestor} operador={operador} sessaoId={sp.sessao ?? null} />}
      {aba === "relatoria" && <AbaRelatoria c={c} relator={relator} />}
      {aba === "mocoes" && <AbaMocoes c={c} relator={relator} />}
      {aba === "configuracao" && <AbaConfiguracao c={c} gestor={gestor} travado={travado} />}
      {aba === "papeis" && <AbaPapeis c={c} gestor={gestor} />}
      {aba === "delegacao" && <AbaDelegacao c={c} gestor={gestor} />}
      {aba === "programa" && <AbaPrograma c={c} gestor={gestor} />}
      {aba === "participantes" && <AbaParticipantes c={c} gestor={gestor} sp={sp} />}
    </>
  )
}

// ── Visão geral ──────────────────────────────────────────────────────────────

async function AbaGeral({ c, gestor }: { c: Congresso; gestor: boolean }) {
  const [painel, opcoes, papeis, origem] = await Promise.all([
    painelDoCongresso(c),
    gestor ? opcoesNovoCongresso() : null,
    listarPapeis(c.id),
    origemAtual(),
  ])
  const base = `/painel/representacao/congressos/${c.id}`
  const resumo = [
    "delegacao.forma",
    "delegacao.calculo_vagas",
    "delegacao.natos",
    "elegibilidade.filiacao",
    "programa.tem_grupos",
    "cotas.genero_minimo",
  ].map((k) => {
    const a = AJUSTE_POR_CHAVE.get(k)!
    return { rotulo: a.rotulo, texto: descreverValor(a, valor(c.config, k)) }
  })

  return (
    <div className="grid gap-6">
      {painel.alertas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              Antes do evento
            </CardTitle>
            <CardDescription>Contradições e lacunas encontradas na configuração e nos cadastros.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {painel.alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Badge variant={a.nivel === "erro" ? "destructive" : "warning"} className="shrink-0">
                    {a.nivel === "erro" ? "Corrigir" : "Atenção"}
                  </Badge>
                  {a.mensagem}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          Nenhuma contradição encontrada na configuração.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Participantes por papel</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {painel.porPapel.map((p) => (
              <div key={p.papel} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-full border" style={{ background: p.cor ?? "transparent" }} />
                  {p.papel}
                </span>
                <span className="tabular-nums">{p.total}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Situação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {SITUACOES_PARTICIPANTE.map((s) => (
              <Link
                key={s.valor}
                href={`${base}?aba=participantes&situacao=${s.valor}`}
                className="flex items-center justify-between gap-2 hover:underline"
              >
                {s.rotulo}
                <span className="tabular-nums">{painel.porSituacao[s.valor]}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Regras principais</CardTitle>
            <CardDescription>
              Versão {c.configVersao} da configuração.{" "}
              <Link href={`${base}?aba=configuracao`} className="underline underline-offset-2">
                Ajustar
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {resumo.map((r) => (
              <div key={r.rotulo}>
                <span className="text-muted-foreground">{r.rotulo}:</span> {r.texto}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {painel.elegibilidade.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Delegados a conferir</CardTitle>
            <CardDescription>
              Não atendem à exigência de filiação da configuração. A comissão decide; há exceções previstas em regimento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {painel.elegibilidade.slice(0, 30).map((e) => (
                <li key={e.participanteId}>
                  <span className="font-medium">{e.nome}</span> — {e.motivo}
                </li>
              ))}
              {painel.elegibilidade.length > 30 && <li className="text-muted-foreground">e mais {painel.elegibilidade.length - 30}.</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      {gestor && (
        <Card>
          <CardHeader>
            <CardTitle>Página pública de inscrição</CardTitle>
            <CardDescription>
              Substitui o formulário avulso: a pessoa se inscreve, a regra de vagas é aplicada na hora e ela recebe um link
              pessoal para acompanhar a situação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaginaPublicaForm
              congressoId={c.id}
              slug={c.slug}
              aberta={c.inscricaoPublica}
              sugestao={gerarSlug(`${c.edicao ? `${c.edicao}-` : ""}${c.nome}`)}
              origem={origem}
              papeisPublicos={papeis.filter((p) => p.inscricaoPublica).map((p) => p.nome)}
            />
          </CardContent>
        </Card>
      )}

      {gestor && opcoes && (
        <Card>
          <CardHeader>
            <CardTitle>Dados do congresso</CardTitle>
            <CardDescription>Nome, situação, evento e etapas do processo.</CardDescription>
          </CardHeader>
          <CardContent>
            <DadosCongressoForm
              congresso={c}
              eventos={opcoes.eventos}
              congressos={opcoes.congressos}
              situacoes={SITUACOES_CONGRESSO}
            />
          </CardContent>
        </Card>
      )}
      {(c.etapaAnteriorNome || c.etapaSeguinteNome) && !gestor && (
        <p className="text-muted-foreground text-sm">
          {c.etapaAnteriorNome && <>Etapa anterior: {c.etapaAnteriorNome}. </>}
          {c.etapaSeguinteNome && <>Etapa seguinte: {c.etapaSeguinteNome}.</>}
        </p>
      )}
    </div>
  )
}

// ── Dia do evento ────────────────────────────────────────────────────────────

async function AbaDia({ c, gestor, operador, sessaoId }: { c: Congresso; gestor: boolean; operador: boolean; sessaoId: string | null }) {
  const [painel, programa] = await Promise.all([painelDoDia(c, sessaoId), listarPrograma(c.id)])
  const base = `/painel/representacao/congressos/${c.id}`
  const q = painel.quorum
  return (
    <div className="grid gap-4">
      <AtualizarSozinho />
      {operador && (
        <div className="flex flex-wrap items-start gap-2">
          <Button asChild>
            <Link href={`${base}/credenciamento`}>Mesa de credenciamento</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${base}/porta${painel.sessao ? `?sessao=${painel.sessao.id}` : ""}`}>Presença na sessão</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${base}/contingencia`} target="_blank">
              Lista de contingência
            </Link>
          </Button>
          {gestor && <CrachasEmLote congressoId={c.id} />}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Credenciamento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <div className="text-3xl font-semibold tabular-nums">
              {painel.credenciados}
              <span className="text-muted-foreground text-base font-normal"> de {painel.inscritosConfirmados}</span>
            </div>
            <div className="text-muted-foreground">confirmados credenciados{painel.aDistancia ? `, ${painel.aDistancia} a distância` : ""}</div>
            <div>
              <span className="font-medium tabular-nums">{painel.emExercicio}</span> com direito a voto agora
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{painel.sessao ? painel.sessao.titulo : "Sem sessões"}</CardTitle>
            <CardDescription>
              {painel.sessao?.inicio ? formatarDataHora(painel.sessao.inicio) : "Cadastre as sessões no programa."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <div className="text-3xl font-semibold tabular-nums">{painel.presentesNaSessao}</div>
            <div className="text-muted-foreground">presentes agora, {painel.presentesVotantes} com voto</div>
            {programa.sessoes.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {programa.sessoes.map((s) => (
                  <Link
                    key={s.id}
                    href={`${base}?aba=dia&sessao=${s.id}`}
                    className={`rounded border px-1.5 py-0.5 text-xs ${s.id === painel.sessao?.id ? "border-primary font-medium" : "text-muted-foreground"}`}
                  >
                    {s.titulo}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quórum</CardTitle>
            <CardDescription>Sobre quem tem direito a voto agora ({q.base}).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {q.exigido === null ? (
              <div className="text-muted-foreground">A configuração não exige quórum de instalação.</div>
            ) : (
              <>
                <div className={`text-3xl font-semibold tabular-nums ${q.atingido ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {q.presentes} / {q.exigido}
                </div>
                <div>{q.atingido ? "Quórum atingido." : `Faltam ${q.exigido - q.presentes} para o quórum.`}</div>
              </>
            )}
            <div className="text-muted-foreground">{q.percentual}% dos votantes na sessão</div>
          </CardContent>
        </Card>
      </div>
      {painel.porBase.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Por base</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Base</TableHead>
                  <TableHead className="text-right">Confirmados</TableHead>
                  <TableHead className="text-right">Credenciados</TableHead>
                  <TableHead className="text-right">Com voto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {painel.porBase.map((b) => (
                  <TableRow key={b.nome}>
                    <TableCell className="font-medium">{b.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.confirmados}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.credenciados}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.emExercicio}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Trocas de titular por suplente</CardTitle>
          <CardDescription>Registradas na mesa de credenciamento, com quem autorizou.</CardDescription>
        </CardHeader>
        <CardContent>
          {painel.trocas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma troca.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {painel.trocas.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{t.suplente}</span> no lugar de <span className="font-medium">{t.titular}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatarDataHora(t.quando)}
                      {t.autorizadoPor ? ` · autorizado por ${t.autorizadoPor}` : ""}
                    </span>
                  </span>
                  {operador && <DesfazerTroca congressoId={c.id} trocaId={t.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Configuração ─────────────────────────────────────────────────────────────

async function AbaConfiguracao({ c, gestor, travado }: { c: Congresso; gestor: boolean; travado: boolean }) {
  const versoes = await versoesDaConfig(c.id)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {c.regimentoAprovadoEm ? <Lock className="size-4" /> : <Unlock className="size-4" />}
              {c.regimentoAprovadoEm ? `Regimento aprovado em ${formatarDataHora(c.regimentoAprovadoEm)}` : "Regimento ainda não aprovado"}
            </CardTitle>
            <CardDescription>
              {c.regimentoAprovadoEm
                ? travado
                  ? "Mudanças agora exigem registrar a deliberação que as autorizou."
                  : "A configuração permite ajustes da comissão mesmo depois da aprovação."
                : "Enquanto não for aprovado, a comissão ajusta livremente. Cada gravação vira uma versão."}
            </CardDescription>
          </CardHeader>
          {gestor && (
            <CardContent>
              <form action={regimentoAprovadoAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="aprovado" value={c.regimentoAprovadoEm ? "nao" : "sim"} />
                <Button type="submit" variant="outline" size="sm">
                  {c.regimentoAprovadoEm ? "Desfazer a marcação de aprovado" : "Marcar o regimento como aprovado agora"}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
        <ConfiguracaoForm congressoId={c.id} config={c.config} travado={travado} podeEditar={gestor} />
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Versões</CardTitle>
          <CardDescription>Quem mudou, quando e o quê.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {versoes.map((v) => (
            <div key={v.versao} className="grid gap-0.5">
              <div className="font-medium">
                Versão {v.versao}
                <span className="text-muted-foreground font-normal"> · {formatarDataHora(v.createdAt)}</span>
              </div>
              {v.autor && <div className="text-muted-foreground text-xs">{v.autor}</div>}
              {v.motivo && <div className="text-xs">{v.motivo}</div>}
              {v.deliberacao && <div className="text-xs italic">Deliberação: {v.deliberacao}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Papéis ───────────────────────────────────────────────────────────────────

async function AbaPapeis({ c, gestor }: { c: Congresso; gestor: boolean }) {
  const papeis = await listarPapeis(c.id)
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Cada papel tem a sua matriz de direitos. O resumo em linguagem clara aparece para a pessoa e no caderno do participante.
      </p>
      {papeis.map((p) => (
        <div key={p.id} className="grid gap-1">
          <PapelForm congressoId={c.id} papel={p} podeEditar={gestor} />
          {gestor && (
            <div className="justify-self-end">
              <RemoverPapel congressoId={c.id} id={p.id} nome={p.nome} />
            </div>
          )}
        </div>
      ))}
      <div>
        <PapelForm congressoId={c.id} podeEditar={gestor} />
      </div>
    </div>
  )
}

// ── Delegações ───────────────────────────────────────────────────────────────

async function AbaDelegacao({ c, gestor }: { c: Congresso; gestor: boolean }) {
  const painel = await painelDoCongresso(c)
  const calculo = valor<string>(c.config, "delegacao.calculo_vagas")
  const forma = valor<string>(c.config, "delegacao.forma")
  const tipoPadrao = painel.unidades[0]?.unidade.tipo ?? "base"
  const formaTexto = descreverValor(AJUSTE_POR_CHAVE.get("delegacao.forma")!, forma)
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Bases, entidades e segmentos</CardTitle>
          <CardDescription>
            {formaTexto}.{" "}
            {calculo === "coeficiente"
              ? "As vagas são calculadas pelo número de sócios."
              : calculo === "fixo"
                ? "Cada base tem o seu limite de delegados."
                : "Sem limite de delegados por base."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {painel.unidades.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Vagas</TableHead>
                    <TableHead className="text-right">Delegados</TableHead>
                    <TableHead className="text-right">Espera</TableHead>
                    <TableHead className="text-right">Natos</TableHead>
                    {painel.unidades.some((u) => u.cota) && <TableHead>Cota</TableHead>}
                    {gestor && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {painel.unidades.map((l) => (
                    <TableRow key={l.unidade.id}>
                      <TableCell>
                        <span className="font-medium">{l.unidade.nome}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {TIPOS_UNIDADE.find((t) => t.valor === l.unidade.tipo)?.rotulo}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{l.explicacao}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${l.vagas !== null && l.delegados > l.vagas ? "text-destructive font-medium" : ""}`}
                      >
                        {l.delegados}
                        {l.vagas !== null ? ` / ${l.vagas}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.listaEspera || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.natos || "—"}</TableCell>
                      {painel.unidades.some((u) => u.cota) && (
                        <TableCell className={`text-xs ${l.cotaOk === false ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {l.cota ?? "—"}
                        </TableCell>
                      )}
                      {gestor && (
                        <TableCell className="text-right">
                          <EditarUnidade
                            congressoId={c.id}
                            unidade={l.unidade}
                            tipoPadrao={tipoPadrao}
                            tipos={TIPOS_UNIDADE}
                            mostraLimite={calculo === "fixo"}
                            mostraSocios={calculo === "coeficiente"}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {painel.semBase > 0 && (
            <p className="text-muted-foreground text-sm">{painel.semBase} delegado(s) sem base: ficam fora do limite e das cotas por base.</p>
          )}
          {painel.cotaTotal && (
            <Alert variant={painel.cotaTotal.ok ? "default" : "destructive"}>
              <AlertDescription>{painel.cotaTotal.mensagem}</AlertDescription>
            </Alert>
          )}
          {gestor && (
            <div className="rounded-lg border p-4">
              <UnidadeForm
                congressoId={c.id}
                tipoPadrao={tipoPadrao}
                tipos={TIPOS_UNIDADE}
                mostraLimite={calculo === "fixo"}
                mostraSocios={calculo === "coeficiente"}
              />
            </div>
          )}
          {gestor && forma === "ordem_inscricao" && painel.unidades.length > 0 && (
            <div className="grid gap-1">
              <AplicarOrdem congressoId={c.id} />
              <p className="text-muted-foreground text-xs">
                Confirma quem está dentro do limite de cada base, pela hora de inscrição, e põe o restante na lista de espera.
                Cancelamentos liberam a vaga para o próximo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Programa ─────────────────────────────────────────────────────────────────

async function AbaPrograma({ c, gestor }: { c: Congresso; gestor: boolean }) {
  const [{ eixos, grupos, sessoes }, participantes] = await Promise.all([listarPrograma(c.id), listarParticipantes(c.id)])
  const temGrupos = valor(c.config, "programa.tem_grupos") === true
  const ocupacao = new Map<string, number>()
  for (const p of participantes) {
    if (p.grupoId && p.situacao !== "cancelado" && p.situacao !== "recusado") ocupacao.set(p.grupoId, (ocupacao.get(p.grupoId) ?? 0) + 1)
  }
  const nomeEixo = new Map(eixos.map((e) => [e.id, e.nome]))
  const nomeGrupo = new Map(grupos.map((g) => [g.id, g.nome]))
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Eixos temáticos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {eixos.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {eixos.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  {e.nome}
                  {gestor && <RemoverDoPrograma congressoId={c.id} tabela="congresso_eixos" id={e.id} nome={e.nome} />}
                </li>
              ))}
            </ul>
          )}
          {gestor && <EixoForm congressoId={c.id} />}
        </CardContent>
      </Card>

      {temGrupos ? (
        <Card>
          <CardHeader>
            <CardTitle>Grupos de trabalho</CardTitle>
            <CardDescription>
              {descreverValor(AJUSTE_POR_CHAVE.get("programa.entrada_grupo")!, valor(c.config, "programa.entrada_grupo"))}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {grupos.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Eixo</TableHead>
                    <TableHead>Sala</TableHead>
                    <TableHead className="text-right">Inscritos</TableHead>
                    {gestor && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{g.eixoId ? nomeEixo.get(g.eixoId) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{g.sala ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ocupacao.get(g.id) ?? 0}
                        {g.vagas !== null ? ` / ${g.vagas}` : ""}
                      </TableCell>
                      {gestor && (
                        <TableCell className="text-right">
                          <RemoverDoPrograma congressoId={c.id} tabela="congresso_grupos" id={g.id} nome={g.nome} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {gestor && <GrupoForm congressoId={c.id} eixos={eixos} />}
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          A configuração diz que este congresso não tem grupos de trabalho.{" "}
          <Link href={`/painel/representacao/congressos/${c.id}?aba=configuracao#secao-programa`} className="underline underline-offset-2">
            Mudar
          </Link>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sessões</CardTitle>
          <CardDescription>O programa do evento. A presença será registrada por sessão.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {sessoes.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Sessão</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Local</TableHead>
                  {gestor && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {s.inicio ? formatarDataHora(s.inicio) : "—"}
                      {s.fim ? ` – ${formatarDataHora(s.fim).slice(-5)}` : ""}
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.titulo}
                      {s.grupoId && <span className="text-muted-foreground ml-1 text-xs">({nomeGrupo.get(s.grupoId)})</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{TIPOS_SESSAO.find((t) => t.valor === s.tipo)?.rotulo}</TableCell>
                    <TableCell className="text-muted-foreground">{s.local ?? "—"}</TableCell>
                    {gestor && (
                      <TableCell className="text-right">
                        <RemoverDoPrograma congressoId={c.id} tabela="congresso_sessoes" id={s.id} nome={s.titulo} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {gestor && <SessaoForm congressoId={c.id} tipos={TIPOS_SESSAO} grupos={grupos} />}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Participantes ────────────────────────────────────────────────────────────

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

async function AbaParticipantes({
  c,
  gestor,
  sp,
}: {
  c: Congresso
  gestor: boolean
  sp: { papel?: string; unidade?: string; situacao?: string; busca?: string }
}) {
  const [papeis, unidades, programa, participantes] = await Promise.all([
    listarPapeis(c.id),
    listarUnidades(c.id),
    listarPrograma(c.id),
    listarParticipantes(c.id),
  ])
  const papelPorId = new Map(papeis.map((p) => [p.id, p]))
  const unidadePorId = new Map(unidades.map((u) => [u.id, u]))
  const nomePorId = new Map(participantes.map((p) => [p.id, p.nomeSocial ?? p.nome]))
  const ocupacao = new Map<string, number>()
  for (const p of participantes) {
    if (p.grupoId && p.situacao !== "cancelado" && p.situacao !== "recusado") ocupacao.set(p.grupoId, (ocupacao.get(p.grupoId) ?? 0) + 1)
  }
  const opcoes = {
    papeis: papeis.map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria })),
    unidades: unidades.map((u) => ({ id: u.id, nome: u.nome })),
    grupos: programa.grupos.map((g) => ({ id: g.id, nome: g.nome, vagas: g.vagas, ocupadas: ocupacao.get(g.id) ?? 0 })),
    titulares: participantes
      .filter((p) => {
        const cat = p.papelId ? papelPorId.get(p.papelId)?.categoria : null
        return (cat === "delegado" || cat === "nato") && p.situacao !== "cancelado"
      })
      .map((p) => ({ id: p.id, nome: p.nomeSocial ?? p.nome })),
    pedeGenero: valor(c.config, "inscricao.pede_genero") === true || Number(valor(c.config, "cotas.genero_minimo")) > 0,
    pedeAcessibilidade: valor(c.config, "inscricao.pede_acessibilidade") === true,
    pedeNomeSocial: valor(c.config, "inscricao.pede_nome_social") === true,
    temGrupos: valor(c.config, "programa.tem_grupos") === true && programa.grupos.length > 0,
  }

  const termo = semAcento(sp.busca ?? "").trim()
  const lista = participantes.filter(
    (p) =>
      (!sp.papel || p.papelId === sp.papel) &&
      (!sp.unidade || p.unidadeId === sp.unidade) &&
      (!sp.situacao || p.situacao === sp.situacao) &&
      (!termo || semAcento(`${p.nome} ${p.nomeSocial ?? ""} ${p.cpf ?? ""}`).includes(termo))
  )
  const papelNato = papeis.find((p) => p.categoria === "nato")
  const natosDaDiretoria = valor(c.config, "delegacao.natos") === "diretoria"
  const forma = valor<string>(c.config, "delegacao.forma")
  const filtrando = !!(sp.papel || sp.unidade || sp.situacao || sp.busca)

  return (
    <div className="grid gap-4">
      {gestor && (
        <div className="flex flex-wrap items-start gap-3">
          <NovoParticipante congressoId={c.id} opcoes={opcoes} />
          <ImportarLista congressoId={c.id} papeis={opcoes.papeis} unidades={opcoes.unidades} />
          {natosDaDiretoria && papelNato && <ImportarNatos congressoId={c.id} papelId={papelNato.id} />}
          {forma === "ordem_inscricao" && unidades.length > 0 && <AplicarOrdem congressoId={c.id} />}
        </div>
      )}

      <form className="flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="aba" value="participantes" />
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs" htmlFor="f-busca">
            Buscar
          </label>
          <input
            id="f-busca"
            name="busca"
            defaultValue={sp.busca ?? ""}
            placeholder="Nome ou CPF"
            className="border-input h-8 w-56 rounded-lg border bg-transparent px-2.5 text-sm"
          />
        </div>
        {[
          { nome: "papel", rotulo: "Papel", itens: papeis.map((p) => ({ v: p.id, r: p.nome })), atual: sp.papel },
          { nome: "unidade", rotulo: "Base", itens: unidades.map((u) => ({ v: u.id, r: u.nome })), atual: sp.unidade },
          { nome: "situacao", rotulo: "Situação", itens: SITUACOES_PARTICIPANTE.map((s) => ({ v: s.valor, r: s.rotulo })), atual: sp.situacao },
        ].map((f) => (
          <div key={f.nome} className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor={`f-${f.nome}`}>
              {f.rotulo}
            </label>
            <select
              id={`f-${f.nome}`}
              name={f.nome}
              defaultValue={f.atual ?? ""}
              className="border-input bg-background h-8 rounded-lg border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]"
            >
              <option value="">Todos</option>
              {f.itens.map((i) => (
                <option key={i.v} value={i.v}>
                  {i.r}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
        {filtrando && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/painel/representacao/congressos/${c.id}?aba=participantes`}>Limpar</Link>
          </Button>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{filtrando ? `${lista.length} de ${participantes.length}` : `${participantes.length} participante(s)`}</CardTitle>
          <CardDescription>Na ordem de inscrição. Clique no nome para editar.</CardDescription>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ninguém por aqui ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Inscrição</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((p) => {
                    const papel = p.papelId ? papelPorId.get(p.papelId) : undefined
                    const nome = p.nomeSocial ?? p.nome
                    return (
                      <TableRow key={p.id} className="align-top">
                        <TableCell className="min-w-56">
                          {gestor ? (
                            <EditarParticipante congressoId={c.id} opcoes={opcoes} participante={p} rotulo={nome} />
                          ) : (
                            <span className="font-medium">{nome}</span>
                          )}
                          <div className="text-muted-foreground text-xs">
                            {ROTULO_ORIGEM_PARTICIPANTE[p.origem] ?? p.origem}
                            {p.titularId && ` · suplente de ${nomePorId.get(p.titularId) ?? "—"}`}
                            {p.acessibilidade && gestor && ` · acessibilidade: ${p.acessibilidade}`}
                          </div>
                          {gestor && p.situacao !== "cancelado" && (
                            <GerarLink
                              congressoId={c.id}
                              participante={{ id: p.id, nome, email: p.email }}
                              temLink={!!p.linkGeradoEm}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {papel ? (
                            <span className="inline-flex items-center gap-1.5" title={resumoDireitos(papel.direitos)}>
                              <span className="size-2.5 rounded-full" style={{ background: papel.cor ?? "transparent" }} />
                              {papel.nome}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.unidadeId ? unidadePorId.get(p.unidadeId)?.nome : "—"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-xs">{formatarDataHora(p.inscritoEm)}</TableCell>
                        <TableCell>
                          {gestor ? (
                            <SituacaoForm congressoId={c.id} id={p.id} situacao={p.situacao} situacoes={SITUACOES_PARTICIPANTE} />
                          ) : (
                            ROTULO_PART.get(p.situacao)
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

async function AbaRelatoria({ c, relator }: { c: Congresso; relator: boolean }) {
  const d = await dadosDaRelatoria(c)
  const base = `/painel/representacao/congressos/${c.id}`
  const contagem = new Map<SituacaoProposta, number>()
  for (const p of d.propostas) contagem.set(p.situacao, (contagem.get(p.situacao) ?? 0) + 1)
  const nomeEixo = new Map(d.eixos.map((e) => [e.id, e.nome]))
  const ORDEM: SituacaoProposta[] = ["em_debate", "entregue", "plenaria", "aprovada", "rejeitada", "fundida", "anais", "retirada"]
  return (
    <div className="grid gap-4">
      {relator && (
        <div className="flex flex-wrap items-start gap-2">
          <Button asChild>
            <Link href={`${base}/consolidacao`}>Consolidação</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${base}/plenaria`}>Mesa da plenária</Link>
          </Button>
          {d.regras.haVotacao && <AplicarGrupos congressoId={c.id} />}
          <ColarPropostas congressoId={c.id} eixos={d.eixos.map((e) => ({ id: e.id, nome: e.nome }))} abrangencias={d.regras.abrangencias} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Propostas</CardTitle>
          <CardDescription>
            {d.propostas.length === 0
              ? "Nenhuma proposta ainda. Cole o caderno de teses ou deixe os grupos registrarem as novas."
              : `${d.propostas.length} proposta(s) no congresso.`}
          </CardDescription>
        </CardHeader>
        {d.propostas.length > 0 && (
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {ORDEM.filter((s) => contagem.get(s)).map((s) => (
              <span key={s} className="rounded-md border px-2 py-1">
                {ROTULO_SITUACAO_PROPOSTA[s]}: <span className="font-semibold tabular-nums">{contagem.get(s)}</span>
              </span>
            ))}
          </CardContent>
        )}
      </Card>
      {d.alertasCota.length > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <ul className="list-disc pl-5">
              {d.alertasCota.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Grupos</CardTitle>
          <CardDescription>
            {d.regras.temGrupos
              ? "Quem tem coordenação ou relatoria opera o grupo pelo link pessoal; a comissão também pode operar daqui."
              : "A configuração diz que não há grupos de trabalho: as propostas vão direto à consolidação."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.grupos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum grupo cadastrado. Crie em Programa e grupos.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Relatoria</TableHead>
                    <TableHead className="text-right">Novas</TableHead>
                    <TableHead className="text-right">Apontamentos</TableHead>
                    <TableHead>Relatório</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.grupos.map((g) => {
                    const funcoes = d.funcoes.filter((f) => f.grupoId === g.id)
                    return (
                      <TableRow key={g.id}>
                        <TableCell>
                          {relator ? (
                            <Link href={`${base}/grupos/${g.id}`} className="font-medium hover:underline">
                              {g.nome}
                            </Link>
                          ) : (
                            <span className="font-medium">{g.nome}</span>
                          )}
                          {g.eixoId && <div className="text-muted-foreground text-xs">{nomeEixo.get(g.eixoId)}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {funcoes.length ? (
                            funcoes.map((f) => (
                              <div key={f.id}>
                                {f.nome} <span className="text-muted-foreground text-xs">· {ROTULO_FUNCAO[f.funcao]}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.propostas.filter((p) => p.grupoId === g.id && p.origem === "grupo").length}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.apontamentos.filter((a) => a.grupoId === g.id && !a.retiradoEm).length}
                        </TableCell>
                        <TableCell>
                          {g.relatorioEntregueEm ? (
                            <Badge variant="success">
                              <CheckCircle2 className="size-3.5" />
                              Entregue {formatarDataHora(g.relatorioEntregueEm)}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Em andamento</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

async function AbaMocoes({ c, relator }: { c: Congresso; relator: boolean }) {
  const [{ mocoes, regras }, unidades] = await Promise.all([listarMocoes(c), listarUnidades(c.id)])
  const base = `/painel/representacao/congressos/${c.id}`
  return (
    <div className="grid gap-4">
      {relator && (
        <div className="flex flex-wrap items-start gap-2">
          <NovaMocaoPainel congressoId={c.id} tipos={regras.tipos} bases={unidades.map((u) => ({ id: u.id, nome: u.nome }))} />
          <Button asChild variant="outline">
            <Link href={`${base}/plenaria`}>Mesa da plenária</Link>
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Moções</CardTitle>
          <CardDescription>
            {regras.quemApresenta === "participantes"
              ? "Quem tem direito de propor apresenta pelo próprio link pessoal; a comissão também pode registrar."
              : "As moções são registradas pela comissão."}
            {regras.prazo ? ` Prazo: ${formatarDataHora(regras.prazo)}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mocoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma moção ainda.</p>
          ) : (
            <div className="grid gap-3">
              {mocoes.map((m) => (
                <div key={m.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="min-w-0">
                    <Link href={`${base}/mocoes/${m.id}`} className="font-medium hover:underline">
                      {m.numero}. {m.titulo}
                    </Link>
                    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={m.situacao === "aprovada" || m.situacao === "habilitada" ? "success" : m.situacao === "rejeitada" || m.situacao === "nao_habilitada" ? "destructive" : "secondary"}>
                        {ROTULO_SITUACAO_MOCAO[m.situacao]}
                      </Badge>
                      {m.tipo && <span>{m.tipo}</span>}
                      {m.unidade && <span>· {m.unidade}</span>}
                      {m.proponenteNome && <span>· {m.proponenteNome}</span>}
                    </div>
                  </div>
                  <ProgressoLimiar limiar={m.limiar} gravado={m.situacao !== "coleta"} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

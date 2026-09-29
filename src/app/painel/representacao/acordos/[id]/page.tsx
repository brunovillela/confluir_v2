import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2, FileText, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { fonteIdsDoAcordo, obterAcordo, opcoesFontes } from "@/lib/db/acordos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import {
  estadoVigencia,
  ROTULO_TEMA,
  ROTULO_TIPO,
  SITUACOES_ACORDO,
  temaClausula,
  type TemaClausula,
} from "@/lib/acordos-constantes"

import { marcarRevisadasAction } from "../actions"
import {
  AcordoForm,
  AdicionarClausula,
  BotaoExcluirClausula,
} from "../acordos-forms"
import { EditarClausula, EnviarDocumento, ExtrairDeNovo, JuntarComProxima } from "./texto-clausulas"

export const metadata: Metadata = { title: "Acordo coletivo — Confluir" }
// A extração (PDF → cláusulas → temas pela IA) roda na server action desta página.
export const maxDuration = 300

const ROTULO_SITUACAO = Object.fromEntries(
  SITUACOES_ACORDO.map((s) => [s.chave, s.rotulo])
)

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

export default async function AcordoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; tema?: string }>
}) {
  await requirePermissao("acordos_coletivos")
  const { id } = await params
  const { editar, salvo, tema: temaBruto } = await searchParams
  const a = await obterAcordo(id)
  if (!a) notFound()

  const editando = editar === "1"
  const [fontes, fonteIds] = editando
    ? await Promise.all([opcoesFontes(), fonteIdsDoAcordo(id)])
    : [[], []]

  const aqui = `/painel/representacao/acordos/${id}`
  const tema = temaClausula(temaBruto)
  const contagemTemas = new Map<TemaClausula, number>()
  for (const c of a.clausulas) contagemTemas.set(c.tema, (contagemTemas.get(c.tema) ?? 0) + 1)
  const temasPresentes = [...contagemTemas].sort((x, y) => y[1] - x[1])
  const visiveis = tema ? a.clausulas.filter((c) => c.tema === tema) : a.clausulas
  const estado =
    a.situacao === "vigente" ? estadoVigencia(a.vigencia_fim, hojeSP()) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos">
            <ArrowLeft />
            Acordos coletivos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {a.titulo ?? "(sem título)"}
          </h1>
          <Badge variant="secondary">{ROTULO_TIPO[a.tipo]}</Badge>
          <Badge variant="outline">{ROTULO_SITUACAO[a.situacao]}</Badge>
          {estado === "vencido" && <Badge variant="destructive">Vencido</Badge>}
          {estado === "vencendo" && <Badge variant="warning">Vencendo</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Vigência {formatarData(a.vigencia_inicio)} –{" "}
          {a.vigencia_fim ? formatarData(a.vigencia_fim) : "—"}
          {a.fontes.length > 0 && <> · {a.fontes.join(", ")}</>}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Acordo salvo.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados do acordo</CardTitle>
            {!editando && (
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
            <AcordoForm
              acordo={a}
              fontes={fontes}
              fonteIds={fonteIds}
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Nº de registro (MTE)" valor={a.numero_registro} />
              <Campo rotulo="Data-base" valor={a.data_base} />
              <Campo
                rotulo="Fontes pagadoras"
                valor={a.fontes.join(", ") || null}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Abrangência</dt>
                <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                  {a.abrangencia ?? "—"}
                </dd>
              </div>
              {a.observacoes && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-muted-foreground text-xs">Observações</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                    {a.observacoes}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground text-xs">Documento</dt>
                <dd className="mt-0.5 text-sm">
                  {a.documentoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a
                        href={a.documentoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText />
                        Abrir PDF
                      </a>
                    </Button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Cláusulas</CardTitle>
              <CardDescription>
                {a.clausulas.length} cláusula(s)
                {a.extracaoEm ? ` · extraídas do PDF em ${formatarDataHora(a.extracaoEm)}` : ""}
              </CardDescription>
            </div>
            {a.clausulas.length > 0 && a.extracaoEm && (
              <form action={marcarRevisadasAction} className="flex items-center gap-2">
                <input type="hidden" name="acordo_id" value={id} />
                <input type="hidden" name="revisadas" value={a.clausulasRevisadasEm ? "0" : "1"} />
                {a.clausulasRevisadasEm ? (
                  <Badge variant="outline" className="border-success/40 text-success-fg">
                    <CheckCircle2 className="size-3" />
                    Revisadas em {formatarData(a.clausulasRevisadasEm)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/40 text-warning-fg">
                    Extração automática — revise
                  </Badge>
                )}
                <Button type="submit" variant="ghost" size="sm">
                  {a.clausulasRevisadasEm ? "Desfazer" : "Marcar como revisadas"}
                </Button>
              </form>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {a.documentoCaminho ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {a.clausulas.length > 0 ? "Trocar o PDF ou extrair de novo" : "Extrair as cláusulas do PDF"}
              </summary>
              <div className="mt-3 grid gap-4">
                <ExtrairDeNovo acordoId={id} qtdClausulas={a.clausulas.length} />
                <EnviarDocumento acordoId={id} qtdClausulas={a.clausulas.length} />
              </div>
            </details>
          ) : (
            <EnviarDocumento acordoId={id} qtdClausulas={a.clausulas.length} />
          )}

          {a.extracaoAvisos.map((aviso, i) => (
            <Alert key={i} variant="warning">
              <AlertDescription>{aviso}</AlertDescription>
            </Alert>
          ))}

          {temasPresentes.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Button variant={tema ? "outline" : "default"} size="sm" asChild>
                <Link href={aqui}>Todos ({a.clausulas.length})</Link>
              </Button>
              {temasPresentes.map(([chave, n]) => (
                <Button key={chave} variant={tema === chave ? "default" : "outline"} size="sm" asChild>
                  <Link href={`${aqui}?tema=${chave}`}>
                    {ROTULO_TEMA[chave]} ({n})
                  </Link>
                </Button>
              ))}
            </div>
          )}

          {a.clausulas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma cláusula cadastrada.</p>
          ) : (
            <ul className="grid gap-2">
              {visiveis.map((c) => (
                <li key={c.id} className="border-border rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {c.grupo && <p className="text-muted-foreground text-[11px] uppercase">{c.grupo}</p>}
                      <p className="text-sm font-medium">
                        {c.numero && (
                          <span className="text-muted-foreground mr-1 tabular-nums">{c.numero}</span>
                        )}
                        {c.titulo ?? "(sem título)"}{" "}
                        <Badge variant="secondary" className="ml-1 align-middle">
                          {ROTULO_TEMA[c.tema]}
                        </Badge>
                      </p>
                      {c.resumo && <p className="text-muted-foreground mt-0.5 text-xs">{c.resumo}</p>}
                      {c.texto && (
                        <details className="mt-1">
                          <summary className="text-muted-foreground cursor-pointer text-xs">
                            Texto integral ({c.texto.length.toLocaleString("pt-BR")} caracteres)
                          </summary>
                          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{c.texto}</p>
                        </details>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <EditarClausula
                        acordoId={id}
                        clausula={{ id: c.id, numero: c.numero, titulo: c.titulo, texto: c.texto, tema: c.tema }}
                      />
                      <JuntarComProxima acordoId={id} clausulaId={c.id} />
                      <BotaoExcluirClausula clausulaId={c.id} acordoId={id} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(a.preambulo || a.anexos) && (
            <div className="grid gap-2">
              {a.preambulo && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Preâmbulo (partes e qualificação)</summary>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{a.preambulo}</p>
                </details>
              )}
              {a.anexos && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Encerramento, assinaturas e anexos ({a.anexos.length.toLocaleString("pt-BR")} caracteres)
                  </summary>
                  <p className="mt-2 max-h-[40rem] overflow-auto text-sm whitespace-pre-wrap">{a.anexos}</p>
                </details>
              )}
            </div>
          )}

          <AdicionarClausula acordoId={id} />
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

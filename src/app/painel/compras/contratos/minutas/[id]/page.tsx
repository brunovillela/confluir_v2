import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  History,
  PenLine,
  RotateCcw,
} from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { ORIGENS_VERSAO } from "@/lib/contratos-minutas-constantes"
import { opcoesContratos } from "@/lib/db/contratos"
import { formatarMomentoAssinatura, hashTexto } from "@/lib/db/assinatura-comum"
import { assinanteSugerido, obterMinuta } from "@/lib/db/contratos-minutas"
import {
  assinaturasDaMinuta,
  mascararCpf,
  ROTULO_PAPEL_MINUTA,
  urlArquivoAssinado,
} from "@/lib/db/minuta-assinatura"
import { formatarDataHora } from "@/lib/formato"

import { restaurarVersaoAction } from "../actions"
import { AnexarAssinadoForm, CancelarAssinatura, EnviarAssinaturaForm } from "./assinatura-forms"
import { DadosMinutaForm, EditorMinuta, ExcluirMinuta } from "./minuta-forms"

export const metadata: Metadata = { title: "Minuta — Confluir" }
// "Ajustar com IA" reescreve o contrato inteiro na server action.
export const maxDuration = 300

export default async function MinutaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    criada?: string
    truncado?: string
    ajustada?: string
    restaurada?: string
    enviada?: string
    cancelada?: string
  }>
}) {
  await requirePermissao("aquisicoes_contratos_edicao")
  const { id } = await params
  const sp = await searchParams
  const [minuta, contratos] = await Promise.all([obterMinuta(id), opcoesContratos()])
  if (!minuta) notFound()

  const base = `/painel/compras/contratos/minutas/${id}`

  // Assinatura: só a rodada sobre o texto ATUAL conta.
  const hashAtual = minuta.texto ? hashTexto(minuta.texto) : null
  const [todasAssinaturas, sugestao, urlExterno] = await Promise.all([
    assinaturasDaMinuta(id),
    assinanteSugerido(minuta.parametros.assinanteId ?? null),
    urlArquivoAssinado(minuta.arquivoAssinado),
  ])
  const rodada = todasAssinaturas.filter(
    (a) => a.hashDocumento === hashAtual && a.situacao !== "cancelado"
  )
  const emAssinatura = Boolean(minuta.assinaturaHash) && !minuta.assinadaEm
  const assinada = Boolean(minuta.assinadaEm) || Boolean(minuta.arquivoAssinado)
  const bloqueio = assinada
    ? "Minuta assinada: o texto não pode mais mudar. Para alterar algo, redija um termo aditivo."
    : emAssinatura
      ? "Minuta em assinatura: o texto está travado. Cancele o envio (abaixo) para editar."
      : null
  const pendencias = /\[PREENCHER/i.test(minuta.texto ?? "")

  return (
    <>
      <RotuloTrilha valores={{ [id]: minuta.titulo ?? "Minuta" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos/minutas">
            <ArrowLeft />
            Minutas
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{minuta.titulo ?? "Minuta"}</h1>
              {minuta.finalizada ? (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Finalizada
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Rascunho
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {minuta.tipo ?? "Contrato"} · versão {minuta.versao}
              {minuta.contratoId && (
                <>
                  {" · "}
                  <Link href={`/painel/compras/contratos/${minuta.contratoId}`} className="hover:underline">
                    contrato {minuta.contratoCodigo ?? ""}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/pdf`} target="_blank" rel="noreferrer">
                <FileText />
                PDF
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/word`}>
                <FileDown />
                Word
              </a>
            </Button>
          </div>
        </div>
      </div>

      {sp.criada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Minuta redigida. Revise o texto inteiro e preencha o que ficou marcado antes de enviar à outra
            parte — a IA não substitui a revisão jurídica.
          </AlertDescription>
        </Alert>
      )}
      {sp.truncado === "1" && (
        <Alert variant="warning">
          <AlertDescription>
            O texto ficou longo demais e veio cortado no fim. Confira a última cláusula e, se faltar algo,
            peça à IA: “complete a minuta a partir da cláusula …”.
          </AlertDescription>
        </Alert>
      )}
      {sp.ajustada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ajuste feito (versão {sp.ajustada}).</AlertDescription>
        </Alert>
      )}
      {sp.restaurada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Versão {sp.restaurada} restaurada como a atual.</AlertDescription>
        </Alert>
      )}
      {sp.enviada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Enviada para assinatura. O primeiro assinante recebeu o link por e-mail; os demais recebem
            quando chegar a vez deles.
          </AlertDescription>
        </Alert>
      )}
      {sp.cancelada === "1" && (
        <Alert>
          <AlertDescription>
            Envio cancelado. Os links deixaram de valer e o texto voltou a ser editável.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          {/* key: depois de ajuste/restauração o editor recomeça do texto novo. */}
          <EditorMinuta
            key={`${minuta.versao}`}
            id={id}
            texto={minuta.texto ?? ""}
            clausulasFixas={minuta.parametros.clausulasFixas ?? []}
            bloqueio={bloqueio}
          />
        </CardContent>
      </Card>

      <GrupoColapsavel titulo="Ver o PDF" descricao="O documento como sai para impressão e assinatura">
        <div className="grid gap-2">
          <iframe
            src={`${base}/pdf`}
            title={minuta.titulo ?? "Minuta"}
            loading="lazy"
            className="bg-muted h-[80vh] w-full rounded-md border"
          />
          <p className="text-muted-foreground text-xs">
            Se o navegador não mostrar o PDF aqui,{" "}
            <a href={`${base}/pdf`} target="_blank" rel="noreferrer" className="underline">
              abra em outra aba
            </a>
            .
          </p>
        </div>
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="size-4" />
            Assinatura eletrônica
          </CardTitle>
          <CardDescription>
            Link pessoal e código de uso único por e-mail, conferência do CPF, aceite expresso e trilha
            com data, hora e IP. O PDF assinado traz o certificado de cada assinatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {minuta.arquivoAssinado && (
            <Alert className="border-success/40 text-success-fg">
              <CheckCircle2 />
              <AlertDescription>
                PDF assinado por certificado digital / gov.br anexado em{" "}
                {formatarDataHora(minuta.arquivoAssinadoEm)}.{" "}
                {urlExterno && (
                  <a href={urlExterno} target="_blank" rel="noreferrer" className="underline">
                    Abrir o PDF assinado
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}
          {minuta.assinadaEm && (
            <Alert className="border-success/40 text-success-fg">
              <CheckCircle2 />
              <AlertDescription>
                Assinada eletronicamente por todas as partes em{" "}
                {formatarMomentoAssinatura(minuta.assinadaEm)} (horário de Brasília).
              </AlertDescription>
            </Alert>
          )}

          {rodada.length > 0 && (
            <ol className="grid gap-2 text-sm">
              {rodada.map((a) => (
                <li key={a.id} className="rounded-md border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="text-muted-foreground tabular-nums">{a.ordem}. </span>
                      <span className="font-medium">{a.nomeDeclarado ?? a.nome}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {ROTULO_PAPEL_MINUTA[a.papel]}
                        {a.daEntidade ? " (entidade)" : ""} · CPF {mascararCpf(a.cpf)}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        a.situacao === "assinado"
                          ? "border-success/40 text-success-fg"
                          : a.situacao === "recusado"
                            ? "border-destructive/40 text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {a.situacao === "assinado"
                        ? `assinou ${formatarMomentoAssinatura(a.assinadoEm)}`
                        : a.situacao === "recusado"
                          ? "recusou"
                          : a.enviadoEm
                            ? a.visualizadoEm
                              ? "abriu, aguardando"
                              : "link enviado"
                            : "na fila"}
                    </Badge>
                  </div>
                  {a.motivoRecusa && (
                    <p className="text-destructive mt-1 text-xs">Motivo da recusa: {a.motivoRecusa}</p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {rodada.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={minuta.assinadaEm ? "default" : "outline"} asChild>
                <a href={`${base}/pdf?baixar=1`}>
                  <Download />
                  {minuta.assinadaEm ? "Baixar contrato assinado" : "Baixar PDF com a certificação até aqui"}
                </a>
              </Button>
              {emAssinatura && <CancelarAssinatura id={id} />}
            </div>
          )}

          {!assinada && !emAssinatura && !minuta.finalizada && (
            <p className="text-muted-foreground text-sm">
              Revise a minuta e marque-a como <strong>finalizada</strong> (em “Dados da minuta”) para
              enviar para assinatura.
            </p>
          )}
          {!assinada && !emAssinatura && minuta.finalizada && pendencias && (
            <p className="text-warning-fg text-sm">
              Ainda há “[PREENCHER]” no texto. Complete tudo antes de enviar: um contrato não vai para
              assinatura com lacunas.
            </p>
          )}
          {!assinada && !emAssinatura && minuta.finalizada && !pendencias && (
            <EnviarAssinaturaForm
              id={id}
              papelEntidade={minuta.parametros.papelEntidade ?? "contratante"}
              entidade={sugestao}
              outraParte={{ nome: minuta.parametros.outraParteNome ?? "" }}
            />
          )}

          {!assinada && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Assinar por fora, com certificado digital (ICP-Brasil) ou gov.br
              </summary>
              <div className="mt-3 grid gap-3">
                <p className="text-muted-foreground text-xs">
                  É a forma de maior força probatória: a assinatura com certificado ICP-Brasil se
                  presume verdadeira (MP 2.200-2/2001, art. 10, § 1º). Baixe o PDF, colha as
                  assinaturas no assinador do gov.br ou com o certificado de cada parte, e anexe o
                  arquivo final aqui.
                </p>
                <AnexarAssinadoForm id={id} />
              </div>
            </details>
          )}
        </CardContent>
      </Card>


      <GrupoColapsavel titulo="Dados da minuta" descricao="Título, contrato vinculado e se está finalizada">
        <DadosMinutaForm
          id={id}
          titulo={minuta.titulo ?? ""}
          contratoId={minuta.contratoId}
          finalizada={minuta.finalizada}
          contratos={contratos.map((c) => ({
            id: c.id,
            rotulo: [c.codigo, c.objeto].filter(Boolean).join(" — ") || "(sem objeto)",
          }))}
        />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Versões"
        descricao="Cada redação, ajuste e edição fica guardada"
        resumo={
          <Badge variant="outline" className="text-muted-foreground tabular-nums">
            <History className="size-3" />
            {minuta.versoes.length}
          </Badge>
        }
      >
        <ul className="grid gap-2">
          {minuta.versoes.map((v) => (
            <li key={v.id} className="rounded-md border p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">Versão {v.versao}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {ORIGENS_VERSAO[v.origem] ?? v.origem} · {formatarDataHora(v.createdAt)}
                    {v.autor ? ` · ${v.autor}` : ""}
                  </span>
                </span>
                {v.versao !== minuta.versao && !bloqueio && (
                  <form action={restaurarVersaoAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="versao_id" value={v.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <RotateCcw />
                      Restaurar
                    </Button>
                  </form>
                )}
              </div>
              {v.pedido && <p className="text-muted-foreground mt-1 text-xs">Pedido: {v.pedido}</p>}
              <details className="mt-1">
                <summary className="text-muted-foreground cursor-pointer text-xs">Ver texto</summary>
                <pre className="bg-muted/40 mt-2 max-h-80 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                  {v.texto}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </GrupoColapsavel>

      <div className="flex justify-end">
        <ExcluirMinuta id={id} />
      </div>
    </>
  )
}

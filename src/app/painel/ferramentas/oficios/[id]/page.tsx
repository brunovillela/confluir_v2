import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  FileCheck2,
  Paperclip,
  Printer,
  ShieldCheck,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { assinantesVigentes, liberacoesDoOficio } from "@/lib/db/diretoria"
import {
  candidatosDaEmpresa,
  listarEmpresas,
  obterOficio,
  proximoNumeroDoAno,
} from "@/lib/db/oficios"
import {
  assinaturasDoOficio,
  assinaturaVigente,
  destinoDaAssinatura,
  emailSugeridoDoIntegrante,
  formatarMomento,
  mascararTelefone,
  ROTULO_EVENTO,
  telegramDoIntegrante,
  type Assinatura,
} from "@/lib/db/oficios-assinatura"
import { listarSedes } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import {
  eAutomatico,
  limparFormatacaoBubble,
  ROTULOS_TIPO_OFICIO,
  type TipoOficio,
} from "@/lib/oficios-constantes"

import { atualizarOficioAction } from "../actions"
import {
  AcoesEnvioPendente,
  AnexarAssinadoAMao,
  EnviarParaAssinatura,
} from "./assinatura-acoes"
import { OficioForm } from "../oficio-form"
import {
  AdicionarManual,
  CandidatosForm,
  CancelarOficio,
  EmitirOficio,
  RemoverFiliado,
} from "./oficio-acoes"

export const metadata: Metadata = { title: "Ofício — Confluir" }

export default async function OficioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_oficios")
  const { id } = await params

  const oficio = await obterOficio(id)
  if (!oficio) notFound()

  const rascunho = oficio.situacao === "Rascunho"
  const automatico = eAutomatico(oficio.tipo)

  const [empresas, { sedes }, assinantes, proximoNumero, candidatos, assinaturas, emailSugerido, liberacoes] =
    await Promise.all([
      rascunho ? listarEmpresas() : Promise.resolve([]),
      rascunho ? listarSedes() : Promise.resolve({ disponivel: true, sedes: [] }),
      rascunho ? assinantesVigentes() : Promise.resolve([]),
      rascunho ? proximoNumeroDoAno(oficio.data) : Promise.resolve(0),
      rascunho && automatico && oficio.destinatarioEmpresaId
        ? candidatosDaEmpresa(
            oficio.destinatarioEmpresaId,
            oficio.tipo as "desfiliacao" | "filiacao",
            {}
          )
        : Promise.resolve([]),
      assinaturasDoOficio(id),
      rascunho ? emailSugeridoDoIntegrante(oficio.assinanteIntegranteId) : Promise.resolve(null),
      rascunho ? Promise.resolve([]) : liberacoesDoOficio(id),
    ])
  const telegram = rascunho
    ? await telegramDoIntegrante(oficio.assinanteIntegranteId)
    : { disponivel: false, telefone: null }
  const aguardando = oficio.situacao === "Aguardando assinatura"
  // Cartão de assinatura: a vigente (assinada ou pendente), senão a última.
  const assinaturaDoCartao = assinaturaVigente(assinaturas) ?? assinaturas[0] ?? null
  const ultimaRecusa = rascunho && assinaturas[0]?.situacao === "recusado" ? assinaturas[0] : null
  const nomeAssinante =
    assinantes.find((x) => x.id === oficio.assinanteIntegranteId)?.nome ?? oficio.assinanteNome

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/oficios">
            <ArrowLeft />
            Ofícios
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {oficio.arquivoAssinadoUrl && (
            <Button size="sm" asChild>
              <a href={oficio.arquivoAssinadoUrl} target="_blank" rel="noreferrer">
                <FileCheck2 />
                PDF assinado
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/oficio/${id}/pdf`} target="_blank">
              <Download />
              Baixar PDF
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/oficio/${id}`} target="_blank">
              <Printer />
              Imprimir
            </Link>
          </Button>
          {(rascunho || aguardando) && <CancelarOficio oficioId={id} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {oficio.numero != null
            ? `Ofício ${oficio.numero}/${oficio.ano}`
            : rascunho
              ? "Ofício (rascunho)"
              : `Ofício sem número${oficio.ano ? ` (${oficio.ano})` : ""}`}
        </h1>
        <Badge variant="outline">
          {oficio.tipo
            ? ROTULOS_TIPO_OFICIO[oficio.tipo as TipoOficio] ?? oficio.tipo
            : "—"}
        </Badge>
        <Badge
          variant="outline"
          className={
            oficio.situacao === "Emitido"
              ? "border-success/40 text-success-fg"
              : aguardando
                ? "border-info/40 text-info-fg"
                : oficio.situacao === "Cancelado"
                ? "text-muted-foreground line-through"
                : "border-warning/40 text-warning-fg"
          }
        >
          {oficio.situacao}
        </Badge>
      </div>

      {/* Cabeçalho de dados (edição no rascunho, leitura depois) */}
      {rascunho ? (
        <Card>
          <CardContent className="pt-6">
            <OficioForm
              action={atualizarOficioAction}
              dados={{
                id: oficio.id,
                tipo: oficio.tipo,
                data: oficio.data,
                sedeId: oficio.sedeId,
                destinatarioEmpresaId: oficio.destinatarioEmpresaId,
                destinatarioTexto: oficio.destinatarioTexto,
                aosCuidados: oficio.aosCuidados,
                assunto: oficio.assunto,
                corpo: oficio.corpo,
                assinanteIntegranteId: oficio.assinanteIntegranteId,
              }}
              empresas={empresas.map((e) => ({ ...e }))}
              sedes={sedes.map((s) => ({ id: s.id, nome: s.nome ?? "Sede" }))}
              assinantes={assinantes}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <Campo rotulo="Destinatário" valor={oficio.destinatarioNome ?? oficio.destinatarioTexto} />
            <Campo rotulo="Aos cuidados" valor={oficio.aosCuidados} />
            <Campo rotulo="Assunto" valor={oficio.assunto} />
            <Campo rotulo="Data" valor={oficio.data ? formatarData(oficio.data) : null} />
            <Campo
              rotulo="Assinante"
              valor={
                oficio.assinanteNome
                  ? `${oficio.assinanteNome}${oficio.assinanteCargo ? ` — ${oficio.assinanteCargo}` : ""}`
                  : null
              }
            />
            {oficio.departamentoNome && (
              <Campo rotulo="Departamento" valor={oficio.departamentoNome} />
            )}
            {oficio.redatorNome && <Campo rotulo="Redator" valor={oficio.redatorNome} />}
            {oficio.respostas.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs">Respostas recebidas</p>
                <ul className="mt-1 grid gap-1">
                  {oficio.respostas.map((r) => (
                    <li key={r.url}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                      >
                        <Paperclip className="size-3.5" />
                        {r.nome}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {oficio.corpo && (
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs">Corpo</p>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {limparFormatacaoBubble(oficio.corpo)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista de pessoas */}
      {(automatico || oficio.filiados.length > 0) && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">
              Pessoas{" "}
              <span className="text-muted-foreground font-normal">
                ({oficio.filiados.length})
              </span>
            </p>

            {oficio.filiados.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    {rascunho && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oficio.filiados.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.nome ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {f.matricula ?? "—"}
                      </TableCell>
                      {rascunho && (
                        <TableCell className="py-1">
                          <RemoverFiliado filiadoId={f.id} oficioId={id} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nenhuma pessoa na lista ainda.
              </p>
            )}

            {rascunho && (
              <div className="mt-4 grid gap-4">
                {automatico && oficio.destinatarioEmpresaId && (
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                      Carregar da fonte pagadora
                    </p>
                    <CandidatosForm
                      oficioId={id}
                      empresaId={oficio.destinatarioEmpresaId}
                      tipo={oficio.tipo ?? ""}
                      candidatos={candidatos}
                    />
                  </div>
                )}
                {automatico && !oficio.destinatarioEmpresaId && (
                  <p className="text-muted-foreground text-sm">
                    Defina a empresa destinatária acima e salve para carregar a lista.
                  </p>
                )}
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    Adicionar manualmente
                  </p>
                  <AdicionarManual oficioId={id} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Emissão: por assinatura eletrônica ou, à mão, direto */}
      {rascunho && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" />
              Enviar para assinatura eletrônica
            </CardTitle>
            <CardDescription>
              Ao enviar, o ofício recebe o número e fica travado. Quem assina recebe um e-mail para
              revisar o documento e assinar com um código de uso único; assinado, o ofício é emitido
              com QR Code e certificado de verificação.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {ultimaRecusa && (
              <Alert variant="destructive">
                <AlertDescription>
                  {ultimaRecusa.nome ?? "O assinante"} recusou a assinatura em{" "}
                  {formatarMomento(ultimaRecusa.recusadoEm)}: {ultimaRecusa.motivoRecusa}. Corrija e
                  envie de novo — o número {oficio.numero}/{oficio.ano} continua reservado.
                </AlertDescription>
              </Alert>
            )}
            {oficio.assinanteIntegranteId ? (
              <EnviarParaAssinatura
                oficioId={id}
                proximoNumero={proximoNumero}
                numeroReservado={oficio.numero}
                emailSugerido={emailSugerido}
                assinante={nomeAssinante}
                telegram={{
                  disponivel: telegram.disponivel,
                  telefone: telegram.telefone ? mascararTelefone(telegram.telefone) : null,
                }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Escolha o assinante (diretoria) acima e salve para poder enviar.
              </p>
            )}
            <details className="rounded-md border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Emitir sem assinatura eletrônica
              </summary>
              <p className="text-muted-foreground mt-2 mb-3 text-sm">
                Para ofício assinado à mão: o número é atribuído e o documento fica travado, sem QR
                Code nem certificado. O número sugerido é o próximo do ano — ajuste se estiver
                continuando de uma numeração anterior.
              </p>
              <EmitirOficio oficioId={id} proximoNumero={oficio.numero ?? proximoNumero} />
            </details>
          </CardContent>
        </Card>
      )}

      {assinaturaDoCartao && <CartaoAssinatura assinatura={assinaturaDoCartao} oficioId={id} />}

      {/* Emitido à mão: o PDF digitalizado fica junto do ofício */}
      {!rascunho && !aguardando && !assinaturas.some((a) => a.situacao === "assinado") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="size-4" />
              Documento assinado à mão
            </CardTitle>
            <CardDescription>
              {oficio.arquivoAssinadoUrl
                ? "O ofício já tem um PDF assinado guardado — o botão “PDF assinado”, no topo, abre o arquivo."
                : "Este ofício foi emitido sem assinatura eletrônica. Anexe aqui o PDF assinado e digitalizado para guardá-lo junto do ofício."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnexarAssinadoAMao oficioId={id} temArquivo={Boolean(oficio.arquivoAssinadoUrl)} />
          </CardContent>
        </Card>
      )}

      {/* Liberações sindicais oficializadas por este ofício (Institucional › Diretoria) */}
      {liberacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liberações sindicais deste ofício</CardTitle>
            <CardDescription>Registradas no mandato, em Institucional › Diretoria.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm">
              {liberacoes.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-2">
                  {l.mandatoId ? (
                    <Link href={`/painel/institucional/diretoria/${l.mandatoId}`} className="text-primary font-medium hover:underline">
                      {l.pessoaNome ?? "—"}
                    </Link>
                  ) : (
                    <span className="font-medium">{l.pessoaNome ?? "—"}</span>
                  )}
                  {!l.ehDiretor && <Badge variant="outline" className="text-muted-foreground">base</Badge>}
                  <span className="text-muted-foreground">
                    saída {l.inicio ? formatarData(l.inicio) : "?"} · retorno {l.fim ? formatarData(l.fim) : "sem retorno (permanente)"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function CartaoAssinatura({ assinatura: a, oficioId }: { assinatura: Assinatura; oficioId: string }) {
  const cancelamento = [...a.eventos].reverse().find((e) => e.tipo === "cancelado")
  const passos = [
    {
      rotulo: "Enviado",
      quando: a.enviadoEm,
      detalhe: a.canal === "telegram" ? destinoDaAssinatura(a) : a.email,
      falha: false,
    },
    { rotulo: "Aberto pelo assinante", quando: a.visualizadoEm, detalhe: null, falha: false },
    a.situacao === "recusado"
      ? { rotulo: "Recusado", quando: a.recusadoEm, detalhe: a.motivoRecusa, falha: true }
      : a.situacao === "cancelado"
        ? { rotulo: "Envio cancelado", quando: cancelamento?.quando ?? null, detalhe: cancelamento?.detalhe ?? null, falha: true }
        : { rotulo: "Assinado", quando: a.assinadoEm, detalhe: a.assinadoEm && a.ip ? `IP ${a.ip}` : null, falha: false },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Assinatura eletrônica
        </CardTitle>
        <CardDescription>
          {a.nome ?? "Assinante"}
          {a.cargo ? ` — ${a.cargo}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid gap-3 sm:grid-cols-3">
          {passos.map((p) => (
            <li key={p.rotulo} className="flex items-start gap-2 text-sm">
              {p.quando ? (
                <CheckCircle2
                  className={`mt-0.5 size-4 shrink-0 ${p.falha ? "text-destructive" : "text-success-fg"}`}
                />
              ) : (
                <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block font-medium">{p.rotulo}</span>
                <span className="text-muted-foreground block text-xs">
                  {p.quando ? formatarMomento(p.quando) : "—"}
                </span>
                {p.detalhe && (
                  <span className="text-muted-foreground block text-xs break-all">{p.detalhe}</span>
                )}
              </span>
            </li>
          ))}
        </ol>

        {a.situacao === "pendente" && <AcoesEnvioPendente oficioId={oficioId} />}

        {a.situacao === "assinado" && a.certificado && (
          <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
            <div>
              <p className="text-muted-foreground text-xs">Certificado</p>
              <p className="font-mono text-base font-semibold tracking-wider">{a.certificado}</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`/verificar/${a.certificado}`} target="_blank" rel="noreferrer">
                <ShieldCheck />
                Página de verificação
              </a>
            </Button>
          </div>
        )}

        <details className="rounded-md border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Trilha de auditoria ({a.eventos.length})
          </summary>
          <ul className="mt-3 grid gap-2 text-sm">
            {a.eventos.map((e, i) => (
              <li key={i} className="grid gap-0.5 sm:grid-cols-[11rem_1fr]">
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatarMomento(e.quando)}
                </span>
                <span>
                  {ROTULO_EVENTO[e.tipo] ?? e.tipo}
                  {(e.detalhe || e.ip) && (
                    <span className="text-muted-foreground block text-xs">
                      {[e.detalhe, e.ip ? `IP ${e.ip}` : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {a.hashDocumento && (
            <p className="text-muted-foreground mt-3 text-xs break-all">
              Resumo do conteúdo (SHA-256): <span className="font-mono">{a.hashDocumento}</span>
            </p>
          )}
        </details>
      </CardContent>
    </Card>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-0.5">{valor ?? "—"}</p>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarX, OctagonX, RotateCcw, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  aplicarVariaveis,
  corpoParaEmailHtml,
  formatarTelefone,
  linkWhatsapp,
  ROTULO_SITUACAO_EMAIL,
  ROTULO_SITUACAO_MENSAGEM,
  rotuloHora,
  type SituacaoEmail,
} from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { enviosDaMensagem, obterMalaDireta } from "@/lib/db/comunicacao-mensagens"
import { baseRelatorios } from "@/lib/db/filiacao-relatorios"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { BotaoWhatsapp } from "../../aniversariantes/componentes"
import {
  desfazerAgendamentoAction,
  excluirRascunhoAction,
  interromperEnvioAction,
  reenviarFalhasMalaDiretaAction,
} from "../actions"
import { COR_SITUACAO_EMAIL, COR_SITUACAO_MENSAGEM } from "../cores"
import { EnviarMalaDireta, MalaDiretaForm } from "./componentes"

export const metadata: Metadata = { title: "Mala direta — Confluir" }
export const maxDuration = 300

const POR_PAGINA = 100
const SITUACOES: SituacaoEmail[] = ["enviado", "pendente", "processando", "falha", "sem_email", "descadastrado", "duplicado"]


export default async function MalaDiretaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ enviar?: string; sit?: string; pag?: string }>
}) {
  const sessao = await requirePermissao("comunicacao_mensagens")
  const { id } = await params
  const q = await searchParams
  const m = await obterMalaDireta(id)
  if (!m) notFound()
  const entidade = await nomeEntidade()

  const voltar = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
      <Link href="/painel/comunicacao/mensagens">
        <ArrowLeft />
        Mala direta
      </Link>
    </Button>
  )
  const cabecalho = (
    <div>
      {voltar}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{m.titulo ?? "Sem título"}</h1>
        <Badge variant="outline" className={COR_SITUACAO_MENSAGEM[m.situacao]}>
          {ROTULO_SITUACAO_MENSAGEM[m.situacao]}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {m.criadoPorNome ? `Criada por ${m.criadoPorNome}` : "Mala direta"}
        {m.atualizadoEm ? ` · alterada em ${formatarDataHora(m.atualizadoEm)}` : ""}
      </p>
    </div>
  )

  if (m.situacao === "rascunho") {
    const base = await baseRelatorios()
    return (
      <>
        {cabecalho}
        <MalaDiretaForm
          mensagem={{
            id: m.id,
            titulo: m.titulo ?? "",
            assunto: m.assunto ?? "",
            corpo: m.corpo ?? "",
            textoWhatsapp: m.textoWhatsapp ?? "",
            filtros: m.filtros,
          }}
          fontes={base.fontes}
          ufs={base.ufs}
          hoje={hojeSP()}
        />
        <form action={excluirRascunhoAction} className="flex justify-end">
          <input type="hidden" name="id" value={m.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
            <Trash2 />
            Excluir rascunho
          </Button>
        </form>
      </>
    )
  }

  // Liberada: a lista de destinatários e o andamento.
  const envios = await enviosDaMensagem(m.id)
  const conta = (s: SituacaoEmail) => envios.filter((e) => e.situacao === s).length
  const filtro = SITUACOES.includes(q.sit as SituacaoEmail) ? (q.sit as SituacaoEmail) : null
  const filtrados = filtro ? envios.filter((e) => e.situacao === filtro) : envios
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const pagina = Math.min(Math.max(Number(q.pag) || 1, 1), paginas)
  const visiveis = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const textoWhats = m.textoWhatsapp?.trim() ?? ""
  const exemplo = String(sessao.usuario.nome_completo ?? "Maria da Silva")
  const n = (v: number) => v.toLocaleString("pt-BR")
  const link = (extra: { sit?: string | null; pag?: number }) => {
    const p = new URLSearchParams()
    const sit = extra.sit === undefined ? filtro : extra.sit
    if (sit) p.set("sit", sit)
    if (extra.pag && extra.pag > 1) p.set("pag", String(extra.pag))
    const s = p.toString()
    return s ? `?${s}` : "?"
  }

  return (
    <>
      {cabecalho}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {m.situacao === "agendada" && m.agendadaPara
              ? `Agendada para ${formatarData(m.agendadaPara)}, às ${rotuloHora(m.agendadaHora)}`
              : m.situacao === "enviando"
                ? "Enviando"
                : m.situacao === "cancelada"
                  ? "Envio interrompido"
                  : `Enviada${m.enviadaEm ? ` em ${formatarDataHora(m.enviadaEm)}` : ""}`}
          </CardTitle>
          <CardDescription className="tabular-nums">
            {[
              `${n(envios.length)} destinatário(s)`,
              `${n(conta("enviado"))} e-mail(s) enviado(s)`,
              conta("pendente") ? `${n(conta("pendente"))} na fila` : null,
              conta("falha") ? `${n(conta("falha"))} falha(s)` : null,
              `${n(conta("sem_email"))} sem e-mail`,
              conta("descadastrado") ? `${n(conta("descadastrado"))} descadastrado(s)` : null,
              conta("duplicado") ? `${n(conta("duplicado"))} e-mail(s) repetido(s)` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {m.recorte && <p className="text-muted-foreground text-xs">Recorte: {m.recorte}</p>}
          <div className="flex flex-wrap items-start gap-2">
            {m.situacao === "enviando" && (
              <>
                <EnviarMalaDireta id={m.id} pendentes={conta("pendente")} autoIniciar={q.enviar === "1"} />
                <form action={interromperEnvioAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" variant="outline" className="text-destructive">
                    <OctagonX />
                    Interromper envio
                  </Button>
                </form>
              </>
            )}
            {m.situacao === "agendada" && (
              <form action={desfazerAgendamentoAction}>
                <input type="hidden" name="id" value={m.id} />
                <Button type="submit" variant="outline">
                  <CalendarX />
                  Desfazer agendamento e editar
                </Button>
              </form>
            )}
            {m.situacao === "enviada" && conta("falha") > 0 && (
              <form action={reenviarFalhasMalaDiretaAction}>
                <input type="hidden" name="id" value={m.id} />
                <Button type="submit" variant="outline">
                  <RotateCcw />
                  Tentar de novo as falhas
                </Button>
              </form>
            )}
          </div>
          {m.situacao === "agendada" && (
            <p className="text-muted-foreground text-xs">
              A lista abaixo foi fechada no agendamento. Quem se descadastrar até lá não recebe.
            </p>
          )}
        </CardContent>
      </Card>

      <GrupoColapsavel titulo="Mensagem" descricao={m.assunto ? aplicarVariaveis(m.assunto, { nome: exemplo, entidade }) : undefined}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-muted/40 grid gap-2 rounded-lg border p-4 text-sm">
            <p className="text-muted-foreground text-xs">E-mail — como {exemplo.split(" ")[0]} recebe</p>
            <p className="font-semibold">{aplicarVariaveis(m.assunto ?? "", { nome: exemplo, entidade })}</p>
            <div
              className="[&_a]:text-primary [&_ol]:list-decimal [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: corpoParaEmailHtml(m.corpo, { nome: exemplo, entidade }) }}
            />
          </div>
          {textoWhats && (
            <div className="grid content-start gap-2 rounded-lg border border-[#25d366]/40 bg-[#25d366]/10 p-4 text-sm">
              <p className="text-muted-foreground text-xs">WhatsApp</p>
              <p className="whitespace-pre-line">{aplicarVariaveis(textoWhats, { nome: exemplo, entidade })}</p>
            </div>
          )}
        </div>
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destinatários</CardTitle>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button asChild size="sm" variant={filtro ? "outline" : "secondary"}>
              <Link href={link({ sit: null })}>Todos ({n(envios.length)})</Link>
            </Button>
            {SITUACOES.filter((s) => conta(s) > 0).map((s) => (
              <Button key={s} asChild size="sm" variant={filtro === s ? "secondary" : "outline"}>
                <Link href={link({ sit: s })}>
                  {ROTULO_SITUACAO_EMAIL[s]} ({n(conta(s))})
                </Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filiado</TableHead>
                  <TableHead>E-mail</TableHead>
                  {textoWhats && <TableHead>WhatsApp</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l) => {
                  // Quem pediu para não receber comunicados também fica fora do WhatsApp.
                  const href = textoWhats && l.telefone && l.situacao !== "descadastrado" ? linkWhatsapp(l.telefone, aplicarVariaveis(textoWhats, { nome: l.nome, entidade })) : null
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-normal">
                        {l.filiacaoId ? (
                          <Link href={`/painel/filiados/${l.filiacaoId}`} className="hover:text-primary font-medium">
                            {l.nome}
                          </Link>
                        ) : (
                          <span className="font-medium">{l.nome}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="grid gap-1">
                          {l.email && <span className="text-muted-foreground text-xs break-all">{l.email}</span>}
                          <span>
                            <Badge variant="outline" className={COR_SITUACAO_EMAIL[l.situacao]}>
                              {ROTULO_SITUACAO_EMAIL[l.situacao]}
                            </Badge>
                            {l.emailEm && l.situacao === "enviado" && (
                              <span className="text-muted-foreground ml-2 text-xs">{formatarDataHora(l.emailEm)}</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      {textoWhats && (
                        <TableCell className="whitespace-normal">
                          {href ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground text-xs tabular-nums">{formatarTelefone(l.telefone)}</span>
                              <BotaoWhatsapp href={href} envioId={l.id} aberto={!!l.whatsappEm} />
                              {l.whatsappEm && (
                                <span className="text-muted-foreground text-xs">
                                  aberto {formatarDataHora(l.whatsappEm)}
                                  {l.whatsappPorNome ? ` por ${l.whatsappPorNome}` : ""}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {l.situacao === "descadastrado" ? "Pediu para não receber" : "Sem celular no cadastro"}
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {paginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground tabular-nums">
                {n((pagina - 1) * POR_PAGINA + 1)}–{n(Math.min(pagina * POR_PAGINA, filtrados.length))} de {n(filtrados.length)}
              </span>
              <div className="flex gap-1.5">
                {pagina > 1 && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={link({ pag: pagina - 1 })}>Anterior</Link>
                  </Button>
                )}
                {pagina < paginas && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={link({ pag: pagina + 1 })}>Próxima</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

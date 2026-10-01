import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquareText, RotateCcw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  aplicarVariaveis,
  formatarTelefone,
  linkWhatsapp,
  rotuloHora,
  ROTULO_SITUACAO_EMAIL,
  type SituacaoEmail,
} from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import {
  aniversariantesDoDia,
  AVISO_SQL_MENSAGENS,
  listarModelos,
  mensagemDoAniversario,
  obterConfigAniversario,
  prepararAniversario,
  textoParaPessoa,
  type Envio,
} from "@/lib/db/comunicacao-mensagens"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"

import { reenviarFalhasAction } from "./actions"
import { BotaoWhatsapp, EnviarAgora } from "./componentes"

export const metadata: Metadata = { title: "Aniversariantes — Confluir" }
export const maxDuration = 300

const DATA = /^\d{4}-\d{2}-\d{2}$/
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]

function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function rotuloDia(iso: string, hoje: string): string {
  const [a, m, d] = iso.split("-")
  const semana = DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()]
  const perto = iso === hoje ? "hoje" : iso === somarDias(hoje, 1) ? "amanhã" : iso === somarDias(hoje, -1) ? "ontem" : semana
  return `${d}/${m}/${a} · ${perto}`
}

const COR_SITUACAO: Record<SituacaoEmail, string> = {
  pendente: "border-warning/40 text-warning-fg",
  processando: "border-warning/40 text-warning-fg",
  enviado: "border-success/40 text-success-fg",
  sem_email: "text-muted-foreground",
  descadastrado: "text-muted-foreground",
  duplicado: "text-muted-foreground",
  falha: "border-destructive/40 text-destructive",
}

/**
 * Aniversariantes do dia: o parabéns por e-mail (automático na hora configurada, quando
 * ligado) e a lista para mandar pelo WhatsApp. Hoje, a tela prepara o dia ao
 * abrir — assim cada pessoa já tem a linha onde fica registrado quem abriu o
 * WhatsApp. Outros dias: o que foi enviado, ou a prévia de quem faz aniversário.
 */
export default async function AniversariantesPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  await requirePermissao("comunicacao_mensagens")
  const hoje = hojeSP()
  const brutos = await searchParams
  const data = brutos.data && DATA.test(brutos.data) ? brutos.data : hoje
  const ehHoje = data === hoje

  const [config, entidade, modelos] = await Promise.all([obterConfigAniversario(), nomeEntidade(), listarModelos()])
  // Com o parabéns na véspera, o de amanhã já é tratado hoje.
  const vespera = config.parabensAntecedencia === 1
  const diaDoEnvio = somarDias(hoje, config.parabensAntecedencia)
  const podeEnviar = data === hoje || data === diaDoEnvio
  if (podeEnviar && config.disponivel) await prepararAniversario(data).catch(() => null)
  const { mensagem, envios } = config.disponivel ? await mensagemDoAniversario(data) : { mensagem: null, envios: [] as Envio[] }

  // Sem mensagem no dia (passado sem envio ou dia futuro): a prévia de quem faz aniversário.
  const linhas: Envio[] =
    mensagem || !config.disponivel
      ? envios
      : (await aniversariantesDoDia(data)).map((p) => {
          const t = textoParaPessoa(config, modelos, p.perfil)
          return {
            id: "",
            filiacaoId: p.filiacaoId,
            cpf: p.cpf,
            nome: p.nome,
            email: p.email,
            telefone: p.telefone,
            situacao: (p.email ? "pendente" : "sem_email") as SituacaoEmail,
            emailEm: null,
            erro: null,
            whatsappEm: null,
            whatsappPorNome: null,
            modeloNome: t.modeloNome,
            textoWhatsapp: t.textoWhatsapp,
          }
        })

  const conta = (s: SituacaoEmail) => linhas.filter((l) => l.situacao === s).length
  const comWhatsapp = linhas.filter((l) => l.telefone && linkWhatsapp(l.telefone, "")).length
  const abertos = linhas.filter((l) => l.whatsappEm).length
  const textoWhats = mensagem?.textoWhatsapp ?? config.textoWhatsapp
  const comEspecifica = linhas.filter((l) => l.modeloNome).length

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/comunicacao">
              <ArrowLeft />
              Comunicação
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Aniversariantes</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Filiados ativos que fazem aniversário: o parabéns por e-mail e o botão para mandar pelo WhatsApp.
          </p>
        </div>
        {config.disponivel && (
          <Button asChild variant="outline">
            <Link href="/painel/comunicacao/aniversariantes/mensagens">
              <MessageSquareText />
              Configurar recorrência e mensagens
            </Link>
          </Button>
        )}
      </div>

      {!config.disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_MENSAGENS}</AlertDescription>
        </Alert>
      )}

      {config.disponivel && (
        <Alert variant={config.ativo ? "info" : "warning"}>
          <AlertDescription>
            {config.ativo
              ? `O parabéns por e-mail sai sozinho todo dia às ${rotuloHora(config.horaEnvio)}, ${vespera ? "na véspera do aniversário" : "no dia do aniversário"}. O WhatsApp é à mão: use o botão ao lado de cada nome.`
              : "O envio automático está desligado. Ligue em Configurar recorrência e mensagens, ou envie os e-mails pelo botão da lista."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{rotuloDia(data, hoje)}</CardTitle>
              <CardDescription className="tabular-nums">
                {linhas.length === 0
                  ? "Ninguém faz aniversário neste dia."
                  : [
                      `${linhas.length} aniversariante${linhas.length === 1 ? "" : "s"}`,
                      mensagem ? `${conta("enviado")} e-mail(s) enviado(s)` : `${linhas.filter((l) => l.email).length} com e-mail`,
                      conta("pendente") && mensagem ? `${conta("pendente")} na fila` : null,
                      conta("falha") ? `${conta("falha")} falha(s)` : null,
                      `${conta("sem_email")} sem e-mail`,
                      comEspecifica ? `${comEspecifica} com mensagem específica` : null,
                      `${comWhatsapp} com WhatsApp${abertos ? ` (${abertos} aberto${abertos === 1 ? "" : "s"})` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="icon" aria-label="Dia anterior">
                <Link href={`?data=${somarDias(data, -1)}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              {!ehHoje && (
                <Button asChild variant="outline" size="sm">
                  <Link href="?">Hoje</Link>
                </Button>
              )}
              <Button asChild variant="outline" size="icon" aria-label="Próximo dia">
                <Link href={`?data=${somarDias(data, 1)}`}>
                  <ChevronRight />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {podeEnviar && mensagem && linhas.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {conta("falha") > 0 && (
                <form action={reenviarFalhasAction}>
                  <input type="hidden" name="mensagem_id" value={mensagem.id} />
                  <Button type="submit" variant="outline" size="sm">
                    <RotateCcw />
                    Tentar de novo as falhas
                  </Button>
                </form>
              )}
              <EnviarAgora pendentes={conta("pendente")} dia={data} />
            </div>
          )}
          {!podeEnviar && !mensagem && linhas.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {data > hoje
                ? `Prévia: quem faz aniversário neste dia. O parabéns sai ${vespera ? "na véspera" : "no próprio dia"}.`
                : "Nenhum parabéns foi registrado neste dia — a lista mostra quem fez aniversário."}
            </p>
          )}

          {linhas.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filiado</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>WhatsApp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const href = l.telefone ? linkWhatsapp(l.telefone, aplicarVariaveis(l.textoWhatsapp ?? textoWhats, { nome: l.nome, entidade })) : null
                    return (
                      <TableRow key={l.id || l.cpf}>
                        <TableCell className="whitespace-normal">
                          {l.filiacaoId ? (
                            <Link href={`/painel/filiados/${l.filiacaoId}`} className="hover:text-primary font-medium">
                              {l.nome}
                            </Link>
                          ) : (
                            <span className="font-medium">{l.nome}</span>
                          )}
                          {l.modeloNome && <p className="text-muted-foreground text-xs">Mensagem: {l.modeloNome}</p>}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="grid gap-1">
                            {l.email && <span className="text-muted-foreground text-xs break-all">{l.email}</span>}
                            <span>
                              <Badge variant="outline" className={COR_SITUACAO[l.situacao]}>
                                {mensagem || l.situacao !== "pendente" ? ROTULO_SITUACAO_EMAIL[l.situacao] : "Com e-mail"}
                              </Badge>
                              {l.emailEm && l.situacao === "enviado" && (
                                <span className="text-muted-foreground ml-2 text-xs">{formatarDataHora(l.emailEm)}</span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {href ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground text-xs tabular-nums">{formatarTelefone(l.telefone)}</span>
                              <BotaoWhatsapp href={href} envioId={l.id || null} aberto={!!l.whatsappEm} />
                              {l.whatsappEm && (
                                <span className="text-muted-foreground text-xs">
                                  aberto {formatarDataHora(l.whatsappEm)}
                                  {l.whatsappPorNome ? ` por ${l.whatsappPorNome}` : ""}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Sem celular no cadastro</span>
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

    </>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays, HeartPulse, Info, MessageSquare } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
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
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { meusAtendimentos } from "@/lib/db/atendimentos"
import { hojeSP } from "@/lib/db/comum"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { meusAgendamentos, minhasCats, type MeuAgendamento, type MinhaCat } from "@/lib/db/saude-portal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Saúde — Portal do Associado" }

/** Atendimento com o assunto "Saúde" já escolhido (A76); o resumo, quando houver. */
function linkServicoSaude(titulo?: string): string {
  const base = "/portal/atendimento?assunto=saude"
  return titulo ? `${base}&titulo=${encodeURIComponent(titulo)}` : base
}

/**
 * O caminho até o serviço de saúde. Continua funcionando na visualização
 * pela gestão: é link que navega, e o formulário do Atendimento já desliga o
 * envio nesse modo (acao-visualizacao.tsx).
 */
function FalarComServico({ className, variant = "default" }: { className?: string; variant?: "default" | "outline" }) {
  return (
    <Button asChild variant={variant} className={cn("min-h-11", className)}>
      <Link href={linkServicoSaude()}>
        <MessageSquare />
        Falar com o serviço de saúde
      </Link>
    </Button>
  )
}

// A agenda guarda só o dia (DATE): meio-dia UTC não troca de data em fuso nenhum.
const DIA_POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})
function diaPorExtenso(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return formatarData(iso)
  const texto = DIA_POR_EXTENSO.format(d)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function amanhaDe(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default async function PortalSaudePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireVisualizacaoPortal()

  const cabecalho = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saúde</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus atendimentos no serviço de saúde do sindicato
        </p>
      </div>
      <FalarComServico className="w-full sm:w-auto" />
    </div>
  )

  // "Ver como filiado": a gestão entra com permissão de FILIAÇÃO, não
  // clínica. O prontuário já evita revelar o serviço procurado (psicologia,
  // serviço social… — registrarNoProntuario, lib/db/atendimentos.ts); aqui
  // nem as datas aparecem, porque a frequência também diz muito, e quem
  // precisa saber se houve atendimento tem o prontuário. Vale para a agenda
  // e para as CATs: as consultas nem rodam, para o sigilo não depender de
  // esconder coluna.
  if (sessao.preview) {
    return (
      <>
        {cabecalho}
        <Alert>
          <Info />
          <AlertDescription>
            Na visualização pela gestão, as informações de saúde não são
            exibidas: são do próprio associado. Quando ele entra no portal, vê
            aqui os próximos agendamentos, as comunicações de acidente de
            trabalho ligadas a ele e o histórico de atendimentos (data,
            serviço, profissional e observações).
          </AlertDescription>
        </Alert>
      </>
    )
  }

  // O CPF se repete em vários registros de filiação (~2,9× por pessoa), e o
  // assistido pode estar ligado a qualquer um deles.
  const filiadoIds = await registrosDoCpf(sessao.filiado.cpf)
  // Agenda e CATs são complemento: se falharem, a página segue com o histórico.
  const [{ linhas, disponivel }, agenda, cats] = await Promise.all([
    meusAtendimentos(filiadoIds),
    meusAgendamentos(filiadoIds)
      .then((r) => r.linhas)
      .catch(() => [] as MeuAgendamento[]),
    minhasCats(filiadoIds).catch(() => [] as MinhaCat[]),
  ])

  // 30: a lista é o conteúdo da página; o card de agenda e o de CAT só
  // aparecem com registro e têm poucas linhas (A165).
  const p = await searchParams
  const pag = lerPaginacao(p, 30)
  const { linhas: pagina, ...info } = paginar(linhas, pag)

  const hoje = hojeSP()
  const amanha = amanhaDe(hoje)

  return (
    <>
      {cabecalho}

      {agenda.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos agendamentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ul className="divide-y">
              {agenda.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <CalendarDays aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      <span>
                        {diaPorExtenso(a.inicio)}
                        {a.termino && ` a ${formatarData(a.termino)}`}
                      </span>
                      {a.inicio === hoje && <Badge variant="info">Hoje</Badge>}
                      {a.inicio === amanha && <Badge variant="info">Amanhã</Badge>}
                      {/* De vários dias, começou antes e ainda não terminou: sem
                          o selo, a data de início no passado parece erro. */}
                      {a.inicio < hoje && <Badge variant="info">Em andamento</Badge>}
                    </p>
                    {(a.servico || a.profissional) && (
                      <p className="text-muted-foreground text-sm">
                        {[a.servico, a.profissional].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">{a.online ? "Online" : "Presencial"}</Badge>
                      {/* O registro só diz se é online; sem isto, a pergunta seguinte é "online onde?". */}
                      {a.online && <span>O serviço de saúde envia as orientações de acesso.</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {/* A agenda guarda só o dia: o horário é a primeira dúvida. */}
            <p className="text-muted-foreground border-t pt-3 text-sm">
              Precisa confirmar o horário ou mudar a data?{" "}
              <Link
                href={linkServicoSaude("Agendamento de saúde: horário ou nova data")}
                className="text-primary inline-flex items-center font-medium underline underline-offset-4 pointer-coarse:min-h-11"
              >
                Fale com o serviço de saúde
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {cats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acidentes de trabalho (CAT)</CardTitle>
            <CardDescription>
              Comunicações de acidente de trabalho que o serviço de saúde ligou ao
              seu cadastro. Para pedir uma cópia, use o botão de cada uma.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Table className="tabela-cards">
              <TableHeader>
                <TableRow>
                  <TableHead>Data do acidente</TableHead>
                  <TableHead>Número da CAT</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell data-rotulo="Data do acidente" className="whitespace-nowrap">
                      {formatarData(c.dataAcidente)}
                    </TableCell>
                    <TableCell data-rotulo="Número da CAT" className="tabular-nums">
                      {c.numero ?? "Sem número"}
                    </TableCell>
                    <TableCell data-rotulo="Empresa">{c.empresa ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
                        <Link
                          href={linkServicoSaude(
                            c.numero
                              ? `Cópia da CAT nº ${c.numero}`
                              : c.dataAcidente
                                ? `Cópia da CAT do acidente de ${formatarData(c.dataAcidente)}`
                                : "Cópia de CAT"
                          )}
                        >
                          Pedir cópia
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* O que fazer: a orientação é com o serviço de saúde, e a frase não
                diz nada sobre o caso de ninguém (afastamento fica fora da lista). */}
            <p className="text-muted-foreground border-t pt-3 text-sm">
              Precisa de orientação sobre o acidente, o afastamento ou o INSS?{" "}
              <Link
                href={linkServicoSaude("Orientação sobre acidente de trabalho (CAT)")}
                className="text-primary inline-flex items-center font-medium underline underline-offset-4 pointer-coarse:min-h-11"
              >
                Fale com o serviço de saúde
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {!disponivel ? (
        <Card>
          <CardContent>
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-8 text-center">
              <Info className="size-5" />
              <p className="text-sm">
                O histórico de atendimentos ainda não está disponível. Para marcar
                um atendimento ou tirar uma dúvida, fale com o serviço de saúde.
              </p>
              <FalarComServico variant="outline" />
            </div>
          </CardContent>
        </Card>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-8 text-center">
              <HeartPulse className="size-5" />
              <p className="text-sm">
                {/* "Ainda… no histórico": quem tem agendamento no card acima
                    não lê que "não tem atendimento". */}
                Você ainda não tem atendimentos no histórico. Para marcar um
                atendimento ou tirar uma dúvida, fale com o serviço de saúde.
              </p>
              <FalarComServico variant="outline" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Histórico de atendimentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="tabela-cards">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell data-rotulo="Data" className="whitespace-nowrap">
                        {formatarData(a.data_atendimento)}
                      </TableCell>
                      <TableCell data-rotulo="Serviço">{a.tipoNome ?? "—"}</TableCell>
                      <TableCell data-rotulo="Profissional">{a.profissionalNome ?? "—"}</TableCell>
                      <TableCell data-rotulo="Observações" className="max-w-md">
                        <span className="whitespace-pre-line">
                          {a.observacao_aberta ?? "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Paginacao {...info} porPagina={pag.porPagina} padrao={30} />
            </CardContent>
          </Card>

          <Alert>
            <Info />
            <AlertDescription>
              Esta página mostra o registro administrativo dos seus
              atendimentos. O relatório clínico fica sob guarda do
              profissional que o elaborou — para ter acesso a ele,{" "}
              <Link
                href={linkServicoSaude("Acesso ao relatório de atendimento")}
                className="text-primary font-medium underline underline-offset-4"
              >
                peça ao serviço de saúde
              </Link>
              .
            </AlertDescription>
          </Alert>
        </>
      )}
    </>
  )
}

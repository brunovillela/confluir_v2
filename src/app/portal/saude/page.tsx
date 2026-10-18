import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays, HeartPulse, Info, MessageSquare } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { paginaIndisponivel } from "@/components/portal/guarda-parte"
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
import type { PedidoSaude } from "@/lib/atendimento-constantes"
import { meusAtendimentos } from "@/lib/db/atendimentos"
import { hojeSP } from "@/lib/db/comum"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { bloqueioDaParte, configDaParte, estadoDaParte } from "@/lib/db/portal-partes"
import { meusAgendamentos, minhasCats, type MeuAgendamento, type MinhaCat } from "@/lib/db/saude-portal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Saúde" }

/**
 * Saúde desabilitada: o titular perde o acesso direto aos registros, e a
 * cópia dos dados do portal (LGPD) não cobre saúde — o "indisponível" diz
 * por onde pedir (art. 18). A mesma frase do layout da seção (saude/layout.tsx).
 */
const CAMINHO_DOS_DADOS =
  "Os seus registros de saúde continuam guardados: para pedir uma cópia, fale com o sindicato."

/**
 * Atendimento com o assunto "Saúde" já escolhido (A76). O resumo NÃO vai na
 * URL (RIPD de saúde, R2: histórico, logs e analytics guardariam o pedido
 * clínico): vai só o código do pedido — e, na cópia de CAT, o id dela — e o
 * Atendimento monta o resumo no servidor (PEDIDOS_SAUDE).
 */
function linkServicoSaude(pedido?: PedidoSaude, catId?: string): string {
  const base = "/portal/atendimento?assunto=saude"
  if (!pedido) return base
  return `${base}&pedido=${pedido}${catId ? `&cat=${encodeURIComponent(catId)}` : ""}`
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

/**
 * "Fale com o serviço de saúde" no meio do texto: link para o Atendimento
 * quando o pedido pode ser feito; senão, a mesma frase sem link (a
 * orientação continua valendo fora do portal).
 */
function LinkServico({ podePedir, pedido, children }: { podePedir: boolean; pedido: PedidoSaude; children: React.ReactNode }) {
  if (!podePedir) return <>{children}</>
  return (
    <Link
      href={linkServicoSaude(pedido)}
      className="text-primary inline-flex items-center font-medium underline underline-offset-4 pointer-coarse:min-h-11"
    >
      {children}
    </Link>
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
  // Desabilitada: o "indisponível" (com o caminho para pedir os dados, como o
  // do layout) antes de qualquer leitura — o layout renderiza junto com esta
  // página e não a impede de rodar; sem esta saída, as consultas de saúde
  // rodariam do mesmo jeito.
  const indisponivel = await paginaIndisponivel("saude", { complemento: CAMINHO_DOS_DADOS })
  if (indisponivel) return indisponivel
  // Só configuração aqui — nada de saúde é lido antes de saber o que mostrar.
  // Na dúvida, a parte vale (tudo aparece, como antes).
  const [sessao, parte, bloqueioSaude, estadoAtendimento] = await Promise.all([
    requireVisualizacaoPortal(),
    configDaParte("saude").catch(() => null),
    bloqueioDaParte("saude").catch(() => null),
    estadoDaParte("atendimento").catch(() => "habilitada" as const),
  ])
  const { mostrar_agendamentos, mostrar_cats } = parte?.opcoes ?? opcoesPadrao("saude")
  // Os pedidos ao serviço de saúde abrem uma solicitação no Atendimento: com
  // a Saúde suspensa (ou o portal em consulta) o Atendimento recusa o
  // assunto, e com ele desabilitado não há para onde ir — os botões somem.
  const podePedir = !bloqueioSaude && estadoAtendimento !== "desabilitada"

  const cabecalho = (
    <CabecalhoPagina
      secao="/portal/saude"
      titulo="Saúde"
      subtitulo="Seus atendimentos no serviço de saúde do sindicato"
      acoes={podePedir ? <FalarComServico className="w-full sm:w-auto" /> : undefined}
    />
  )

  // "Ver como filiado": a gestão entra com permissão de FILIAÇÃO, não
  // clínica. O prontuário já evita revelar o serviço procurado (psicologia,
  // serviço social… — registrarNoProntuario, lib/db/atendimentos.ts); aqui
  // nem as datas aparecem, porque a frequência também diz muito, e quem
  // precisa saber se houve atendimento tem o prontuário. Vale para a agenda
  // e para as CATs: as consultas nem rodam, para o sigilo não depender de
  // esconder coluna.
  if (sessao.preview) {
    // O que ele vê segue as opções da Área do associado.
    const blocos = [
      mostrar_agendamentos && "os próximos agendamentos",
      mostrar_cats && "as comunicações de acidente de trabalho ligadas a ele",
      "o histórico de atendimentos (data, serviço, profissional e observações)",
    ].filter((b): b is string => !!b)
    const oQueVe = blocos.length > 1 ? `${blocos.slice(0, -1).join(", ")} e ${blocos.at(-1)}` : blocos[0]
    return (
      <>
        {cabecalho}
        <Alert>
          <Info />
          <AlertDescription>
            Na visualização pela gestão, as informações de saúde não são
            exibidas: são do próprio associado. Quando ele entra no portal, vê
            aqui {oQueVe}.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  // O CPF se repete em vários registros de filiação (~2,9× por pessoa), e o
  // assistido pode estar ligado a qualquer um deles.
  const filiadoIds = await registrosDoCpf(sessao.filiado.cpf)
  // Agenda e CATs são complemento: se falharem, a página segue com o histórico.
  // Desligadas na Área do associado, nem são consultadas.
  const [{ linhas, disponivel }, agenda, cats] = await Promise.all([
    meusAtendimentos(filiadoIds),
    mostrar_agendamentos
      ? meusAgendamentos(filiadoIds)
          .then((r) => r.linhas)
          .catch(() => [] as MeuAgendamento[])
      : ([] as MeuAgendamento[]),
    mostrar_cats ? minhasCats(filiadoIds).catch(() => [] as MinhaCat[]) : ([] as MinhaCat[]),
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
            <CardTitle role="heading" aria-level={2}>
              Próximos agendamentos
            </CardTitle>
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
              <LinkServico podePedir={podePedir} pedido="agendamento">
                Fale com o serviço de saúde
              </LinkServico>
            </p>
          </CardContent>
        </Card>
      )}

      {cats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Acidentes de trabalho (CAT)
            </CardTitle>
            <CardDescription>
              Comunicações de acidente de trabalho que o serviço de saúde ligou ao
              seu cadastro.{" "}
              {podePedir
                ? "Para pedir uma cópia, use o botão de cada uma."
                : "Para pedir uma cópia, fale com o serviço de saúde."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Table className="tabela-cards">
              <TableHeader>
                <TableRow>
                  <TableHead>Data do acidente</TableHead>
                  <TableHead>Número da CAT</TableHead>
                  <TableHead>Empresa</TableHead>
                  {podePedir && (
                    <TableHead>
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  )}
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
                    {podePedir && (
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
                          <Link
                            href={linkServicoSaude("copia_cat", c.id)}
                          >
                            Pedir cópia
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* O que fazer: a orientação é com o serviço de saúde, e a frase não
                diz nada sobre o caso de ninguém (afastamento fica fora da lista). */}
            <p className="text-muted-foreground border-t pt-3 text-sm">
              Precisa de orientação sobre o acidente, o afastamento ou o INSS?{" "}
              <LinkServico podePedir={podePedir} pedido="orientacao_cat">
                Fale com o serviço de saúde
              </LinkServico>
            </p>
          </CardContent>
        </Card>
      )}

      {!disponivel ? (
        <EstadoVazio
          cartao
          icone={Info}
          titulo="O histórico de atendimentos ainda não está disponível."
          descricao="Para marcar um atendimento ou tirar uma dúvida, fale com o serviço de saúde."
          acao={podePedir ? <FalarComServico variant="outline" /> : undefined}
        />
      ) : linhas.length === 0 ? (
        // "Ainda… no histórico": quem tem agendamento no card acima não lê
        // que "não tem atendimento".
        <EstadoVazio
          cartao
          icone={HeartPulse}
          titulo="Você ainda não tem atendimentos no histórico."
          descricao="Para marcar um atendimento ou tirar uma dúvida, fale com o serviço de saúde."
          acao={podePedir ? <FalarComServico variant="outline" /> : undefined}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
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
              {podePedir ? (
                <Link
                  href={linkServicoSaude("relatorio")}
                  className="text-primary font-medium underline underline-offset-4"
                >
                  peça ao serviço de saúde
                </Link>
              ) : (
                "peça ao serviço de saúde"
              )}
              .
            </AlertDescription>
          </Alert>
        </>
      )}
    </>
  )
}

import type { Metadata } from "next"
import { CalendarClock, Info, Vote } from "lucide-react"

import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { quandoCurto, ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import { datasDaRodada, type DatasDaRodada } from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { SalaVirtualAviso } from "../../sala-virtual"

export const metadata: Metadata = { title: "Datas da rodada" }

type AssembleiaDaRodada = DatasDaRodada["assembleias"][number]

/**
 * Dia e horário de uma assembleia: "12/10/2026, das 14:00 às 16:00". Para a
 * presencial é o que a pessoa precisa para comparecer; a hora também vale
 * para a online, como janela de votação (A48). Sem hora, só as datas.
 */
function quando(a: AssembleiaDaRodada): string {
  // Legado do Bubble: data_realizacao já traz a hora — vale como antes, a
  // menos que a assembleia tenha a janela própria (hora_inicio/hora_termino).
  if (a.dataRealizacao && !(a.dataInicio && (a.horaInicio || a.horaTermino))) {
    return (
      formatarDataHora(a.dataRealizacao) +
      (a.dataTermino ? ` até ${formatarData(a.dataTermino)}` : "")
    )
  }
  if (!a.dataInicio) return "data a definir"
  const inicio = formatarData(a.dataInicio)
  const mesmoDia = !a.dataTermino || a.dataTermino.slice(0, 10) === a.dataInicio.slice(0, 10)
  if (mesmoDia) {
    if (a.horaInicio && a.horaTermino) return `${inicio}, das ${a.horaInicio} às ${a.horaTermino}`
    if (a.horaInicio) return `${inicio}, a partir das ${a.horaInicio}`
    if (a.horaTermino) return `${inicio}, até as ${a.horaTermino}`
    return inicio
  }
  const termino = formatarData(a.dataTermino)
  return `${inicio}${a.horaInicio ? ` às ${a.horaInicio}` : ""} até ${termino}${a.horaTermino ? ` às ${a.horaTermino}` : ""}`
}

/** Janela de funcionamento da urna, quando foi definida. */
function janelaDaUrna(u: AssembleiaDaRodada["urnas"][number]): string | null {
  if (u.abertura && u.fechamento) return `${quandoCurto(u.abertura)} a ${quandoCurto(u.fechamento)}`
  if (u.abertura) return `a partir de ${quandoCurto(u.abertura)}`
  if (u.fechamento) return `até ${quandoCurto(u.fechamento)}`
  return null
}

export default async function DatasRodadaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { filiado } = await requireVisualizacaoPortal()
  const { id } = await params
  const dados = filiado.ativo ? await datasDaRodada(filiado.cpf, id) : null

  return (
    <>
      <CabecalhoPagina
        secao="/portal/votacao"
        voltar={{ base: "/portal/votacao", rotulo: "Votação" }}
        titulo={dados?.nome ?? dados?.tema ?? "Datas da rodada"}
        subtitulo={
          [dados?.empregador, dados?.tema].filter(Boolean).join(" · ") ||
          "Confira as datas das assembleias desta rodada."
        }
      />

      {!dados ? (
        <Alert variant="warning">
          <AlertDescription>
            Não encontramos esta rodada entre as suas, ou você não está apto
            nela.
          </AlertDescription>
        </Alert>
      ) : dados.assembleias.length === 0 ? (
        <EstadoVazio cartao icone={CalendarClock} titulo="Ainda não há assembleias com datas nesta rodada." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Assembleias desta rodada
            </CardTitle>
            <CardDescription>
              Dia, horário e modalidade de cada encontro. Horários de Brasília.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {dados.assembleias.map((a) => (
              <div key={a.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {a.nome ?? "Assembleia"}
                  </p>
                  <Badge variant="outline">
                    {ROTULOS_MODALIDADE[a.modalidade]}
                  </Badge>
                </div>
                <p className="flex items-start gap-1.5 text-sm">
                  <CalendarClock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  {quando(a)}
                </p>
                {a.urnas.length > 0 && (
                  <div className="grid gap-1 text-sm">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                      <Vote className="size-3.5 shrink-0" />
                      Onde votar
                    </p>
                    <ul className="grid gap-0.5 pl-5">
                      {a.urnas.map((u, i) => {
                        const janela = janelaDaUrna(u)
                        return (
                          <li key={`${u.nome}-${i}`}>
                            {u.nome}
                            {janela && (
                              <span className="text-muted-foreground"> · {janela}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                {/* "Descrição" no painel é texto livre (pauta, recado) — não
                    é endereço. Antes saía com o pino de mapa, como se fosse o
                    local (A48). */}
                {a.descricao && (
                  <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="text-foreground font-medium">Observações:</span>{" "}
                      {a.descricao}
                    </span>
                  </p>
                )}
                {a.sala && <SalaVirtualAviso sala={a.sala} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}

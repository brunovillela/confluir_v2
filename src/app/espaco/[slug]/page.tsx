import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CalendarClock, MapPin, Users } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSessaoPainel } from "@/lib/auth"
import {
  carregarEspacoPublico,
  periodosOcupados,
} from "@/lib/db/espacos-solicitacao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import {
  DIAS_SEMANA,
  blocosDaJanela,
  horaCurta,
  rotuloVisita,
} from "@/lib/espacos-constantes"
import { formatarData } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

import { PedidoForm } from "./pedido-form"

export const metadata: Metadata = {
  title: "Uso de espaço — Confluir",
  robots: { index: false },
}

/** Quantos dias da agenda o link público mostra. */
const DIAS_AGENDA = 21

export default async function EspacoPublicoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const tenantId = await tenantAtual()

  const [espaco, org, sessao] = await Promise.all([
    carregarEspacoPublico(slug, tenantId),
    obterOrganizacao(),
    getSessaoPainel(),
  ])
  if (!espaco) notFound()

  const entidade = org?.nomeFantasia ?? org?.nomeRazao ?? null
  const agenda = espaco.agendaPublica
    ? await montarAgenda(espaco.id, tenantId, espaco.janelas)
    : []

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        {entidade && (
          <p className="text-muted-foreground mt-2 text-sm">{entidade}</p>
        )}
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{espaco.nome}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {espaco.sedeNome && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {espaco.sedeNome}
                </span>
              )}
              {espaco.capacidade && (
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" />
                  até {espaco.capacidade} pessoas
                </span>
              )}
              {espaco.visita !== "dispensada" && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  visita técnica {rotuloVisita(espaco.visita).toLowerCase()}
                </span>
              )}
            </p>
            {espaco.descricao && (
              <p className="text-sm whitespace-pre-line">{espaco.descricao}</p>
            )}
            {espaco.janelas.length > 0 && (
              <div className="text-sm">
                <p className="font-medium">Horários em que o espaço é cedido</p>
                <ul className="text-muted-foreground mt-1 grid gap-0.5">
                  {DIAS_SEMANA.filter((d) =>
                    espaco.janelas.some((j) => j.dia_semana === d.dia)
                  ).map((d) => (
                    <li key={d.dia}>
                      {d.rotulo}:{" "}
                      {espaco.janelas
                        .filter((j) => j.dia_semana === d.dia)
                        .map(
                          (j) =>
                            `${horaCurta(j.hora_inicio)} às ${horaCurta(j.hora_termino)}` +
                            (j.modo === "slots"
                              ? ` (blocos de ${j.slot_minutos} min)`
                              : "")
                        )
                        .join(" · ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {espaco.exigeTermo && (
              <p className="text-muted-foreground text-xs">
                A cessão deste espaço é formalizada por termo assinado pelas
                duas partes.
              </p>
            )}
          </CardContent>
        </Card>

        {espaco.janelas.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>
              Este espaço ainda não tem horários definidos para cessão. Procure a
              entidade.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {espaco.agendaPublica && agenda.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Próximos {DIAS_AGENDA} dias
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {agenda.map((dia) => (
                    <div key={dia.data} className="flex flex-wrap items-center gap-2">
                      <span className="w-28 shrink-0 text-sm font-medium">
                        {formatarData(dia.data)}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {dia.blocos.map((b, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className={
                              b.livre
                                ? "border-success/40 text-success-fg"
                                : "text-muted-foreground line-through"
                            }
                          >
                            {b.inicio}–{b.termino}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-muted-foreground text-xs">
                    Riscado = já ocupado ou bloqueado. A agenda é informativa; a
                    confirmação vem depois da análise do pedido.
                  </p>
                </CardContent>
              </Card>
            )}

            <PedidoForm
              espacoId={espaco.id}
              espacoNome={espaco.nome}
              publico={espaco.publico}
              capacidade={espaco.capacidade}
              regras={espaco.regras}
              temSessaoInterna={Boolean(sessao)}
            />
          </>
        )}
      </div>
    </main>
  )
}

/** Os próximos dias com horário oferecido, marcando o que já está ocupado. */
async function montarAgenda(
  espacoId: string,
  tenantId: string,
  janelas: { dia_semana: number; hora_inicio: string; hora_termino: string; modo: "slots" | "livre"; slot_minutos: number | null; rotulo: string | null }[]
) {
  const hoje = new Date()
  const fim = new Date(hoje.getTime() + DIAS_AGENDA * 86400000)
  const ocupados = await periodosOcupados(espacoId, tenantId, hoje, fim)

  const dias: { data: string; blocos: { inicio: string; termino: string; livre: boolean }[] }[] = []
  for (let i = 0; i < DIAS_AGENDA; i++) {
    const d = new Date(hoje.getTime() + i * 86400000)
    const data = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    const doDia = janelas.filter(
      (j) => j.dia_semana === new Date(`${data}T12:00:00-03:00`).getUTCDay()
    )
    if (doDia.length === 0) continue
    const blocos = doDia.flatMap((j) =>
      blocosDaJanela(j).map((b) => {
        const periodo = {
          inicio: new Date(`${data}T${b.inicio}:00-03:00`).getTime(),
          termino: new Date(`${data}T${b.termino}:00-03:00`).getTime(),
        }
        return {
          ...b,
          livre: !ocupados.some(
            (o) => periodo.inicio < o.termino && o.inicio < periodo.termino
          ),
        }
      })
    )
    if (blocos.length > 0) dias.push({ data, blocos })
  }
  return dias
}

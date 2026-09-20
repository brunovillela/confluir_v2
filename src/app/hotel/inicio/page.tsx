import type { Metadata } from "next"
import Link from "next/link"
import {
  BedDouble,
  CalendarCheck,
  FileWarning,
  LogIn,
  Plus,
  Ticket,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoHotel } from "@/lib/visualizacao-hotel"
import {
  cuponsAguardando,
  listarServicos,
  relatorioPendente,
} from "@/lib/db/hospedagem"
import { ehGarantida } from "@/lib/db/hospedagem-garantida"
import { formatarData } from "@/lib/formato"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Área do hotel — Confluir" }

/**
 * Tela inicial do hotel: só os grandes números e o que precisa de ação hoje.
 * As listas moram nas abas (Cupons, Reservas, Hóspedes por quarto), e as
 * tarifas, em Acordo e orientações.
 */
export default async function HotelInicioPage() {
  const { hotel, preview, gestorNome } = await requireVisualizacaoHotel()
  const garantida = ehGarantida(hotel)

  const [cupons, todosServicos] = await Promise.all([
    garantida ? Promise.resolve([]) : cuponsAguardando(hotel.id),
    listarServicos(),
  ])
  const servicos = todosServicos.filter((s) => s.hotel_id === hotel.id)

  const hoje = new Date().toISOString().slice(0, 10)
  const abertas = servicos.filter(
    (s) => s.finalizado !== true && (s.checkout_date ?? "") >= hoje
  )
  const chegamHoje = servicos.filter(
    (s) => s.finalizado !== true && s.checkin_date === hoje
  )
  const hospedesHoje = servicos
    .filter(
      (s) =>
        s.finalizado !== true &&
        (s.checkin_date ?? "") <= hoje &&
        (s.checkout_date ?? "") > hoje
    )
    .reduce((acc, s) => acc + (s.cuponsVinculados || s.quant_ocupantes || 0), 0)

  // O que trava dinheiro: encerrou e não subiu o relatório assinado, ou está
  // pronta para faturar e ninguém faturou.
  const semRelatorio = servicos.filter((s) => relatorioPendente(s, hoje))
  const aFaturar = servicos.filter(
    (s) => !s.faturaCodigo && s.comparecidos > 0 && (s.checkout_date ?? "") < hoje
  )

  const indicadores = [
    !garantida && {
      titulo: "Cupons aguardando reserva",
      valor: cupons.length,
      detalhe: "autorizações à espera da sua confirmação",
      icone: Ticket,
      href: "/hotel/cupons",
    },
    {
      titulo: "Reservas abertas",
      valor: abertas.length,
      detalhe: "com check-out de hoje em diante",
      icone: BedDouble,
      href: garantida ? "/hotel/hospedes" : "/hotel/reservas",
    },
    {
      titulo: "Hóspedes hoje",
      valor: hospedesHoje,
      detalhe: "hospedados pelo convênio nesta data",
      icone: Users,
      href: garantida ? "/hotel/hospedes" : undefined,
    },
    {
      titulo: "Chegadas de hoje",
      valor: chegamHoje.length,
      detalhe: "reservas com check-in nesta data",
      icone: LogIn,
      href: garantida ? "/hotel/recepcao" : "/hotel/reservas",
    },
  ].filter((i) => i !== false) as {
    titulo: string
    valor: number
    detalhe: string
    icone: typeof Ticket
    href?: string
  }[]

  return (
    <HotelShell
      nomeHotel={hotel.nome ?? "Hotel parceiro"}
      garantida={garantida}
      preview={preview ? { gestorNome } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {hotel.nome ?? "Hotel parceiro"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {garantida
              ? "Convênio de demanda garantida: o Confluir distribui os quartos e o hotel recebe a lista da noite."
              : "Convênio de pagamento por uso: o cupom espera a confirmação do hotel para virar reserva."}
          </p>
        </div>
        {!garantida && (
          <Button asChild>
            <Link href="/hotel/reservas/nova">
              <Plus />
              Registrar reserva
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((ind) => {
          const conteudo = (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{ind.titulo}</CardDescription>
                  <ind.icone className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl tabular-nums">
                  {ind.valor.toLocaleString("pt-BR")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
              </CardContent>
            </>
          )
          return ind.href ? (
            <Link key={ind.titulo} href={ind.href} className="group">
              <Card className="group-hover:border-primary/40 h-full transition-colors">
                {conteudo}
              </Card>
            </Link>
          ) : (
            <Card key={ind.titulo}>{conteudo}</Card>
          )
        })}
      </div>

      {(semRelatorio.length > 0 || aFaturar.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileWarning className="size-4" />
              Precisa da sua atenção
            </CardTitle>
            <CardDescription>
              O que está entre a hospedagem e o pagamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {semRelatorio.length > 0 && (
              <div>
                <p className="text-sm font-medium">
                  {semRelatorio.length} reserva(s) encerrada(s) sem o relatório assinado
                </p>
                <p className="text-muted-foreground text-xs">
                  Sem o relatório dos hóspedes a reserva não entra na fatura.
                </p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {semRelatorio.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/hotel/reservas/${s.id}`}
                        className="text-primary font-mono text-xs hover:underline"
                      >
                        {s.codigo ?? "(sem código)"}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · check-out {formatarData(s.checkout_date)}
                      </span>
                    </li>
                  ))}
                </ul>
                {semRelatorio.length > 5 && (
                  <Link
                    href="/hotel/reservas?situacao=sem_relatorio"
                    className="text-primary mt-1 inline-block text-xs hover:underline"
                  >
                    ver todas
                  </Link>
                )}
              </div>
            )}
            {aFaturar.length > 0 && (
              <div className="border-t pt-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CalendarCheck className="size-4" />
                  {aFaturar.length} reserva(s) com comparecimento e sem fatura
                </p>
                <p className="text-muted-foreground text-xs">
                  Já dá para emitir o faturamento delas.
                </p>
                <Button variant="outline" size="sm" asChild className="mt-2">
                  <Link href="/hotel/faturamento/nova">Emitir fatura</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </HotelShell>
  )
}

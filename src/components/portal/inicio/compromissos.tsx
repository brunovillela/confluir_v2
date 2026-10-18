import Link from "next/link"
import { BedDouble, CalendarCheck, CalendarDays, Vote, type LucideIcon } from "lucide-react"

import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { estadoVotacao, ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import type { Filiado } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import { linkDaInscricaoNoPortal, periodoDoEvento } from "@/lib/db/eventos-portal"
import { cuponsDoFiliado } from "@/lib/db/filiado-portal"
import { reservasGarantidasDaPessoa } from "@/lib/db/hospedagem-garantida"
import { aceitaAcao, aparece, registrosDaPessoa, type PartesDoInicio } from "@/lib/db/portal-inicio"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { somarDiasISO } from "@/lib/periodo-dias"

import { assembleiasSeAtivo, eventosDaPessoa, hoteisDaEntidade, tentar } from "./cargas"

/** No máximo três, e só os próximos 30 dias — para não virar lista (A32). */
const MAXIMO = 3
const DIAS_A_FRENTE = 30

type Variante = "success" | "secondary" | "outline" | "warning"

type Compromisso = {
  chave: string
  /** Para ordenar (ms); sem data, por último. */
  ordem: number
  icone: LucideIcon
  titulo: string
  quando: string
  situacao: { rotulo: string; variante: Variante } | null
  href: string
  /** Seção que tem a lista completa — "Mais em…" quando passa de três. */
  secao: { rotulo: string; href: string }
  /** Link de presença a confirmar (a resposta mesma fica em Eventos). */
  confirmarPresenca: string | null
}

/** Mesmas palavras da página de Eventos. */
const ROTULO_INSCRICAO: Record<string, { rotulo: string; variante: Variante }> = {
  confirmada: { rotulo: "inscrição confirmada", variante: "success" },
  pendente: { rotulo: "aguardando avaliação", variante: "secondary" },
  lista_espera: { rotulo: "lista de espera", variante: "secondary" },
}

const EVENTOS = { rotulo: "Eventos", href: "/portal/eventos" }
const HOSPEDAGEM = { rotulo: "Hospedagem", href: "/portal/hospedagem" }
const VOTACAO = { rotulo: "Votação", href: "/portal/votacao" }

/** Hoje e o fim da janela de 30 dias: como data (São Paulo) e como instante. */
function janela(): { hoje: string; ultimoDia: string; limite: number } {
  const hoje = hojeSP()
  return {
    hoje,
    ultimoDia: somarDiasISO(hoje, DIAS_A_FRENTE),
    limite: Date.now() + DIAS_A_FRENTE * 86_400_000,
  }
}

/** Instante (ms) do meio-dia de uma data AAAA-MM-DD em São Paulo — só para ordenar. */
function meioDia(data: string): number {
  return Date.parse(`${data.slice(0, 10)}T12:00:00-03:00`)
}

/**
 * Seus próximos compromissos (A32): o que a pessoa já assumiu e vai
 * acontecer — inscrições em eventos, a próxima hospedagem e a votação em que
 * já votou ou que ainda vai abrir. O que pede ação AGORA (votar, opor-se,
 * avaliar) fica em "Para você resolver"; aqui é lembrete, com link para cada
 * item. Some quando não há nada; se uma leitura falha, diz isso em vez de
 * sumir (A187).
 *
 * Só lê: no "Ver como filiado", a confirmação de presença vira texto (quem
 * responde é o associado), como nas avaliações pendentes.
 *
 * Filiados › Área do associado: Eventos, Hospedagem ou Votação desabilitada
 * não é consultada; com Eventos suspensa (ou o portal em modo de consulta), a
 * confirmação de presença também vira texto.
 */
export async function Compromissos({
  filiado,
  preview,
  partes,
}: {
  filiado: Filiado
  preview: boolean
  partes: PartesDoInicio
}) {
  const { hoje, ultimoDia, limite } = janela()
  const comHospedagem = aparece(partes, "hospedagem")
  // Parte desabilitada: nada a ler, e o bloco não diz que "não carregou".
  const nada = Promise.resolve({ valor: [] as never[] })

  const [eventos, cupons, reservas, assembleias] = await Promise.all([
    aparece(partes, "eventos") ? tentar("compromissos: eventos", () => eventosDaPessoa(filiado.cpf)) : nada,
    comHospedagem ? tentar("compromissos: cupons de hospedagem", () => cuponsDoFiliado(filiado.cpf)) : nada,
    comHospedagem
      ? tentar("compromissos: reservas de hospedagem", async () => {
          // Sem processar a fila dos hotéis (A195): o Início só lê.
          const [registros, hoteis] = await Promise.all([registrosDaPessoa(filiado.cpf), hoteisDaEntidade()])
          return reservasGarantidasDaPessoa(registros, hoteis)
        })
      : nada,
    aparece(partes, "votacao") ? assembleiasSeAtivo(filiado, "compromissos: votações") : nada,
  ])
  // Confirmar presença grava em Eventos: sem a parte aceitando ação, fica o texto.
  const soLeitura = preview || !aceitaAcao(partes, "eventos")
  const falhou = !eventos || !cupons || !reservas || !assembleias

  const itens: Compromisso[] = []

  for (const e of eventos?.valor ?? []) {
    if (!e.inscrito || e.passado) continue
    const rotulo = ROTULO_INSCRICAO[e.situacao ?? ""]
    if (!rotulo) continue // recusada (e cancelada, que nem chega como inscrita)
    const periodo = periodoDoEvento(e.evento)
    if (!periodo) continue // adiado sem nova data: não há quando lembrar
    const inicio = Date.parse(periodo.inicio)
    if (Number.isNaN(inicio) || inicio > limite) continue
    const cancelado = e.evento.situacao === "cancelado"
    // A44, como na página de Eventos: "confirmada" só quando a foto exigida
    // já foi enviada — sem ela a inscrição não se completa na porta.
    const faltaFoto = e.situacao === "confirmada" && e.fotoObrigatoria && !e.temFoto && !cancelado
    itens.push({
      chave: `evento-${e.evento.id}`,
      ordem: inicio,
      icone: CalendarDays,
      titulo: e.evento.titulo ?? "Evento",
      // Adiado: a data já é a nova (periodoDoEvento).
      quando: [formatarDataHora(periodo.inicio), e.evento.local].filter(Boolean).join(" · "),
      situacao: cancelado
        ? { rotulo: "evento cancelado", variante: "warning" }
        : faltaFoto
          ? { rotulo: "falta enviar a foto", variante: "warning" }
          : e.evento.situacao === "adiado"
            ? { rotulo: "adiado para esta data", variante: "warning" }
            : rotulo,
      href: e.inscricaoId ? linkDaInscricaoNoPortal(e.inscricaoId) : EVENTOS.href,
      secao: EVENTOS,
      // Mesma condição da página de Eventos para mostrar a pergunta.
      confirmarPresenca:
        !cancelado &&
        e.situacao === "confirmada" &&
        e.evento.exige_rsvp &&
        e.rsvpAberto &&
        e.rsvpConfirmado === null &&
        e.inscricaoId
          ? linkDaInscricaoNoPortal(e.inscricaoId)
          : null,
    })
  }

  // Cupom que o hotel já reservou (as reservas na hora vêm abaixo).
  for (const c of cupons?.valor ?? []) {
    const checkIn = (c.estadia?.checkIn ?? c.check_in)?.slice(0, 10)
    if (c.situacao !== "reservado" || !checkIn || checkIn < hoje || checkIn > ultimoDia) continue
    const checkOut = c.estadia?.checkOut ?? null
    itens.push({
      chave: `cupom-${c.id}`,
      ordem: meioDia(checkIn),
      icone: BedDouble,
      titulo: c.hotelNome ?? "Hotel parceiro",
      quando: checkOut ? `${formatarData(checkIn)} a ${formatarData(checkOut)}` : `check-in em ${formatarData(checkIn)}`,
      situacao: { rotulo: "reservado", variante: "success" },
      href: HOSPEDAGEM.href,
      secao: HOSPEDAGEM,
      confirmarPresenca: null,
    })
  }

  for (const r of reservas?.valor ?? []) {
    if (r.situacao !== "confirmada" || r.checkIn < hoje || r.checkIn > ultimoDia) continue
    itens.push({
      chave: `reserva-${r.id}`,
      ordem: meioDia(r.checkIn),
      icone: BedDouble,
      titulo: r.hotelNome ?? "Hotel parceiro",
      quando: `${formatarData(r.checkIn)} a ${formatarData(r.checkOut)}`,
      situacao: { rotulo: "reserva confirmada", variante: "success" },
      href: `/portal/hospedagem/reserva/${r.id}`,
      secao: HOSPEDAGEM,
      confirmarPresenca: null,
    })
  }

  // Votar agora e carência ficam em "Para você resolver"; aqui, a assembleia
  // em que já votou, a que ainda vai abrir e a presencial.
  for (const a of assembleias?.valor ?? []) {
    const estado = estadoVotacao(a)
    const titulo = a.nome ?? a.tema ?? "Assembleia"
    if (estado.chave === "ja_votou") {
      itens.push({
        chave: `assembleia-${a.assembleiaId}`,
        ordem: a.termino ? Date.parse(a.termino) : Number.MAX_SAFE_INTEGER,
        icone: Vote,
        titulo,
        quando: a.termino ? `votação até ${formatarDataHora(a.termino)}` : "votação em andamento",
        situacao: { rotulo: estado.rotulo, variante: "success" },
        href: `/portal/votacao/${a.assembleiaId}`,
        secao: VOTACAO,
        confirmarPresenca: null,
      })
    } else if (estado.chave === "nao_abriu" && a.abreEm) {
      itens.push({
        chave: `assembleia-${a.assembleiaId}`,
        ordem: Date.parse(a.abreEm),
        icone: Vote,
        titulo,
        quando: `votação abre em ${formatarDataHora(a.abreEm)}`,
        situacao: { rotulo: estado.rotulo, variante: "outline" },
        href: VOTACAO.href,
        secao: VOTACAO,
        confirmarPresenca: null,
      })
    } else if (estado.chave === "presencial") {
      itens.push({
        chave: `assembleia-${a.assembleiaId}`,
        ordem: a.inicio ? meioDia(a.inicio) : Number.MAX_SAFE_INTEGER,
        icone: Vote,
        titulo,
        quando: a.inicio
          ? `a partir de ${formatarData(a.inicio)}${a.horaInicio ? ` às ${a.horaInicio}` : ""}`
          : "confira as datas",
        situacao: { rotulo: ROTULOS_MODALIDADE[a.modalidade], variante: "outline" },
        href: a.rodadaId ? `/portal/votacao/rodada/${a.rodadaId}` : VOTACAO.href,
        secao: VOTACAO,
        confirmarPresenca: null,
      })
    }
  }

  if (itens.length === 0 && !falhou) return null

  itens.sort((x, y) => x.ordem - y.ordem)
  const visiveis = itens.slice(0, MAXIMO)
  const resto = itens.slice(MAXIMO)
  const maisEm = [...new Map(resto.map((c) => [c.secao.href, c.secao])).values()]

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
          <CalendarCheck className="text-muted-foreground size-4" aria-hidden />
          Seus próximos compromissos
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {visiveis.length > 0 && (
          <ul className="divide-y">
            {visiveis.map((c) => (
              <li key={c.chave} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                <Link
                  href={c.href}
                  className="group focus-visible:ring-ring/50 -mx-2 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 outline-none focus-visible:ring-3"
                >
                  <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <c.icone className="size-4.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium underline-offset-4 group-hover:underline">{c.titulo}</span>
                    <span className="text-muted-foreground block text-xs">{c.quando}</span>
                  </span>
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  {c.situacao && <Badge variant={c.situacao.variante}>{c.situacao.rotulo}</Badge>}
                  {c.confirmarPresenca &&
                    (soLeitura ? (
                      <span className="text-muted-foreground text-xs">Presença ainda não confirmada</span>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href={c.confirmarPresenca}>Confirmar presença</Link>
                      </Button>
                    ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {maisEm.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Mais compromissos em{" "}
            {maisEm.map((s, i) => (
              <span key={s.href}>
                {i > 0 && (i === maisEm.length - 1 ? " e " : ", ")}
                <Link
                  href={s.href}
                  className="text-foreground font-medium underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                >
                  {s.rotulo}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
        {falhou && (
          <Indisponivel className="text-xs">
            {visiveis.length > 0
              ? "Parte dos seus compromissos não carregou agora."
              : "Não foi possível carregar seus compromissos agora. Tente de novo daqui a pouco."}
          </Indisponivel>
        )}
      </CardContent>
    </Card>
  )
}

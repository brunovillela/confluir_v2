import type { Metadata } from "next"
import Link from "next/link"
import { EyeOff, ShieldCheck } from "lucide-react"

import {
  AvaliacoesIndicadores,
  Estrelas,
  lerPeriodo,
  rotuloMes,
} from "@/components/avaliacoes-indicadores"
import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hojeSP } from "@/lib/db/comum"
import { ehGarantida } from "@/lib/db/hospedagem-garantida"
import { AVISO_SQL_AVALIACOES, avaliacoesDoHotel, type AvaliacaoDoHotel } from "@/lib/db/hospedagem-avaliacoes"
import { formatarData } from "@/lib/formato"
import {
  calcularIndicadores,
  ETIQUETAS,
  etiquetasSaoElogio,
  ROTULO_NOTA,
  rotuloEtiqueta,
} from "@/lib/hospedagem-avaliacoes-constantes"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { tenantAtual } from "@/lib/tenant"
import { requireVisualizacaoHotel } from "@/lib/visualizacao-hotel"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Avaliações — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const POR_PAGINA = 30

/** O hotel nunca vê as etiquetas que falam do sistema do sindicato. */
const visivelAoHotel = (chave: string) => !ETIQUETAS.find((e) => e.chave === chave)?.soSindicato

/**
 * Avaliações das estadias no hotel — ANÔNIMAS: sem nome, sem datas exatas
 * (só o mês; data e quarto identificariam o hóspede), sem a etiqueta do
 * aplicativo e sem o texto que o sindicato moderou. Quem corta é
 * `avaliacoesDoHotel`; esta página só exibe. Somente leitura (o hotel não
 * responde nesta versão), então serve igual ao "Ver como o hotel".
 */
export default async function HotelAvaliacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { hotel, preview, gestorNome } = await requireVisualizacaoHotel()
  const sp = await searchParams

  const periodo = lerPeriodo(sp, hojeSP())
  const notaBruta = Number(sp.nota)
  const nota = Number.isInteger(notaBruta) && notaBruta >= 1 && notaBruta <= 5 ? notaBruta : null
  const soComentario = sp.comentario === "1"

  const { disponivel, linhas } = await avaliacoesDoHotel(
    await tenantAtual(),
    hotel.id,
    { de: periodo.de, ate: periodo.ate },
    visivelAoHotel
  )

  // Os indicadores olham o período inteiro; nota e comentário filtram a lista.
  const indicadores = calcularIndicadores(linhas, { incluirSoSindicato: false })
  // Pendentes não entram na lista: para o hotel, "alguém não avaliou" não
  // diz nada e só ajudaria a adivinhar quem foi.
  const respondidas = linhas.filter(
    (l) =>
      l.situacao === "respondida" &&
      (!nota || l.nota === nota) &&
      (!soComentario || Boolean(l.comentario) || l.comentarioOculto)
  )
  const paginacao = lerPaginacao(sp, POR_PAGINA)
  const pag = paginar(respondidas, paginacao)
  const temFiltro = !periodo.padrao || nota || soComentario

  return (
    <HotelShell
      nomeHotel={hotel.nome ?? "Hotel parceiro"}
      garantida={ehGarantida(hotel)}
      preview={preview ? { gestorNome } : undefined}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O que os hóspedes do sindicato acharam da estadia: nota de 1 a 5, o que se destacou ou pode melhorar e
          um comentário.
        </p>
      </div>

      <Alert>
        <ShieldCheck />
        <AlertDescription>
          As avaliações são <strong>anônimas</strong>: você vê a nota, as etiquetas e o comentário, com o mês da
          estadia — nunca o nome nem as datas exatas. Nesta versão o hotel não responde às avaliações; dúvidas ou
          contestações, fale com o sindicato.
        </AlertDescription>
      </Alert>

      {!disponivel ? (
        <Alert variant="warning">
          <AlertDescription>
            {preview ? AVISO_SQL_AVALIACOES : "As avaliações ainda não estão disponíveis — o sindicato está ativando o recurso."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <form method="GET" action="/hotel/avaliacoes" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="de" className="text-xs">
                Check-out de
              </Label>
              <Input id="de" type="date" name="de" defaultValue={periodo.de} className="h-9 w-40" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ate" className="text-xs">
                até
              </Label>
              <Input id="ate" type="date" name="ate" defaultValue={periodo.ate} className="h-9 w-40" />
            </div>
            <select name="nota" defaultValue={nota ? String(nota) : ""} className={SELECT} aria-label="Nota">
              <option value="">Todas as notas</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} estrela{n === 1 ? "" : "s"} — {ROTULO_NOTA[n]}
                </option>
              ))}
            </select>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="comentario"
                value="1"
                defaultChecked={soComentario}
                className="accent-primary size-4"
              />
              Só com comentário
            </label>
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
            {temFiltro && (
              <Button variant="ghost" asChild>
                <Link href="/hotel/avaliacoes">Limpar</Link>
              </Button>
            )}
          </form>

          <p className="text-muted-foreground -mt-3 text-xs">
            Período pelo check-out: {formatarData(periodo.de)} a {formatarData(periodo.ate)}
            {periodo.padrao ? " (últimos 90 dias)" : ""}. Os indicadores consideram o período inteiro; nota e
            comentário filtram só a lista.
          </p>

          <AvaliacoesIndicadores ind={indicadores} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avaliações ({respondidas.length.toLocaleString("pt-BR")})</CardTitle>
              <CardDescription>Da estadia mais recente para a mais antiga.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {respondidas.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma avaliação neste filtro.</p>
              ) : (
                <>
                  <ul className="grid gap-3">
                    {pag.linhas.map((a) => (
                      <ItemAvaliacao key={a.id} a={a} />
                    ))}
                  </ul>
                  {pag.totalPaginas > 1 && (
                    <Paginacao
                      total={pag.total}
                      pagina={pag.pagina}
                      totalPaginas={pag.totalPaginas}
                      porPagina={paginacao.porPagina}
                      padrao={POR_PAGINA}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </HotelShell>
  )
}

function ItemAvaliacao({ a }: { a: AvaliacaoDoHotel }) {
  const elogio = a.nota !== null && etiquetasSaoElogio(a.nota)
  return (
    <li className="grid gap-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <Estrelas nota={a.nota} />
          {a.nota !== null && <span className="text-muted-foreground text-xs">{ROTULO_NOTA[a.nota]}</span>}
        </span>
        <span className="text-muted-foreground text-xs first-letter:uppercase">
          Estadia em {rotuloMes(a.mes, true)}
        </span>
      </div>
      {a.etiquetas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground text-[11px]">{elogio ? "Destaques:" : "Pode melhorar:"}</span>
          {a.etiquetas.map((e) => (
            <Badge key={e} variant={elogio ? "success" : "warning"} className="text-[11px]">
              {rotuloEtiqueta(e)}
            </Badge>
          ))}
        </div>
      )}
      {a.comentario ? (
        <p className="text-sm whitespace-pre-line">“{a.comentario}”</p>
      ) : a.comentarioOculto ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs italic">
          <EyeOff className="size-3.5" />
          Comentário moderado pelo sindicato
        </p>
      ) : null}
    </li>
  )
}

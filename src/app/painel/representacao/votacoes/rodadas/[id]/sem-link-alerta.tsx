import Link from "next/link"
import { Download, LinkIcon, ListFilter, Send } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { HORAS_ALERTA_SEM_LINK, type RodadaSemLink } from "@/lib/db/votacao-sem-link"
import { formatarDataHora } from "@/lib/formato"
import { comFonte, hrefRodada } from "@/lib/votacao-navegacao"

/** Prazo até a abertura, em linguagem de gente. */
function prazo(horasAteAbrir: number): string {
  const horas = Math.max(0, horasAteAbrir)
  if (horas < 1) return "em menos de 1 hora"
  if (horas < 24) return `em ${Math.floor(horas)} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? "em 1 dia" : `em ${dias} dias`
}

/**
 * Alerta do topo da rodada: aptos que ainda não votaram e estão sem o link
 * pessoal (plano de adequação de 16/10/2026). Sem o link, o eleitor depende do
 * código por e-mail, que os firewalls de empresa barram. A cor sobe conforme a
 * abertura se aproxima: neutra, âmbar com 48 h, vermelha com 24 h ou aberta.
 */
export function SemLinkAlerta({ rodadaId, fonte, r }: { rodadaId: string; fonte?: string | null; r: RodadaSemLink }) {
  const horas = r.horasParaAbrir
  const variante =
    r.aberta || (horas !== null && horas <= 24)
      ? "error"
      : horas !== null && horas <= HORAS_ALERTA_SEM_LINK
        ? "warning"
        : "info"
  const partes = [
    r.pendentes > 0 && `${r.pendentes.toLocaleString("pt-BR")} com o aviso ainda não enviado`,
    r.semEmail > 0 && `${r.semEmail.toLocaleString("pt-BR")} sem e-mail`,
    r.falhas > 0 && `${r.falhas.toLocaleString("pt-BR")} com falha no envio`,
  ].filter(Boolean)

  return (
    <Alert variant={variante}>
      <LinkIcon />
      <AlertTitle>
        {r.semLink.toLocaleString("pt-BR")} {r.semLink === 1 ? "apto ainda sem" : "aptos ainda sem"} link pessoal de
        voto
      </AlertTitle>
      <AlertDescription>
        <p>
          {r.aberta
            ? "A votação pela internet está aberta. "
            : r.abreEm !== null
              ? `A votação pela internet abre ${formatarDataHora(new Date(r.abreEm).toISOString())} (${prazo(horas ?? 0)}). `
              : ""}
          Sem o link, a pessoa depende do código por e-mail, que o firewall da empresa costuma barrar.{" "}
          {partes.join(" · ")}.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(r.pendentes > 0 || r.falhas > 0) && (
            <Button size="sm" variant="outline" asChild>
              <a href={hrefRodada(rodadaId, fonte, "divulgacao")}>
                <Send />
                Ir para o envio
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={comFonte(hrefRodada(rodadaId, fonte, "aptos"), null, { link: "sem_link" })}>
              <ListFilter />
              Ver quem está sem link
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/painel/representacao/votacoes/rodadas/${rodadaId}/links-sem-link`} download>
              <Download />
              Baixar os links (planilha)
            </a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

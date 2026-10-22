import Link from "next/link"
import { MailX, Megaphone } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { RodadaEntregaRuim } from "@/lib/db/votacao-teste-entrega"
import { formatarData } from "@/lib/formato"
import { hrefRodada } from "@/lib/votacao-navegacao"

/**
 * Alerta do topo da rodada: o e-mail corporativo da empresa não chega a quem
 * vota — medido pelo aviso prévio desta rodada ou numa votação anterior da
 * mesma empresa (teste de entrega, fase 3 do plano de 21/10/2026).
 */
export function EntregaRuimAlerta({ rodadaId, fonte, r }: { rodadaId: string; fonte?: string | null; r: RodadaEntregaRuim }) {
  const n = (v: number) => v.toLocaleString("pt-BR")
  const pct = r.base ? Math.round((100 * r.sucesso) / r.base) : 0
  return (
    <Alert variant="warning">
      <MailX />
      <AlertTitle>O e-mail de @{r.dominio} não está chegando a quem vota</AlertTitle>
      <AlertDescription>
        <p>
          {r.motivo === "aviso_previo"
            ? `No aviso prévio desta rodada, só ${n(r.sucesso)} de ${n(r.base)} (${pct}%) confirmaram que receberam.`
            : r.anterior?.medida === "votacao"
              ? `Na ${r.anterior.rodadaNome ?? "votação anterior"} (${formatarData(r.anterior.medidoEm)}), só ${n(r.sucesso)} de ${n(r.base)} votos (${pct}%) vieram pelo link pessoal enviado a esse e-mail.`
              : `Na ${r.anterior?.rodadaNome ?? "rodada anterior"}, só ${n(r.sucesso)} de ${n(r.base)} (${pct}%) confirmaram o aviso prévio.`}{" "}
          O link pessoal mandado só para lá tende a não ser usado, e os eleitores caem no código por e-mail.
        </p>
        <p className="mt-2">
          Antes da abertura: divulgue o <strong>pré-cadastro</strong> (WhatsApp, delegados, cartaz) para cada um cadastrar o
          Telegram ou um e-mail pessoal — o link pessoal vai também para lá.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={hrefRodada(rodadaId, fonte, "divulgacao")}>
              <Megaphone />
              Ir para a divulgação
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

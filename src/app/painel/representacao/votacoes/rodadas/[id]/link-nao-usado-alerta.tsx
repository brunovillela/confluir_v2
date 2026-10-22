import Link from "next/link"
import { MailWarning, Megaphone } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { RodadaLinkNaoUsado } from "@/lib/db/votacao-link-nao-usado"
import { hrefRodada } from "@/lib/votacao-navegacao"

const pct = (n: number, de: number) => `${Math.round((100 * n) / Math.max(de, 1))}%`

/**
 * Alerta do topo da rodada com votação aberta: o link pessoal saiu e quase
 * ninguém vota por ele — os votos estão entrando pelo código por e-mail
 * (lib/db/votacao-link-nao-usado.ts, caso Halliburton de 21/10/2026).
 */
export function LinkNaoUsadoAlerta({ rodadaId, fonte, r }: { rodadaId: string; fonte?: string | null; r: RodadaLinkNaoUsado }) {
  const n = (v: number) => v.toLocaleString("pt-BR")
  return (
    <Alert variant="error">
      <MailWarning />
      <AlertTitle>O link pessoal não está sendo usado: os votos estão entrando pelo código</AlertTitle>
      <AlertDescription>
        <p>
          {n(r.peloCodigo)} de {n(r.votantes)} votos ({pct(r.peloCodigo, r.votantes)}) precisaram do código por e-mail e só{" "}
          {n(r.peloLink)} vieram pelo link pessoal. {n(r.tinhamLink)} desses eleitores já tinham o link na caixa quando
          votaram — ele foi entregue{r.dominio ? <> em <strong>@{r.dominio}</strong></> : null}, mas não chega a quem vota
          (filtro de segurança, quarentena ou caixa corporativa que o trabalhador não lê). Reenviar o link para o mesmo
          endereço não resolve.
        </p>
        <p className="mt-2">
          Enquanto a votação está aberta: na divulgação (WhatsApp, delegados), oriente a procurar o código também no{" "}
          <strong>lixo eletrônico</strong> e ofereça a entrada pelo <strong>Telegram</strong>, que não depende de código.
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

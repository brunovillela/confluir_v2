import Link from "next/link"
import { CheckCircle2, FileCheck2, Vote } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { EstadoForm } from "@/lib/contas"
import { formatarDataHora } from "@/lib/formato"

/**
 * O que a tela mostra do comprovante logo depois do voto. Sem diretiva: serve
 * à cédula (cliente, com o retorno da action) e à página da cédula refeita no
 * servidor (que lê a participação do banco — é ela que aparece no portal,
 * porque a action revalida a página).
 */
export type ComprovanteNaTela = {
  codigo: string | null
  quando: string | null
  /** Rótulo pronto do canal ("Votação online"). */
  canal: string | null
  /** O e-mail de confirmação saiu. */
  emailEnviado: boolean
  /** Para onde, quando se sabe. */
  emailPara?: string | null
}

/**
 * Estado da action de voto. `comprovante` só vem do portal; o terminal da
 * urna e o /votar público devolvem o EstadoForm de sempre.
 */
export type EstadoVoto = EstadoForm & { comprovante?: ComprovanteNaTela | null }

/**
 * Cartão "Voto registrado" (achado A46): o código em destaque, a hora em que o
 * voto foi computado, o canal, o caminho para o comprovante público e o de
 * volta — a tela pós-voto deixava de ser um beco sem saída. Sem comprovante
 * (SQL ausente, falha na emissão), o voto continua valendo e a tela diz onde
 * o código aparece depois.
 */
export function ComprovanteVoto({
  comprovante,
  titulo = "Voto registrado",
  voltarHref,
  voltarRotulo = "Voltar para Votação",
  semCodigo = "O código do comprovante aparece em Minhas votações.",
}: {
  comprovante: ComprovanteNaTela | null
  titulo?: string
  /** Sem ele, nenhum botão de volta (fluxos fora do portal). */
  voltarHref?: string
  voltarRotulo?: string
  semCodigo?: string
}) {
  const c = comprovante
  return (
    // role="status": quem usa leitor de tela ouve a confirmação ao aparecer.
    <div role="status" className="border-success/40 bg-success/10 grid gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <p className="text-success-fg flex items-center gap-2 text-base font-semibold">
          <CheckCircle2 className="size-5 shrink-0" />
          {titulo}
        </p>
        <p className="text-muted-foreground text-sm">
          {c?.quando ? <>Computado em {formatarDataHora(c.quando)}. </> : null}
          O voto é secreto: fica registrado que você participou, nunca em quem
          votou.
        </p>
      </div>

      {c?.codigo ? (
        <div className="bg-card grid gap-1 rounded-md border p-3">
          <span className="text-muted-foreground text-xs">Código do comprovante</span>
          <span className="font-mono text-2xl font-semibold tracking-wider">{c.codigo}</span>
          <span className="text-muted-foreground text-xs">
            {[c.canal, "guarde este código: ele comprova a sua participação"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{semCodigo}</p>
      )}

      {/* Só promete o e-mail quando ele saiu de fato. */}
      {c?.emailEnviado && (
        <p className="text-muted-foreground text-sm">
          {c.emailPara ? (
            <>
              Enviamos uma cópia para <span className="text-foreground font-medium">{c.emailPara}</span>.
            </>
          ) : (
            "Enviamos uma cópia para o seu e-mail."
          )}
        </p>
      )}

      {/* gap-y-3: se os botões quebrarem de linha, as áreas de toque (44 px)
          não se sobrepõem. */}
      {(c?.codigo || voltarHref) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {c?.codigo && (
            <Button variant="outline" asChild>
              <Link href={`/comprovante/${c.codigo}`}>
                <FileCheck2 />
                Ver comprovante
              </Link>
            </Button>
          )}
          {voltarHref && (
            <Button asChild>
              <Link href={voltarHref}>
                <Vote />
                {voltarRotulo}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

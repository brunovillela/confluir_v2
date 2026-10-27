"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Star } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  COMENTARIO_MAX,
  ETIQUETAS,
  NOTA_EXIGE_COMENTARIO,
  perguntaDasEtiquetas,
  ROTULO_NOTA,
} from "@/lib/hospedagem-avaliacoes-constantes"
import { cn } from "@/lib/utils"

import { enviarAvaliacaoAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * A Hospedagem no portal (Filiados › Área do associado), lida pela página:
 * - `liberada`: o de sempre;
 * - `pausada`: Hospedagem suspensa ou portal em modo de consulta — a volta
 *   fica, mas os pedidos não estão liberados agora;
 * - `fora`: Hospedagem ou portal desabilitados — a volta cairia em
 *   "indisponível" e some.
 */
export type HospedagemNoPortal = "liberada" | "pausada" | "fora"

/**
 * Caminho de volta ao portal (achado A148): a avaliação abre fora dele, sem o
 * menu, e o pedido que estava travado agora pode ser feito. Quem veio pelo
 * e-mail sem sessão cai no login do portal — o destino certo de todo jeito.
 */
export function VoltarAHospedagem({ hospedagem }: { hospedagem: HospedagemNoPortal }) {
  if (hospedagem === "fora") return null
  return (
    <Button asChild variant="outline">
      <Link href="/portal/hospedagem">
        <ArrowLeft />
        Voltar à Hospedagem
      </Link>
    </Button>
  )
}

/**
 * Como no Uber: primeiro as estrelas; com elas aparecem as etiquetas (elogios
 * com 5, "o que pode melhorar" com 1–4) e o comentário — obrigatório com 1–2.
 */
export function AvaliarForm({
  token,
  notaInicial,
  hospedagem,
}: {
  token: string
  notaInicial: number | null
  hospedagem: HospedagemNoPortal
}) {
  const [estado, acao, pendente] = useActionState(enviarAvaliacaoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [nota, setNota] = useState<number | null>(notaInicial)
  const [sobre, setSobre] = useState<number | null>(null)
  const [marcadas, setMarcadas] = useState<string[]>([])

  if (estado.ok) {
    return (
      <div className="grid justify-items-center gap-3 py-6 text-center">
        <CheckCircle2 className="text-success-fg size-10" />
        <p className="text-base font-medium">Obrigado pela avaliação!</p>
        <p className="text-muted-foreground text-sm">
          Ela ajuda o sindicato a cuidar dos convênios de hospedagem.
          {hospedagem === "liberada" && " Os novos pedidos no portal já estão liberados."}
        </p>
        <VoltarAHospedagem hospedagem={hospedagem} />
      </div>
    )
  }

  const exibida = sobre ?? nota
  const comentarioObrigatorio = nota !== null && nota <= NOTA_EXIGE_COMENTARIO

  function trocarNota(n: number) {
    // Mudou de "elogio" para "melhorar" (ou o contrário): as etiquetas mudam de sentido.
    if (nota !== null && (nota === 5) !== (n === 5)) setMarcadas([])
    setNota(n)
  }

  return (
    <form action={acao} {...envio} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="nota" value={nota ?? ""} />

      <div className="grid justify-items-center gap-2">
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label="Nota da hospedagem"
          onMouseLeave={() => setSobre(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nota === n}
              aria-label={`${n} estrela${n === 1 ? "" : "s"} — ${ROTULO_NOTA[n]}`}
              onClick={() => trocarNota(n)}
              onMouseEnter={() => setSobre(n)}
              className="rounded-md p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Star
                className={cn(
                  "size-10 transition-colors",
                  exibida !== null && n <= exibida ? "fill-primary text-primary" : "text-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </div>
        <p className="text-muted-foreground h-5 text-sm">
          {exibida ? ROTULO_NOTA[exibida] : "Toque nas estrelas"}
        </p>
      </div>

      {nota !== null && (
        <>
          <div className="grid gap-2">
            <p className="text-sm font-medium">{perguntaDasEtiquetas(nota)}</p>
            <div className="flex flex-wrap gap-2">
              {ETIQUETAS.map((e) => {
                const ativa = marcadas.includes(e.chave)
                return (
                  <label
                    key={e.chave}
                    className={cn(
                      // A caixa é sr-only: o anel de foco do teclado vai para a etiqueta.
                      "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors select-none has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      ativa ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <input
                      type="checkbox"
                      name="etiquetas"
                      value={e.chave}
                      checked={ativa}
                      onChange={() =>
                        setMarcadas((m) => (ativa ? m.filter((x) => x !== e.chave) : [...m, e.chave]))
                      }
                      className="sr-only"
                    />
                    {e.rotulo}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="comentario" className="text-sm font-medium">
              {comentarioObrigatorio ? "O que aconteceu? *" : "Quer contar mais? (opcional)"}
            </label>
            {/* O Textarea cresce com o texto; min-h-24 guarda as ~4 linhas de antes. */}
            <Textarea
              id="comentario"
              name="comentario"
              rows={4}
              maxLength={COMENTARIO_MAX}
              required={comentarioObrigatorio}
              minLength={comentarioObrigatorio ? 10 : undefined}
              placeholder={
                comentarioObrigatorio
                  ? "Conte o que deu errado — isso ajuda o sindicato a resolver com o hotel."
                  : "Algo que o hotel ou o sindicato deveria saber?"
              }
              className="min-h-24"
            />
            <p className="text-muted-foreground text-xs">
              O hotel vê a nota e o comentário sem o seu nome. A etiqueta &quot;Aplicativo&quot; vai só
              para o sindicato.
            </p>
          </div>
        </>
      )}

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pendente || nota === null}>
        {pendente && <Loader2 className="animate-spin" />}
        Enviar avaliação
      </Button>
    </form>
  )
}

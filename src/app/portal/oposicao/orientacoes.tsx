"use client"

import { useActionState, useState } from "react"
import { ArrowRight, Check, Loader2 } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import type { PerguntaFrequente } from "@/lib/oposicao-orientacoes"

import { confirmarDados, registrarCiencia } from "./actions"

/**
 * Perguntas frequentes da oposição (30/10/2026): as gerais do sistema e, por
 * último, as escritas para a campanha. Fechadas por padrão; cada uma abre
 * sozinha.
 */
export function PerguntasFrequentes({ itens }: { itens: PerguntaFrequente[] }) {
  if (itens.length === 0) return null
  return (
    <Accordion type="multiple">
      {itens.map((p, i) => (
        <AccordionItem key={i} value={String(i)}>
          <AccordionTrigger className="min-h-11 items-center text-left">{p.pergunta}</AccordionTrigger>
          {/* h-auto: o Radix fixa a altura medida ao abrir (ver votacao/page.tsx). */}
          <AccordionContent className="text-muted-foreground h-auto whitespace-pre-line">{p.resposta}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/**
 * "Li e quero prosseguir": a marca de que a pessoa leu as instruções e o
 * aviso de privacidade. O hash é o do texto mostrado — a action confere com
 * o de agora.
 */
export function CienciaForm({ campanhaId, hash }: { campanhaId: string; hash: string }) {
  const [estado, acao, pendente] = useActionState(registrarCiencia, {})
  const envio = useEnvioFormulario(acao, estado)
  const [li, setLi] = useState(false)
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="campanha_id" value={campanhaId} />
      <input type="hidden" name="hash" value={hash} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <Checkbox name="li" className="mt-0.5" checked={li} onCheckedChange={(v) => setLi(v === true)} />
        <span>
          Li as instruções desta campanha e o aviso de privacidade, e entendi o que preciso fazer e até quando.
        </span>
      </label>
      <div>
        <Button type="submit" disabled={pendente || !li}>
          {pendente ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Li e quero prosseguir
        </Button>
      </div>
    </form>
  )
}

/** Filiado: "Meus dados estão corretos" — liberado só com nada faltando. */
export function ConfirmarDadosForm({ campanhaId, liberado }: { campanhaId: string; liberado: boolean }) {
  const [estado, acao, pendente] = useActionState(confirmarDados, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="campanha_id" value={campanhaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente || !liberado}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Meus dados estão corretos — continuar
        </Button>
      </div>
      {!liberado && (
        <p className="text-muted-foreground text-xs">
          O botão libera depois de aceitar o termo e salvar os dados obrigatórios.
        </p>
      )}
    </form>
  )
}

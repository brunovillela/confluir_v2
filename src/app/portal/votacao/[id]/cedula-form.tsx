"use client"

import { useActionState, useRef, useState } from "react"
import { CheckCircle2, Loader2, Vote } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { PerguntaVoto } from "@/lib/db/votacao-portal"

import { ComprovanteVoto, type EstadoVoto } from "../comprovante-voto"

type Escolha = { pergunta: string; opcao: string }

export function CedulaForm({
  assembleiaId,
  perguntas,
  acao,
  camposOcultos,
  voltarHref,
  preview = false,
}: {
  assembleiaId: string
  perguntas: PerguntaVoto[]
  acao: (prev: EstadoVoto, formData: FormData) => Promise<EstadoVoto>
  camposOcultos?: Record<string, string>
  /**
   * Para onde voltar depois do voto (/portal/votacao no portal). Com ele, o
   * sucesso vira o cartão do comprovante; sem ele (terminal da urna, /votar),
   * continua a frase de sempre — a não ser que a action devolva comprovante.
   */
  voltarHref?: string
  /** "Ver como filiado": a cédula aparece para o atendente mostrar como é,
   *  mas o voto não sai daqui — ele é secreto e pessoal. */
  preview?: boolean
}) {
  const [estado, action, pendente] = useActionState(acao, {})
  const formRef = useRef<HTMLFormElement>(null)
  // Resumo das escolhas no diálogo de confirmação; nulo = diálogo fechado.
  const [resumo, setResumo] = useState<Escolha[] | null>(null)
  // Segunda passagem do submit (depois do "Confirmar voto"): deixa seguir.
  const confirmado = useRef(false)

  if (estado.ok) {
    if (estado.comprovante || voltarHref) {
      return <ComprovanteVoto comprovante={estado.comprovante ?? null} voltarHref={voltarHref} />
    }
    return (
      <Alert className="border-success/40 text-success-fg">
        <CheckCircle2 className="size-4" />
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  /**
   * Voto é irreversível: antes de enviar, um passo de confirmação com o que
   * foi marcado em cada pergunta (achado A92). Com várias perguntas, quem rola
   * até o botão já não vê as opções lá em cima — e um toque errado no celular
   * virava voto. A validação do navegador (uma opção por pergunta) vem antes.
   */
  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (confirmado.current) {
      confirmado.current = false
      return
    }
    e.preventDefault()
    const form = e.currentTarget
    if (!form.reportValidity()) return
    const dados = new FormData(form)
    setResumo(
      perguntas.map((p, i) => ({
        pergunta: `${i + 1}. ${p.pergunta ?? "Pergunta"}`,
        opcao: p.opcoes.find((o) => o.id === dados.get(`p_${p.id}`))?.texto ?? "(opção)",
      }))
    )
  }

  function confirmarVoto() {
    setResumo(null)
    // requestSubmit passa de novo pelo onSubmit (que agora deixa seguir) e
    // dispara a action do formulário, como um envio comum. Fora do clique do
    // diálogo, como em ui/confirmacao.tsx: o envio não nasce dentro de outro
    // evento.
    window.setTimeout(() => {
      const form = formRef.current
      // Inválido não gera submit: a marca ficaria pendurada e o próximo envio
      // pularia a confirmação.
      if (!form || !form.checkValidity()) return
      confirmado.current = true
      form.requestSubmit()
    }, 0)
  }

  // Em "Ver como filiado" o diálogo não abre: o envio já está desligado e o
  // AcaoVisualizacao explica que o voto é só do associado.
  const propsForm = preview ? formVisualizacao(true, action) : { action, onSubmit: aoEnviar }

  return (
    <>
      <form ref={formRef} {...propsForm} className="grid gap-6">
        <input type="hidden" name="assembleia_id" value={assembleiaId} />
        {camposOcultos &&
          Object.entries(camposOcultos).map(([nome, valor]) => (
            <input key={nome} type="hidden" name={nome} value={valor} />
          ))}
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}

        {perguntas.map((p, i) => (
          <fieldset key={p.id} className="grid gap-2">
            <legend className="text-sm font-medium">
              {i + 1}. {p.pergunta ?? "Pergunta"}
            </legend>
            <div className="grid gap-2">
              {p.opcoes.map((o) => (
                <label
                  key={o.id}
                  className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name={`p_${p.id}`}
                    value={o.id}
                    required
                    className="size-4"
                  />
                  {o.texto ?? "(opção)"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <Alert>
          <AlertDescription>
            Seu voto é <strong>secreto</strong>: o sistema registra que você
            participou, nunca em quem votou. Antes de registrar, mostramos suas
            escolhas para você conferir — depois de confirmar, não é possível
            votar de novo.
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <AcaoVisualizacao
            preview={preview}
            nota="O voto é secreto e pessoal — só o associado, na conta dele."
          >
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Vote />}
              {pendente ? "Registrando…" : "Revisar e votar"}
            </Button>
          </AcaoVisualizacao>
        </div>
      </form>

      <AlertDialog open={resumo !== null} onOpenChange={(aberto) => !aberto && setResumo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar seu voto</AlertDialogTitle>
            <AlertDialogDescription>
              Confira suas escolhas. Depois de confirmar, o voto não pode ser
              mudado nem dado de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="grid max-h-[50vh] gap-3 overflow-y-auto text-sm">
            {(resumo ?? []).map((e) => (
              <li key={e.pergunta} className="grid gap-0.5">
                <span className="text-muted-foreground">{e.pergunta}</span>
                <span className="font-medium">{e.opcao}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar e alterar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarVoto}>
              <Vote />
              Confirmar voto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

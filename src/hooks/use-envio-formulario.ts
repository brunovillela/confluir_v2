"use client"

import { startTransition, useEffect, useRef, type FormEvent, type RefObject } from "react"

/**
 * Envio de formulário com useActionState que NÃO apaga o que foi digitado
 * quando a action recusa.
 *
 * Com `<form action={formAction}>`, o React 19 reinicia o formulário ao fim de
 * toda action — inclusive quando ela devolve erro, e aí a pessoa perde o que
 * digitou (visto no Lançar reembolso: a data voltava para hoje e a
 * justificativa sumia). Aqui o envio passa por onSubmit + startTransition, e o
 * reinício só acontece quando a resposta não traz `erro` nem `apontamentos`
 * (a confirmação da auditoria) — o mesmo comportamento de antes no sucesso.
 *
 * Uso: `const envio = useEnvioFormulario(formAction, estado)` e
 * `<form action={formAction} {...envio}>`. O `action=` fica: antes de a página
 * hidratar, o envio segue pela action do servidor (sem ele, o navegador faria
 * um GET com os campos na URL); depois, o onSubmit cancela o evento e o React
 * não roda a action por conta própria (o mesmo de que depende confirmarEnvio).
 *
 * Opções: `antes` é um onSubmit próprio (ex.: confirmarEnvio), que roda primeiro
 * e, cancelando o evento, segura o envio; `ref` é a ref do formulário quando o
 * componente já tem uma.
 */
export function useEnvioFormulario(
  acao: (dados: FormData) => void,
  estado: unknown,
  opcoes: {
    antes?: (e: FormEvent<HTMLFormElement>) => unknown
    ref?: RefObject<HTMLFormElement | null>
  } = {}
) {
  const refInterna = useRef<HTMLFormElement>(null)
  const ref = opcoes.ref ?? refInterna
  const enviado = useRef(false)
  const anterior = useRef(estado)
  const { antes } = opcoes

  useEffect(() => {
    if (estado === anterior.current) return
    anterior.current = estado
    if (!enviado.current) return
    enviado.current = false
    const e = (estado ?? {}) as { erro?: unknown; apontamentos?: unknown[] }
    if (!e.erro && !e.apontamentos?.length) ref.current?.reset()
  }, [estado, ref])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    antes?.(e)
    if (e.defaultPrevented) return
    e.preventDefault()
    const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    enviado.current = true
    startTransition(() => acao(dados))
  }

  return { ref, onSubmit }
}

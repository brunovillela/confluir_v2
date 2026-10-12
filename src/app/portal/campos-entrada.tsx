"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { mascararCpfParcial } from "@/lib/cpf"

/** Estado das actions de entrada, do lado da tela. */
export type EstadoEntrada = { erro?: string; ok?: string }

/**
 * CPF com máscara, controlado de fora: um só valor para as duas abas da
 * entrada (A158) — trocar de "Código por e-mail" para "CPF e senha" não pede
 * os 11 dígitos de novo. Envia o valor mascarado; as actions limpam.
 */
export function CampoCpfPortal({
  valor,
  aoMudar,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "name"> & {
  valor: string
  aoMudar: (valor: string) => void
}) {
  return (
    <Input
      {...props}
      name="cpf"
      type="text"
      inputMode="numeric"
      autoComplete="username"
      placeholder="000.000.000-00"
      value={valor}
      onChange={(e) => aoMudar(mascararCpfParcial(e.target.value))}
    />
  )
}

/**
 * Erro ou confirmação da action. `id` deixa o campo apontar para o erro
 * (`aria-describedby`): o leitor de tela lê o motivo junto com o campo.
 */
export function Mensagens({ erro, ok, id }: EstadoEntrada & { id?: string }) {
  if (erro) {
    return (
      <Alert id={id} variant="destructive">
        <AlertDescription>{erro}</AlertDescription>
      </Alert>
    )
  }
  if (ok) {
    return (
      <Alert id={id}>
        <AlertDescription>{ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** `aria-describedby` com os ids que existem (o do erro só quando há erro). */
export function descritoPor(...ids: (string | false | null | undefined)[]): string | undefined {
  const lista = ids.filter(Boolean).join(" ")
  return lista || undefined
}

type ApiTurnstile = { reset: (widget?: string | HTMLElement) => void }

/**
 * Pede um token novo ao Turnstile do formulário depois de cada envio. O token
 * vale uma conferência só (lib/turnstile.ts): sem renovar, o segundo envio do
 * mesmo formulário — senha digitada errado, "Reenviar código" — esbarrava em
 * "não foi possível confirmar que você não é um robô". Sem o widget (chaves
 * ausentes), não faz nada.
 */
export function renovarTurnstile(form: HTMLFormElement | null): void {
  const widget = form?.querySelector<HTMLElement>(".cf-turnstile")
  const turnstile = (window as typeof window & { turnstile?: ApiTurnstile }).turnstile
  if (!widget || !turnstile) return
  try {
    turnstile.reset(widget)
  } catch {
    // Widget ainda não desenhado: o token atual segue valendo.
  }
}

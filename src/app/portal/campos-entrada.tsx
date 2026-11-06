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

// Mudou para o componente do widget (06/11/2026): o painel e o hotel também usam.
export { renovarTurnstile } from "@/components/auth/turnstile"

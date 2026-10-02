"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, Search, Siren } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  buscarFiliadoEmergencialAction,
  registrarCupomEmergencialAction,
  type EstadoBusca,
  type EstadoRegistro,
} from "./actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

/** "000.000.000-00" enquanto digita. */
function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2")
}

/**
 * Dois passos: o CPF (o sistema confere se a pessoa está apta a usar ESTE
 * hotel HOJE) e a confirmação com o motivo. Nada é gravado no primeiro passo.
 */
export function CupomEmergencialForm({ hoje, preview }: { hoje: string; preview: boolean }) {
  const [busca, buscar, buscando] = useActionState<EstadoBusca, FormData>(buscarFiliadoEmergencialAction, {})
  const [registro, registrar, registrando] = useActionState<EstadoRegistro, FormData>(
    registrarCupomEmergencialAction,
    {}
  )
  const [cpf, setCpf] = useState("")

  if (registro.ok) {
    return (
      <div className="grid justify-items-start gap-3">
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 />
          <AlertDescription>{registro.ok}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          {!registro.garantida && (
            <Button asChild>
              <Link href="/hotel/reservas/nova">Registrar reserva</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.location.reload()}>
            Outro cupom emergencial
          </Button>
        </div>
      </div>
    )
  }

  const apto = busca.filiado && busca.cpf === cpf.replace(/\D/g, "")

  return (
    <div className="grid gap-5">
      <form action={buscar} className="grid gap-2 sm:max-w-md">
        <Label htmlFor="cpf">CPF do hóspede</Label>
        <div className="flex gap-2">
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            required
          />
          <Button type="submit" variant="secondary" disabled={buscando || preview}>
            {buscando ? <Loader2 className="animate-spin" /> : <Search />}
            Buscar
          </Button>
        </div>
        {busca.erro && (
          <Alert variant="destructive">
            <AlertDescription>{busca.erro}</AlertDescription>
          </Alert>
        )}
      </form>

      {apto && busca.filiado && (
        <form action={registrar} className="grid gap-4 rounded-lg border p-4">
          <input type="hidden" name="cpf" value={busca.cpf} />
          <p className="text-sm">
            <strong>{busca.filiado.nomeExibicao}</strong> está apto(a) a se hospedar aqui hoje.
          </p>
          {busca.filiado.garantida ? (
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="check_out">Data de saída *</Label>
              <Input id="check_out" name="check_out" type="date" min={hoje} required />
              <p className="text-muted-foreground text-xs">Entrada hoje; o quarto é definido na hora.</p>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="aceita_quarto_coletivo" className="size-4" />
              Aceita quarto coletivo
            </label>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="motivo">Por que o hóspede não conseguiu pedir pelo portal? *</Label>
            <textarea
              id="motivo"
              name="motivo"
              rows={2}
              required
              minLength={5}
              placeholder="Ex.: sem internet no celular; não lembrava a senha do portal"
              className={TEXTAREA}
            />
            <p className="text-muted-foreground text-xs">
              Fica registrado que o hotel fez o cupom em caráter emergencial, e o sindicato é avisado.
            </p>
          </div>
          {registro.erro && (
            <Alert variant="destructive">
              <AlertDescription>{registro.erro}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button type="submit" disabled={registrando || preview}>
              {registrando ? <Loader2 className="animate-spin" /> : <Siren />}
              {busca.filiado.garantida ? "Fazer reserva emergencial" : "Registrar cupom emergencial"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

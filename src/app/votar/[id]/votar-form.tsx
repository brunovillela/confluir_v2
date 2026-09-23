"use client"

import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"

import { CampoCpf } from "@/components/auth/campo-cpf"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import {
  confirmarTokenEleitor,
  confirmarTokenEmail,
  solicitarTokenEleitor,
  solicitarTokenEmail,
} from "./actions"

type Modo = "cpf" | "email"

export function VotarForm({ assembleiaId }: { assembleiaId: string }) {
  const [modo, setModo] = useState<Modo>("cpf")

  // Preserva o identificador digitado para o passo de confirmação.
  const [cpf, setCpf] = useState("")
  const [email, setEmail] = useState("")

  const [estCpf, actCpf, pendCpf] = useActionState(
    async (prev: { erro?: string; ok?: string }, formData: FormData) => {
      setCpf(String(formData.get("cpf") ?? ""))
      return solicitarTokenEleitor(prev, formData)
    },
    {}
  )
  const [, actCpfConf, pendCpfConf] = useActionState(confirmarTokenEleitor, {})

  const [estEmail, actEmail, pendEmail] = useActionState(
    async (prev: { erro?: string; ok?: string }, formData: FormData) => {
      setEmail(String(formData.get("email") ?? ""))
      return solicitarTokenEmail(prev, formData)
    },
    {}
  )
  const [, actEmailConf, pendEmailConf] = useActionState(
    confirmarTokenEmail,
    {}
  )

  const est = modo === "cpf" ? estCpf : estEmail
  // "link" = mandamos o link pessoal por e-mail; não há código para digitar.
  const linkEnviado = est.modo === "link"
  const aguardandoCodigo = Boolean(est.ok) && !linkEnviado

  return (
    <Card>
      <CardHeader>
        <CardTitle>Votação online</CardTitle>
        <CardDescription>
          {linkEnviado
            ? "Procure o e-mail e clique no botão para votar."
            : aguardandoCodigo
              ? "Digite o código enviado ao seu e-mail."
              : "Identifique-se para receber o seu link de votação."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {linkEnviado && (
          <div className="grid gap-3">
            <Alert variant="success">
              <AlertDescription>{est.ok}</AlertDescription>
            </Alert>
            <p className="text-muted-foreground text-xs">
              O link é pessoal e abre a cédula direto, sem código. Confira também
              o lixo eletrônico. Se o e-mail não chegar, fale com o sindicato.
            </p>
          </div>
        )}

        {!aguardandoCodigo && !linkEnviado && (
          <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1 text-sm">
            {(
              [
                ["cpf", "Sou filiado (CPF)"],
                ["email", "Não sou filiado (e-mail)"],
              ] as const
            ).map(([m, rotulo]) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  modo === m
                    ? "bg-background font-medium shadow-xs"
                    : "text-muted-foreground"
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        {/* Passo 1 — pedir o código */}
        {!aguardandoCodigo && !linkEnviado && modo === "cpf" && (
          <form action={actCpf} className="grid gap-4">
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            {estCpf.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estCpf.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="cpf">CPF</Label>
              <CampoCpf id="cpf" name="cpf" required />
            </div>
            <Button type="submit" disabled={pendCpf}>
              {pendCpf && <Loader2 className="animate-spin" />}
              Receber meu link de votação
            </Button>
          </form>
        )}

        {!aguardandoCodigo && !linkEnviado && modo === "email" && (
          <form action={actEmail} className="grid gap-4">
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            {estEmail.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estEmail.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail (o que a empresa informou)</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit" disabled={pendEmail}>
              {pendEmail && <Loader2 className="animate-spin" />}
              Receber meu link de votação
            </Button>
          </form>
        )}

        {/* Passo 2 — confirmar o código */}
        {aguardandoCodigo && (
          <form
            action={modo === "cpf" ? actCpfConf : actEmailConf}
            className="grid gap-4"
          >
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            {modo === "cpf" ? (
              <input type="hidden" name="cpf" value={cpf} />
            ) : (
              <input type="hidden" name="email" value={email} />
            )}
            <Alert>
              <AlertDescription>{est.ok}</AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label htmlFor="token">Código de verificação</Label>
              <Input
                id="token"
                name="token"
                inputMode="numeric"
                pattern="\d{6,10}"
                maxLength={10}
                placeholder="Código"
                className="text-center text-lg tracking-[0.4em]"
                required
              />
            </div>
            <Button type="submit" disabled={pendCpfConf || pendEmailConf}>
              {(pendCpfConf || pendEmailConf) && (
                <Loader2 className="animate-spin" />
              )}
              Confirmar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

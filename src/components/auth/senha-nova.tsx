"use client"

import { useState } from "react"
import { Check, Circle } from "lucide-react"

import { CampoSenha } from "@/components/ui/campo-senha"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Mínimo conferido também no servidor (acesso/senha e definir-senha). */
export const SENHA_MINIMO = 8

/**
 * Os dois campos de quem CRIA a senha (link do e-mail e definir-senha), com o
 * que a senha precisa ter à vista e marcado conforme a pessoa digita — em vez
 * de ela só descobrir a regra depois do erro (09/11/2026). Os nomes dos
 * campos (`senha`, `confirmacao`) são os que as actions leem.
 */
export function SenhaNova({ rotulo = "Senha" }: { rotulo?: string }) {
  const [senha, setSenha] = useState("")
  const [confirmacao, setConfirmacao] = useState("")

  const tamanhoOk = senha.length >= SENHA_MINIMO
  const iguais = confirmacao.length > 0 && senha === confirmacao

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="senha">{rotulo}</Label>
        <CampoSenha
          id="senha"
          name="senha"
          autoComplete="new-password"
          minLength={SENHA_MINIMO}
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          aria-describedby="senha-requisitos"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmacao">Confirmar senha</Label>
        <CampoSenha
          id="confirmacao"
          name="confirmacao"
          autoComplete="new-password"
          minLength={SENHA_MINIMO}
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          aria-describedby="senha-requisitos"
          aria-invalid={confirmacao.length >= senha.length && confirmacao.length > 0 && !iguais}
        />
      </div>
      <div id="senha-requisitos" className="bg-muted/50 grid gap-1.5 rounded-lg p-3 text-sm">
        <p className="font-medium">A senha precisa ter:</p>
        <ul className="grid gap-1" aria-live="polite">
          <Requisito ok={tamanhoOk}>
            Pelo menos {SENHA_MINIMO} caracteres
            {senha.length > 0 && !tamanhoOk && ` (faltam ${SENHA_MINIMO - senha.length})`}
          </Requisito>
          <Requisito ok={iguais}>A mesma senha nos dois campos</Requisito>
        </ul>
        <p className="text-muted-foreground text-xs">
          Dica: misture letras, números e símbolos, ou use uma frase curta. Senhas óbvias (como
          12345678 ou o seu nome) e senhas que já vazaram na internet podem ser recusadas. Use o
          olho no campo para conferir o que digitou.
        </p>
      </div>
    </>
  )
}

function Requisito({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-success-fg" :"text-muted-foreground")}>
      {ok ? <Check className="size-4 shrink-0" aria-hidden /> : <Circle className="size-3.5 shrink-0" aria-hidden />}
      <span>
        {children}
        <span className="sr-only">{ok ? " — atendido" : " — ainda não"}</span>
      </span>
    </li>
  )
}

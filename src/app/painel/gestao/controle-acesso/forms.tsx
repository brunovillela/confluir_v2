"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Loader2, Power, RefreshCw, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { CONECTORES } from "@/lib/acesso-agente-constantes"
import { type EstadoForm } from "@/lib/contas"

import { cadastrarAgenteAction, desligarAction, novoCodigoAction, verificarAction, type EstadoCodigo } from "./actions"

/** O código em letras grandes, para ler na tela e digitar no assistente. */
function Codigo({ codigo }: { codigo: string }) {
  return (
    <div className="grid gap-1">
      <p className="font-mono text-3xl font-semibold tracking-[0.3em]">{codigo}</p>
      <p className="text-muted-foreground text-xs">Vale por 15 minutos e só uma vez.</p>
    </div>
  )
}

export function NovoAgenteForm({ sedes }: { sedes: { id: string; nome: string }[] }) {
  const [estado, action, pendente] = useActionState<EstadoCodigo, FormData>(cadastrarAgenteAction, {})
  if (estado.codigo) {
    return (
      <div className="grid gap-3">
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
        <Codigo codigo={estado.codigo} />
      </div>
    )
  }
  return (
    <form action={action} className="grid gap-3">
      <ErroNoCampo estado={estado} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome do computador</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Recepção — Macaé" required maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sede_id">Sede</Label>
          <SelectNativo id="sede_id" name="sede_id" required defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="conector">Sistema de catracas</Label>
          <SelectNativo id="conector" name="conector" defaultValue="simulado">
            {CONECTORES.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Cadastrar e gerar código
        </Button>
      </div>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

export function NovoCodigoBotao({ agenteId, rotulo = "Novo código" }: { agenteId: string; rotulo?: string }) {
  const [estado, action, pendente] = useActionState<EstadoCodigo, FormData>(novoCodigoAction, {})
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="agente_id" value={agenteId} />
      {estado.codigo ? (
        <Codigo codigo={estado.codigo} />
      ) : (
        <div>
          <Button type="submit" size="sm" variant="outline" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {rotulo}
          </Button>
        </div>
      )}
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function VerificarBotao({ agenteId, pendenteNoAgente }: { agenteId: string; pendenteNoAgente: boolean }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(verificarAction, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="agente_id" value={agenteId} />
      <Button type="submit" size="sm" variant="outline" disabled={pendente || pendenteNoAgente}>
        {pendente || pendenteNoAgente ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {pendenteNoAgente ? "Verificando…" : "Testar de novo"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function DesligarBotao({ agenteId, nome }: { agenteId: string; nome: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(desligarAction, {})
  return (
    <form action={action} className="flex items-center gap-2" onSubmit={(e) => confirmarEnvio(e, `Desligar o agente "${nome}"? O token dele deixa de valer na hora; para voltar, cadastre o computador de novo.`)}>
      <input type="hidden" name="agente_id" value={agenteId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Power />}
        Desligar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/** Recarrega a página a cada `ms` enquanto ela estiver visível (status ao vivo). */
export function AtualizarSozinho({ ms }: { ms: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, ms)
    return () => window.clearInterval(id)
  }, [ms, router])
  return null
}

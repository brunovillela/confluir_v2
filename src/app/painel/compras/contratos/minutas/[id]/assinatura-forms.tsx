"use client"

import { useActionState } from "react"
import { Ban, FileUp, Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { mascaraCpf } from "@/lib/mascaras"

import { anexarAssinadoAction, cancelarAssinaturaAction, enviarParaAssinaturaAction } from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

type Pessoa = { nome: string; email: string; cpf: string }

function Linha({ prefixo, rotulo, valor, obrigatorio }: { prefixo: string; rotulo: string; valor?: Partial<Pessoa>; obrigatorio: boolean }) {
  return (
    <fieldset className="grid gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{rotulo}</legend>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_11rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}_nome`}>Nome completo{obrigatorio ? " *" : ""}</Label>
          <Input id={`${prefixo}_nome`} name={`${prefixo}_nome`} required={obrigatorio} defaultValue={valor?.nome ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}_email`}>E-mail{obrigatorio ? " *" : ""}</Label>
          <Input id={`${prefixo}_email`} name={`${prefixo}_email`} type="email" required={obrigatorio} defaultValue={valor?.email ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}_cpf`}>CPF{obrigatorio ? " *" : ""}</Label>
          <Input
            id={`${prefixo}_cpf`}
            name={`${prefixo}_cpf`}
            inputMode="numeric"
            required={obrigatorio}
            placeholder="000.000.000-00"
            defaultValue={valor?.cpf ? mascaraCpf(valor.cpf) : ""}
            onChange={(e) => {
              e.target.value = mascaraCpf(e.target.value)
            }}
          />
        </div>
      </div>
    </fieldset>
  )
}

export function EnviarAssinaturaForm({
  id,
  papelEntidade,
  entidade,
  outraParte,
}: {
  id: string
  papelEntidade: string
  entidade: Pessoa
  outraParte: Partial<Pessoa>
}) {
  const [estado, acao, pendente] = useActionState(enviarParaAssinaturaAction, {})
  const papelOutra = papelEntidade === "contratada" ? "Contratante" : "Contratada"
  const papelEnt = papelEntidade === "contratada" ? "Contratada" : "Contratante"
  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-muted-foreground text-xs">
        Ordem das assinaturas: 1º a outra parte, 2º a entidade, depois as testemunhas. Cada um recebe o
        link quando chega a sua vez. O CPF informado aqui é conferido com o que a pessoa digitar.
      </p>
      <Linha prefixo="outra" rotulo={`1. ${papelOutra} (outra parte) — quem assina`} valor={outraParte} obrigatorio />
      <Linha prefixo="ent" rotulo={`2. ${papelEnt} (a entidade) — quem assina`} valor={entidade} obrigatorio />
      <Linha prefixo="t1" rotulo="3. Testemunha (opcional)" obrigatorio={false} />
      <Linha prefixo="t2" rotulo="4. Testemunha (opcional)" obrigatorio={false} />
      <p className="text-muted-foreground text-xs">
        Com duas testemunhas, o contrato assinado vale como título executivo extrajudicial (cobrança
        direta, sem processo de conhecimento). Informe as duas ou nenhuma.
      </p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar para assinatura
        </Button>
      </div>
    </form>
  )
}

export function CancelarAssinatura({ id }: { id: string }) {
  return (
    <form
      action={cancelarAssinaturaAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Cancelar o envio? Os links deixam de valer e as assinaturas já dadas nesta rodada são anuladas.")
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" className="text-destructive">
        <Ban />
        Cancelar envio
      </Button>
    </form>
  )
}

export function AnexarAssinadoForm({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(anexarAssinadoAction, {})
  return (
    <form action={acao} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo_assinado">PDF assinado com certificado digital (ICP-Brasil) ou pelo gov.br</Label>
        <Input id="arquivo_assinado" name="arquivo" type="file" accept="application/pdf,.pdf" required />
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
          Anexar PDF assinado
        </Button>
      </div>
    </form>
  )
}

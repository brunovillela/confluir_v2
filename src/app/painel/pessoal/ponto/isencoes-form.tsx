"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { criarIsencaoPonto, encerrarIsencaoPonto, excluirIsencaoPonto } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Nova isenção de registro de ponto: funcionário, período e justificativa.
 * Enviado por transição para o formulário não se esvaziar quando a action
 * devolve erro.
 */
export function IsencaoPontoForm({
  funcionarios,
  funcionarioId,
  voltar,
}: {
  funcionarios: { usuarioId: string; nome: string }[]
  funcionarioId?: string
  voltar: string
}) {
  const [estado, formAction, pendente] = useActionState(criarIsencaoPonto, {})
  const [, iniciar] = useTransition()
  const [semPrazo, setSemPrazo] = useState(true)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova isenção de registro de ponto</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            iniciar(() => formAction(dados))
          }}
        >
          <input type="hidden" name="voltar" value={voltar} />
          <ErroNoCampo estado={estado} />
          {estado.erro && !estado.campo && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-3 lg:col-span-1">
              <Label htmlFor="isencao-funcionario">Funcionário</Label>
              <select id="isencao-funcionario" name="funcionario_id" defaultValue={funcionarioId ?? ""} className={SELECT}>
                <option value="" disabled>
                  Escolha…
                </option>
                {funcionarios.map((f) => (
                  <option key={f.usuarioId} value={f.usuarioId}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="isencao-inicio">Início</Label>
              <Input id="isencao-inicio" name="inicio" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="isencao-fim">Fim</Label>
              <Input id="isencao-fim" name="fim" type="date" disabled={semPrazo} />
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <input type="checkbox" checked={semPrazo} onChange={(e) => setSemPrazo(e.target.checked)} />
                Sem prazo definido
              </label>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="isencao-justificativa">Justificativa</Label>
            <Textarea
              id="isencao-justificativa"
              name="justificativa"
              rows={3}
              placeholder="Ex.: cargo de gestão, dispensado do controle de jornada (art. 62, II, da CLT)."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Registrar isenção
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href={voltar}>Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Define o último dia de uma isenção vigente (o histórico fica). */
export function EncerrarIsencaoBotao({ id, hoje }: { id: string; hoje: string }) {
  const [estado, formAction, pendente] = useActionState(encerrarIsencaoPonto, {})
  const envio = useEnvioFormulario(formAction, estado)
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAberto(true)}>
        Encerrar
      </Button>
    )
  }
  return (
    <form action={formAction} {...envio} className="inline-flex flex-wrap items-center justify-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Input name="fim" type="date" defaultValue={hoje} aria-label="Último dia da isenção" className="h-7 w-36" />
      <Button type="submit" size="sm" className="h-7 px-2" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : "Encerrar"}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive w-full text-right text-xs">{estado.erro}</span>}
    </form>
  )
}

export function ExcluirIsencaoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirIsencaoPonto, {})
  const envio2 = useEnvioFormulario(formAction, estado, {
    antes: (e) => confirmarEnvio(e, "Excluir esta isenção? Use só para lançamento feito por engano; para terminar uma isenção, encerre-a."),
  })
  return (
    <form
      action={formAction} {...envio2}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="text-destructive mr-1 text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Excluir isenção"
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

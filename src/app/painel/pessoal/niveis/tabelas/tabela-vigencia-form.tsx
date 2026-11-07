"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { nomeTabelaSalarial } from "@/lib/tabela-salarial"

import { excluirTabela, salvarTabelaSalarial, tornarVigente } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Registro da tabela: início, término e o nome que sai deles. */
export function TabelaVigenciaForm({
  tabela,
  origens = [],
  aoCancelarHref = "/painel/pessoal/niveis/tabelas",
}: {
  tabela?: { id: string; data_inicio: string | null; data_fim: string | null }
  /** Só ao criar: tabelas de onde copiar os degraus. */
  origens?: { id: string; rotulo: string }[]
  /** Para onde o Cancelar leva (na edição, de volta à tabela). */
  aoCancelarHref?: string
}) {
  const [estado, formAction, pendente] = useActionState(salvarTabelaSalarial, {})
  const envio = useEnvioFormulario(formAction, estado)
  const [inicio, setInicio] = useState(tabela?.data_inicio ?? "")
  const [fim, setFim] = useState(tabela?.data_fim ?? "")
  const nome = inicio && fim ? nomeTabelaSalarial(inicio, fim) : null

  return (
    <form action={formAction} {...envio} className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registro e vigência</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {estado.erro && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {tabela && <input type="hidden" name="id" value={tabela.id} />}
          <div className="grid gap-1.5">
            <Label htmlFor="data_inicio">Início da vigência *</Label>
            <Input
              id="data_inicio"
              name="data_inicio"
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data_fim">Término da vigência *</Label>
            <Input
              id="data_fim"
              name="data_fim"
              type="date"
              required
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div className="grid content-center gap-0.5">
            <span className="text-muted-foreground text-xs">Nome da tabela, gerado pelo sistema</span>
            <span className="text-sm font-medium">{nome ?? "Informe o início e o término"}</span>
          </div>
          {!tabela && (
            <div className="grid gap-1.5">
              <Label htmlFor="copiar_de">Degraus</Label>
              <select id="copiar_de" name="copiar_de" defaultValue={origens[0]?.id ?? ""} className={SELECT}>
                {origens.map((o) => (
                  <option key={o.id} value={o.id}>
                    Copiar de {o.rotulo}
                  </option>
                ))}
                <option value="">Começar em branco</option>
              </select>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={aoCancelarHref}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {tabela ? "Salvar vigência" : "Criar tabela"}
        </Button>
      </div>
    </form>
  )
}

export function TornarVigenteBotao({ id, nome, mudam, sem }: { id: string; nome: string; mudam: number; sem: number }) {
  const [estado, formAction, pendente] = useActionState(tornarVigente, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(e, {
        titulo: `Tornar ${nome} a tabela vigente?`,
        descricao: `${mudam} funcionário(s) mudam para o degrau equivalente e são avisados no sino.${sem ? ` ${sem} sem equivalente continuam na tabela anterior, até trocar à mão.` : ""} A tabela anterior fica guardada.`,
        confirmar: "Tornar vigente",
      })
    },
  })
  return (
    <form action={formAction} {...envio} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pendente} className="justify-self-end">
        {pendente && <Loader2 className="animate-spin" />}
        Tornar vigente
      </Button>
    </form>
  )
}

export function ExcluirTabelaBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirTabela, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(e, {
        titulo: "Excluir esta tabela?",
        descricao: "Os degraus dela saem junto. Não dá para desfazer.",
        confirmar: "Excluir tabela",
        destrutivo: true,
      })
    },
  })
  return (
    <form action={formAction} {...envio} className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" disabled={pendente} className="text-destructive hover:text-destructive">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir tabela
      </Button>
    </form>
  )
}

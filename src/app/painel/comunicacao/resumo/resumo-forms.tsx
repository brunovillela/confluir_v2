"use client"

import { useActionState, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Save, Sparkles, Trash2, Wand2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  adicionarFonteAction,
  gerarAgoraAction,
  melhorarPromptAction,
  removerFonteAction,
  salvarConfigAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const DIAS = [
  { v: "1", r: "Segunda" },
  { v: "2", r: "Terça" },
  { v: "3", r: "Quarta" },
  { v: "4", r: "Quinta" },
  { v: "5", r: "Sexta" },
  { v: "6", r: "Sábado" },
  { v: "0", r: "Domingo" },
]

export type ConfigInicial = {
  ativo: boolean
  frequencia: string
  hora: string | null
  diaSemana: number | null
  intervaloHoras: number | null
  tamanho: number
  prompt: string
}

export function ConfigForm({ config }: { config: ConfigInicial }) {
  const [estado, formAction, pendente] = useActionState(salvarConfigAction, {})
  const [frequencia, setFrequencia] = useState(config.frequencia)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [iaPendente, setIaPendente] = useState(false)
  const [iaErro, setIaErro] = useState<string | null>(null)

  async function melhorar() {
    const texto = promptRef.current?.value.trim() ?? ""
    if (texto.length < 10) {
      setIaErro("Escreva o prompt antes de usar a IA.")
      return
    }
    setIaErro(null)
    setIaPendente(true)
    const { texto: novo, erro } = await melhorarPromptAction({ texto })
    setIaPendente(false)
    if (erro) setIaErro(erro)
    else if (novo && promptRef.current) promptRef.current.value = novo
  }

  const usaHora = frequencia !== "horas"

  return (
    <form action={formAction} className="grid gap-5">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={config.ativo}
          className="size-4"
        />
        Geração automática ativa (segue a recorrência abaixo)
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="frequencia">Recorrência</Label>
          <select
            id="frequencia"
            name="frequencia"
            value={frequencia}
            onChange={(e) => setFrequencia(e.target.value)}
            className={SELECT}
          >
            <option value="diaria">Diária</option>
            <option value="dias_uteis">Dias úteis (seg–sex)</option>
            <option value="semanal">Semanal</option>
            <option value="horas">A cada N horas</option>
          </select>
        </div>

        {usaHora ? (
          <div className="grid gap-1.5">
            <Label htmlFor="hora">Horário</Label>
            <Input
              id="hora"
              name="hora"
              type="time"
              defaultValue={config.hora ?? "07:00"}
            />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="intervalo_horas">Intervalo (horas)</Label>
            <Input
              id="intervalo_horas"
              name="intervalo_horas"
              inputMode="numeric"
              defaultValue={config.intervaloHoras ?? 6}
            />
          </div>
        )}

        {frequencia === "semanal" && (
          <div className="grid gap-1.5">
            <Label htmlFor="dia_semana">Dia da semana</Label>
            <select
              id="dia_semana"
              name="dia_semana"
              defaultValue={String(config.diaSemana ?? 1)}
              className={SELECT}
            >
              {DIAS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.r}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="tamanho">Tamanho do resumo</Label>
          <select
            id="tamanho"
            name="tamanho"
            defaultValue={String(config.tamanho)}
            className={SELECT}
          >
            <option value="1000">Curto (~1.000 caracteres)</option>
            <option value="2000">Médio (~2.000 caracteres)</option>
            <option value="3000">Longo (~3.000 caracteres)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt">Prompt da IA</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={melhorar}
            disabled={iaPendente || pendente}
          >
            {iaPendente ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Melhorar com IA
          </Button>
        </div>
        {iaErro && <p className="text-destructive text-xs">{iaErro}</p>}
        <Textarea
          id="prompt"
          name="prompt"
          ref={promptRef}
          rows={5}
          defaultValue={config.prompt}
          placeholder="Instrução editorial para a IA gerar o resumo…"
        />
        <p className="text-muted-foreground text-xs">
          Esta instrução guia o tom e o foco do resumo. O formato (título + texto
          do tamanho escolhido) é garantido pelo sistema.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente || iaPendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configuração
        </Button>
      </div>
    </form>
  )
}

export function GerarAgoraBotao() {
  const router = useRouter()
  const [pendente, setPendente] = useState(false)
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null)

  async function gerar() {
    setPendente(true)
    setMsg(null)
    const r = await gerarAgoraAction()
    setPendente(false)
    setMsg(r)
    if (r.ok) router.refresh()
  }

  return (
    <div className="grid gap-2">
      {msg?.erro && (
        <Alert variant="destructive">
          <AlertDescription>{msg.erro}</AlertDescription>
        </Alert>
      )}
      {msg?.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{msg.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="button" onClick={gerar} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Gerar agora
        </Button>
      </div>
    </div>
  )
}

export function AdicionarFonteForm() {
  const [estado, formAction, pendente] = useActionState(adicionarFonteAction, {})
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {estado.erro && (
        <Alert variant="destructive" className="sm:col-span-3">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="url">URL do site *</Label>
        <Input id="url" name="url" placeholder="https://…" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome (opcional)</Label>
        <Input id="nome" name="nome" placeholder="Ex.: Agência Petroleira" />
      </div>
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
    </form>
  )
}

export function RemoverFonteBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(removerFonteAction, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Remover este site?")) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

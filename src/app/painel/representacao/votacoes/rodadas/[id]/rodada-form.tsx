"use client"

import { useActionState, useState } from "react"
import { ExternalLink, Loader2, Pencil, Save } from "lucide-react"

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
import { Switch } from "@/components/ui/switch"

import { ClausulaColetivaCampos } from "../../clausula-coletiva-campos"
import { salvarRodada } from "./actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

type Rodada = {
  id: string
  nome: string | null
  descricao: string | null
  inicio: string | null
  termino: string | null
  video_indicativo_url: string | null
  apuracao_encerrada: boolean
  clausula_filiacao_coletiva: boolean
  filiacao_coletiva_dias: number | null
  /** Tema da campanha — já aparece no cabeçalho da página. */
  campanhaTema?: string | null
}

export function RodadaForm({
  rodada,
  editalUrl,
  cardUrl,
}: {
  rodada: Rodada
  editalUrl: string | null
  cardUrl: string | null
}) {
  const [editando, setEditando] = useState(false)
  const [estado, formAction, pendente] = useActionState(salvarRodada, {})

  // Fecha o formulário quando a action confirma o salvamento (ajuste de
  // estado durante o render, disparado pela troca de identidade do estado).
  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    if (estado.ok) setEditando(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Dados da rodada</CardTitle>
            <CardDescription className="mt-1">
              Descrição e materiais de divulgação.
            </CardDescription>
          </div>
          {!editando && (
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil />
              Editar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="@container">
        {estado.ok && !editando && (
          <Alert variant="success" className="mb-4">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}
        {editando ? (
          <form action={formAction} className="grid gap-4">
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <input type="hidden" name="rodada_id" value={rodada.id} />

            <div className="grid gap-4 @md:grid-cols-2">
              <div className="grid gap-1.5 @md:col-span-2">
                <Label htmlFor="nome">Nome da rodada *</Label>
                <Input
                  id="nome"
                  name="nome"
                  required
                  defaultValue={rodada.nome ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inicio">Início do período</Label>
                <Input
                  id="inicio"
                  name="inicio"
                  type="date"
                  defaultValue={rodada.inicio ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="termino">Término do período</Label>
                <Input
                  id="termino"
                  name="termino"
                  type="date"
                  defaultValue={rodada.termino ?? ""}
                />
              </div>
              <div className="grid gap-1.5 @md:col-span-2">
                <Label htmlFor="descricao">Descrição</Label>
                <textarea
                  id="descricao"
                  name="descricao"
                  rows={2}
                  defaultValue={rodada.descricao ?? ""}
                  className={TEXTAREA}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edital">Edital (PDF)</Label>
                <Input
                  id="edital"
                  name="edital"
                  type="file"
                  accept="application/pdf"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="card_grafico">Card gráfico (imagem ou PDF)</Label>
                <Input
                  id="card_grafico"
                  name="card_grafico"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                />
              </div>
              <div className="grid gap-1.5 @md:col-span-2">
                <Label htmlFor="video_indicativo_url">
                  Vídeo indicativo (URL)
                </Label>
                <Input
                  id="video_indicativo_url"
                  name="video_indicativo_url"
                  type="url"
                  placeholder="https://…"
                  defaultValue={rodada.video_indicativo_url ?? ""}
                />
              </div>
            </div>

            <ClausulaColetivaCampos
              marcadaInicial={rodada.clausula_filiacao_coletiva}
              diasInicial={rodada.filiacao_coletiva_dias}
            />

            <ApuracaoSwitch inicial={rodada.apuracao_encerrada} />

            <div className="flex gap-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar rodada
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditando(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          // Só o que não está em outro lugar da página: período e fonte ficam
          // na faixa de resumo, a apuração no selo do título, o tema da
          // campanha no subtítulo (e a descrição costuma repeti-lo).
          <div className="grid gap-3 text-sm">
            {descricaoPropria(rodada) && (
              <p className="whitespace-pre-line">{rodada.descricao}</p>
            )}
            {editalUrl || cardUrl || rodada.video_indicativo_url ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {editalUrl && <LinkArquivo href={editalUrl}>Ver edital</LinkArquivo>}
                {cardUrl && <LinkArquivo href={cardUrl}>Ver card</LinkArquivo>}
                {rodada.video_indicativo_url && (
                  <LinkArquivo href={rodada.video_indicativo_url}>
                    Abrir vídeo
                  </LinkArquivo>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Sem edital, card ou vídeo anexados.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Descrição que acrescenta algo — igual ao tema da campanha, não se repete. */
function descricaoPropria(rodada: Rodada): boolean {
  const d = (rodada.descricao ?? "").trim().toLowerCase()
  if (!d) return false
  return d !== (rodada.campanhaTema ?? "").trim().toLowerCase()
}

function LinkArquivo({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary inline-flex items-center gap-1 hover:underline"
    >
      <ExternalLink className="size-3" />
      {children}
    </a>
  )
}

function ApuracaoSwitch({ inicial }: { inicial: boolean }) {
  const [encerrada, setEncerrada] = useState(inicial)
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={encerrada}
        onCheckedChange={setEncerrada}
        aria-label="Encerrar a apuração da rodada"
      />
      <span className={encerrada ? "font-medium" : "text-muted-foreground"}>
        Apuração encerrada
      </span>
      <input
        type="hidden"
        name="apuracao_encerrada"
        value={encerrada ? "on" : ""}
      />
    </label>
  )
}

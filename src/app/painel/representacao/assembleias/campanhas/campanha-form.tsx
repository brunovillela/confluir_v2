"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import { salvarCampanha } from "./actions"

export type FonteOpcao = { id: string; nome: string; inativa: boolean }

/**
 * Cria ou edita uma campanha (tema + fontes pagadoras + finalizada).
 * Com campanha existente abre em modo leitura, com botão para editar.
 */
export function CampanhaForm({
  campanha,
  fontes,
}: {
  campanha?: {
    id: string
    tema: string | null
    finalizado: boolean
    fonteIds: string[]
  }
  fontes: FonteOpcao[]
}) {
  const [editando, setEditando] = useState(!campanha)
  const [estado, formAction, pendente] = useActionState(salvarCampanha, {})

  // Volta ao modo leitura quando a edição é salva (ajuste de estado durante
  // o render, disparado pela troca de identidade do estado da action).
  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    if (estado.ok && campanha) setEditando(false)
  }

  if (campanha && !editando) {
    const nomesFontes = fontes
      .filter((f) => campanha.fonteIds.includes(f.id))
      .map((f) => f.nome)
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Campanha</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditando(true)}
            >
              <Pencil />
              Editar campanha
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {estado.ok && (
            <Alert variant="success">
              <AlertDescription>{estado.ok}</AlertDescription>
            </Alert>
          )}
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground text-xs">Tema</dt>
              <dd>{campanha.tema ?? "—"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground text-xs">Situação</dt>
              <dd>
                <Badge variant={campanha.finalizado ? "secondary" : "info"}>
                  {campanha.finalizado ? "Finalizada" : "Aberta"}
                </Badge>
              </dd>
            </div>
            <div className="grid gap-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-xs">
                Fontes pagadoras
              </dt>
              <dd>
                {nomesFontes.length > 0 ? nomesFontes.join(", ") : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    )
  }

  return (
    <CampanhaFormEdicao
      campanha={campanha}
      fontes={fontes}
      estado={estado}
      formAction={formAction}
      pendente={pendente}
      aoCancelar={campanha ? () => setEditando(false) : undefined}
    />
  )
}

function CampanhaFormEdicao({
  campanha,
  fontes,
  estado,
  formAction,
  pendente,
  aoCancelar,
}: {
  campanha?: {
    id: string
    tema: string | null
    finalizado: boolean
    fonteIds: string[]
  }
  fontes: FonteOpcao[]
  estado: { erro?: string; ok?: string }
  formAction: (formData: FormData) => void
  pendente: boolean
  aoCancelar?: () => void
}) {
  const [finalizado, setFinalizado] = useState(campanha?.finalizado ?? false)
  const [busca, setBusca] = useState("")
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () => new Set(campanha?.fonteIds ?? [])
  )

  const visiveis = fontes.filter(
    (f) =>
      (!f.inativa || selecionadas.has(f.id)) &&
      f.nome.toLowerCase().includes(busca.toLowerCase())
  )

  const alternar = (id: string, marcada: boolean) => {
    setSelecionadas((atual) => {
      const proxima = new Set(atual)
      if (marcada) proxima.add(id)
      else proxima.delete(id)
      return proxima
    })
  }

  return (
    <form action={formAction} className="grid gap-6">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {campanha && (
        <input type="hidden" name="campanha_id" value={campanha.id} />
      )}
      {[...selecionadas].map((id) => (
        <input key={id} type="hidden" name="fonte_id" value={id} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campanha</CardTitle>
          <CardDescription>
            Tema geral da votação — por exemplo, um acordo coletivo — e as
            fontes pagadoras cujos trabalhadores serão consultados.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="tema">Tema *</Label>
            <Input
              id="tema"
              name="tema"
              required
              defaultValue={campanha?.tema ?? ""}
              placeholder="Ex.: Acordo Coletivo de Trabalho 2026/2028"
            />
          </div>

          {campanha && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={finalizado}
                onCheckedChange={setFinalizado}
                aria-label="Finalizar a campanha"
              />
              <span className={finalizado ? "font-medium" : "text-muted-foreground"}>
                Campanha finalizada
              </span>
              <input
                type="hidden"
                name="finalizado"
                value={finalizado ? "on" : ""}
              />
            </label>
          )}

          <div className="grid gap-1.5">
            <Label>Fontes pagadoras</Label>
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar fontes pelo nome"
              className="max-w-sm"
            />
            <div className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
              {visiveis.length === 0 && (
                <p className="text-muted-foreground col-span-full py-2 text-center text-sm">
                  Nenhuma fonte encontrada.
                </p>
              )}
              {visiveis.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-2 rounded px-1 py-0.5 text-sm"
                >
                  <Checkbox
                    checked={selecionadas.has(f.id)}
                    onCheckedChange={(v) => alternar(f.id, v === true)}
                  />
                  <span className="truncate">
                    {f.nome}
                    {f.inativa && (
                      <span className="text-muted-foreground"> (inativa)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {selecionadas.size === 0
                ? "Nenhuma fonte selecionada."
                : `${selecionadas.size} fonte${selecionadas.size === 1 ? "" : "s"} selecionada${selecionadas.size === 1 ? "" : "s"}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {campanha ? "Salvar campanha" : "Criar campanha"}
        </Button>
        {aoCancelar && (
          <Button type="button" variant="ghost" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}

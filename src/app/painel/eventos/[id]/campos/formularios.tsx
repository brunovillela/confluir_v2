"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_CAMPO, type CampoExtra } from "@/lib/eventos-constantes"

import {
  reativarCampoAction,
  removerCampoAction,
  salvarCampoAction,
} from "../../configuracao/actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function CampoForm({
  eventoId,
  campo,
  aoFechar,
}: {
  eventoId: string
  campo?: CampoExtra
  aoFechar?: () => void
}) {
  const [estado, formAction, pendente] = useActionState(salvarCampoAction, {})
  const [tipo, setTipo] = useState(campo?.tipo ?? "texto")

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="eventoId" value={eventoId} />
      {campo && <input type="hidden" name="id" value={campo.id} />}

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`rotulo-${campo?.id ?? "novo"}`}>Pergunta</Label>
          <Input
            id={`rotulo-${campo?.id ?? "novo"}`}
            name="rotulo"
            defaultValue={campo?.rotulo ?? ""}
            placeholder="Qual sua refeição preferida?"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`tipo-${campo?.id ?? "novo"}`}>Tipo de resposta</Label>
          <select
            id={`tipo-${campo?.id ?? "novo"}`}
            name="tipo"
            className={SELECT}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS_CAMPO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tipo === "selecao" && (
        <div className="grid gap-2">
          <Label htmlFor={`opcoes-${campo?.id ?? "novo"}`}>
            Opções, uma por linha
          </Label>
          <Textarea
            id={`opcoes-${campo?.id ?? "novo"}`}
            name="opcoes"
            rows={4}
            defaultValue={(campo?.opcoes ?? []).join("\n")}
            placeholder={"Sem restrição\nVegetariana\nVegana"}
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`ajuda-${campo?.id ?? "novo"}`}>
          Texto de ajuda (opcional)
        </Label>
        <Input
          id={`ajuda-${campo?.id ?? "novo"}`}
          name="ajuda"
          defaultValue={campo?.ajuda ?? ""}
          placeholder="Aparece embaixo do campo, em letra menor"
        />
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input
          type="checkbox"
          name="obrigatorio"
          className="mt-0.5 size-4"
          defaultChecked={campo?.obrigatorio ?? false}
        />
        <span className="text-sm">
          Resposta obrigatória
          <span className="text-muted-foreground block text-xs">
            Só marque o que for mesmo necessário: cada campo obrigatório é uma
            pessoa a menos concluindo a inscrição.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {campo ? "Salvar" : "Adicionar campo"}
        </Button>
        {aoFechar && (
          <Button type="button" size="sm" variant="ghost" onClick={aoFechar}>
            <X />
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}

export function NovoCampo({ eventoId }: { eventoId: string }) {
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Plus />
        Novo campo
      </Button>
    )
  }
  return (
    <div className="rounded-md border p-4">
      <CampoForm eventoId={eventoId} aoFechar={() => setAberto(false)} />
    </div>
  )
}

export function AcoesCampo({
  eventoId,
  campo,
}: {
  eventoId: string
  campo: CampoExtra
}) {
  const [remover, acaoRemover, removendo] = useActionState(
    removerCampoAction,
    {}
  )
  const [reativar, acaoReativar, reativando] = useActionState(
    reativarCampoAction,
    {}
  )
  const estado = remover.erro || remover.ok ? remover : reativar

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {campo.ativo ? (
          <form action={acaoRemover}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="campoId" value={campo.id} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={removendo}
              title={
                campo.respostas > 0
                  ? "Já tem resposta: será desativado, não apagado"
                  : "Remover"
              }
            >
              {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {campo.respostas > 0 ? "Desativar" : "Remover"}
            </Button>
          </form>
        ) : (
          <form action={acaoReativar}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="campoId" value={campo.id} />
            <Button type="submit" size="sm" variant="ghost" disabled={reativando}>
              {reativando ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Reativar
            </Button>
          </form>
        )}
      </div>
      {(estado.erro || estado.ok) && (
        <Alert variant={estado.erro ? "destructive" : "success"}>
          <AlertDescription className="text-xs">
            {estado.erro ?? estado.ok}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

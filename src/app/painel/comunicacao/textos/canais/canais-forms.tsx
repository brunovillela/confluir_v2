"use client"

import { useActionState } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { removerCanal, salvarCanal } from "../actions"

export type CanalLinha = {
  id: string
  nome: string
  limite_caracteres: number | null
  orientacoes: string | null
  suporta_busca: boolean
  ativo: boolean
  ordem: number
}

/** Campos comuns a criar e editar. */
function CamposCanal({ canal }: { canal?: CanalLinha }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`nome-${canal?.id ?? "novo"}`}>Nome</Label>
          <Input
            id={`nome-${canal?.id ?? "novo"}`}
            name="nome"
            defaultValue={canal?.nome}
            placeholder="Carro de som"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`limite-${canal?.id ?? "novo"}`}>
            Tamanho sugerido
          </Label>
          <Input
            id={`limite-${canal?.id ?? "novo"}`}
            name="limite_caracteres"
            type="number"
            min={50}
            max={20000}
            defaultValue={canal?.limite_caracteres ?? ""}
            placeholder="1500"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`orient-${canal?.id ?? "novo"}`}>
          Convenções deste meio
        </Label>
        <Textarea
          id={`orient-${canal?.id ?? "novo"}`}
          name="orientacoes"
          rows={4}
          defaultValue={canal?.orientacoes ?? ""}
          placeholder="Como se escreve para este canal: tamanho de parágrafo, uso de emoji, se aceita link, o que funciona e o que não funciona."
        />
        <p className="text-muted-foreground text-xs">
          A IA lê isto toda vez que escrever para este canal. Quanto mais
          específico, mais o texto parece feito para o lugar certo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-md border p-3">
          <input
            type="checkbox"
            name="suporta_busca"
            className="mt-0.5 size-4"
            defaultChecked={canal?.suporta_busca ?? false}
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">Tem busca</span>
            <span className="text-muted-foreground text-xs">
              Marque para site, blog e redes sociais. Deixe desmarcado para
              folder, cartaz e WhatsApp, onde ninguém procura por palavra-chave.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border p-3">
          <input
            type="checkbox"
            name="ativo"
            className="mt-0.5 size-4"
            defaultChecked={canal?.ativo ?? true}
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">Ativo</span>
            <span className="text-muted-foreground text-xs">
              Canais inativos somem do formulário de pedido, mas os textos
              antigos continuam apontando para eles.
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-2 sm:max-w-32">
        <Label htmlFor={`ordem-${canal?.id ?? "novo"}`}>Ordem</Label>
        <Input
          id={`ordem-${canal?.id ?? "novo"}`}
          name="ordem"
          type="number"
          defaultValue={canal?.ordem ?? 0}
        />
      </div>
    </div>
  )
}

export function NovoCanalForm() {
  const [estado, formAction, pendente] = useActionState(salvarCanal, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <CamposCanal />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar canal
        </Button>
      </div>
    </form>
  )
}

export function CanalEditavel({ canal }: { canal: CanalLinha }) {
  const [estado, formAction, pendente] = useActionState(salvarCanal, {})
  const [estadoRem, removerAction, removendo] = useActionState(removerCanal, {})

  return (
    <CartaoEditavel
      titulo={canal.nome}
      descricao={[
        canal.limite_caracteres ? `${canal.limite_caracteres} caracteres` : null,
        canal.suporta_busca ? "com busca" : null,
        canal.ativo ? null : "inativo",
      ]
        .filter(Boolean)
        .join(" · ")}
      resumo={
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {canal.orientacoes?.trim() || "Sem convenções registradas."}
        </p>
      }
    >
      <div className="grid gap-4">
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        {estado.ok && (
          <Alert>
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}
        {estadoRem.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estadoRem.erro}</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={canal.id} />
          <CamposCanal canal={canal} />
          <div>
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        </form>

        <form action={removerAction}>
          <input type="hidden" name="id" value={canal.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={removendo}
          >
            {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir canal
          </Button>
        </form>
      </div>
    </CartaoEditavel>
  )
}

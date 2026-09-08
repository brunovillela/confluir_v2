"use client"

import { useActionState, useState } from "react"
import { Globe, Loader2, MapPin, Pencil, Phone, Plus, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { UnidadeEditavel } from "@/lib/db/filiacao-convenios-edicao"
import { formatarTelefone } from "@/lib/formato"

import { excluirUnidadeAction, salvarUnidadeAction } from "../actions"

/**
 * As unidades de atendimento de um convênio — onde o filiado é atendido.
 * Cada unidade tem nome, site, telefones, e-mails, se atende online ou no
 * balcão, e o endereço. Editar abre o formulário no lugar da linha.
 */
export function Unidades({
  convenioId,
  unidades,
}: {
  convenioId: string
  unidades: UnidadeEditavel[]
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)

  return (
    <div className="grid gap-3">
      {unidades.length === 0 && !novo && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Nenhuma unidade. Sem unidade, o portal mostra o convênio sem endereço nem telefone.
        </p>
      )}

      {unidades.map((u) =>
        editando === u.id ? (
          <UnidadeForm
            key={u.id}
            convenioId={convenioId}
            unidade={u}
            aoFechar={() => setEditando(null)}
          />
        ) : (
          <div key={u.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="grid gap-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.nome ?? "Unidade"}</span>
                {u.online && <Badge variant="info">online</Badge>}
                {u.presencial && <Badge variant="outline">presencial</Badge>}
              </div>
              {enderecoEmLinha(u) && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" /> {enderecoEmLinha(u)}
                </span>
              )}
              {u.telefones.length > 0 && (
                <span className="text-muted-foreground flex items-center gap-1 tabular-nums">
                  <Phone className="size-3.5 shrink-0" />{" "}
                  {u.telefones.map((t) => formatarTelefone(t)).join(", ")}
                </span>
              )}
              {u.emails.length > 0 && (
                <span className="text-muted-foreground">{u.emails.join(", ")}</span>
              )}
              {u.site && (
                <a
                  href={u.site}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground flex items-center gap-1 underline"
                >
                  <Globe className="size-3.5 shrink-0" /> {u.site}
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Editar unidade"
                onClick={() => {
                  setNovo(false)
                  setEditando(u.id)
                }}
              >
                <Pencil />
              </Button>
              <form action={excluirUnidadeAction}>
                <input type="hidden" name="convenio_id" value={convenioId} />
                <input type="hidden" name="unidade_id" value={u.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Excluir unidade"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => {
                    if (!confirm(`Excluir a unidade "${u.nome ?? "Unidade"}"?`)) e.preventDefault()
                  }}
                >
                  <Trash2 />
                </Button>
              </form>
            </div>
          </div>
        )
      )}

      {novo ? (
        <UnidadeForm convenioId={convenioId} aoFechar={() => setNovo(false)} />
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditando(null)
              setNovo(true)
            }}
          >
            <Plus />
            Nova unidade
          </Button>
        </div>
      )}
    </div>
  )
}

function enderecoEmLinha(u: UnidadeEditavel): string | null {
  const e = u.endereco
  const l1 = [e.logradouro, e.numero, e.complemento].filter((x) => x && x.trim()).join(", ")
  const l2 = [e.bairro, [e.cidade, e.estado].filter(Boolean).join("/")].filter((x) => x && x.trim()).join(" · ")
  return [l1, l2].filter(Boolean).join(" — ") || null
}

function UnidadeForm({
  convenioId,
  unidade,
  aoFechar,
}: {
  convenioId: string
  unidade?: UnidadeEditavel
  aoFechar: () => void
}) {
  const [estado, formAction, pendente] = useActionState(
    async (prev: { erro?: string; ok?: string }, formData: FormData) => {
      const r = await salvarUnidadeAction(prev, formData)
      if (r.ok) aoFechar()
      return r
    },
    {}
  )
  const e = unidade?.endereco
  const p = unidade ? `u-${unidade.id}` : "u-nova"

  return (
    <form action={formAction} className="bg-muted/30 grid gap-3 rounded-lg border p-3">
      <input type="hidden" name="convenio_id" value={convenioId} />
      {unidade && <input type="hidden" name="unidade_id" value={unidade.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-nome`}>Nome da unidade *</Label>
          <Input
            id={`${p}-nome`}
            name="nome"
            defaultValue={unidade?.nome ?? ""}
            placeholder="Loja Centro, Matriz, Atendimento online…"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-site`}>Site</Label>
          <Input
            id={`${p}-site`}
            name="site"
            type="url"
            defaultValue={unidade?.site ?? ""}
            placeholder="https://"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-telefones`}>Telefones</Label>
          <Textarea
            id={`${p}-telefones`}
            name="telefones"
            rows={2}
            defaultValue={(unidade?.telefones ?? []).join("\n")}
            placeholder="Um por linha"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-emails`}>E-mails</Label>
          <Textarea
            id={`${p}-emails`}
            name="emails"
            rows={2}
            defaultValue={(unidade?.emails ?? []).join("\n")}
            placeholder="Um por linha"
          />
        </div>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch name="presencial" defaultChecked={unidade ? unidade.presencial : true} />
            Atende no balcão
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch name="online" defaultChecked={unidade?.online ?? false} />
            Atende online
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-6">
        <div className="grid gap-1.5 sm:col-span-1">
          <Label htmlFor={`${p}-cep`}>CEP</Label>
          <Input id={`${p}-cep`} name="cep" defaultValue={e?.cep ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-3">
          <Label htmlFor={`${p}-logradouro`}>Logradouro</Label>
          <Input id={`${p}-logradouro`} name="logradouro" defaultValue={e?.logradouro ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-1">
          <Label htmlFor={`${p}-numero`}>Número</Label>
          <Input id={`${p}-numero`} name="numero" defaultValue={e?.numero ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-1">
          <Label htmlFor={`${p}-complemento`}>Compl.</Label>
          <Input id={`${p}-complemento`} name="complemento" defaultValue={e?.complemento ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${p}-bairro`}>Bairro</Label>
          <Input id={`${p}-bairro`} name="bairro" defaultValue={e?.bairro ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-3">
          <Label htmlFor={`${p}-cidade`}>Cidade</Label>
          <Input id={`${p}-cidade`} name="cidade" defaultValue={e?.cidade ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-1">
          <Label htmlFor={`${p}-estado`}>UF</Label>
          <Input id={`${p}-estado`} name="estado" maxLength={2} defaultValue={e?.estado ?? ""} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
          <X />
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {unidade ? "Salvar unidade" : "Adicionar unidade"}
        </Button>
      </div>
    </form>
  )
}

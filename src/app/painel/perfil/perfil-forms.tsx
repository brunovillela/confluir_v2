"use client"

import { useActionState } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import {
  ESCOLARIDADES,
  ESTADOS_CIVIS,
  SEXOS,
  TIPOS_ENDERECO,
  TIPOS_TELEFONE,
} from "@/lib/perfil-constantes"

import {
  adicionarEnderecoAction,
  adicionarTelefoneAction,
  removerEnderecoAction,
  removerTelefoneAction,
  salvarPerfilAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function opcoes(lista: readonly string[], atual: string | null) {
  const arr = [...lista]
  if (atual && !arr.includes(atual)) arr.push(atual)
  return arr
}

export type PerfilFormDados = {
  nomeGuerra: string | null
  email: string | null
  whatsapp: string | null
  dataNascimento: string | null
  sexo: string | null
  estadoCivil: string | null
  escolaridade: string | null
}

export function PerfilForm({ dados }: { dados: PerfilFormDados }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarPerfilAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome_guerra">Como quer ser chamado(a)</Label>
          <Input
            id="nome_guerra"
            name="nome_guerra"
            defaultValue={dados.nomeGuerra ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" defaultValue={dados.email ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input id="whatsapp" name="whatsapp" defaultValue={dados.whatsapp ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_nascimento">Data de nascimento</Label>
          <input
            id="data_nascimento"
            name="data_nascimento"
            type="date"
            defaultValue={dados.dataNascimento ?? ""}
            className={SELECT}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sexo">Sexo</Label>
          <select id="sexo" name="sexo" defaultValue={dados.sexo ?? ""} className={SELECT}>
            <option value="">(não informado)</option>
            {opcoes(SEXOS, dados.sexo).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="estado_civil">Estado civil</Label>
          <select
            id="estado_civil"
            name="estado_civil"
            defaultValue={dados.estadoCivil ?? ""}
            className={SELECT}
          >
            <option value="">(não informado)</option>
            {opcoes(ESTADOS_CIVIS, dados.estadoCivil).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="escolaridade">Escolaridade</Label>
          <select
            id="escolaridade"
            name="escolaridade"
            defaultValue={dados.escolaridade ?? ""}
            className={SELECT}
          >
            <option value="">(não informado)</option>
            {opcoes(ESCOLARIDADES, dados.escolaridade).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="foto">Trocar foto</Label>
        <input
          id="foto"
          name="foto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="max-w-xs text-sm"
        />
        <span className="text-muted-foreground text-xs">JPG, PNG ou WEBP, até 3 MB.</span>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar perfil
        </Button>
      </div>
    </form>
  )
}

// ── Telefones ───────────────────────────────────────────────────────────────

export function AdicionarTelefone() {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarTelefoneAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="tel-numero">Número</Label>
        <Input id="tel-numero" name="numero" required placeholder="(22) 99999-9999" className="w-48" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tel-tipo">Tipo</Label>
        <select id="tel-tipo" name="tipo" defaultValue="Celular" className={SELECT}>
          {TIPOS_TELEFONE.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="whatsapp" value="1" className="size-4" />
        WhatsApp
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
      {estado.erro && <p className="text-destructive w-full text-sm">{estado.erro}</p>}
    </form>
  )
}

export function RemoverTelefone({ telefoneId }: { telefoneId: string }) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerTelefoneAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="telefone_id" value={telefoneId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente} aria-label="Remover telefone">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive size-4" />}
      </Button>
    </form>
  )
}

// ── Endereços ───────────────────────────────────────────────────────────────

export function AdicionarEndereco() {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarEnderecoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-6">
      <label className="grid gap-1 text-xs sm:col-span-4">
        Logradouro
        <input name="logradouro" className={SELECT} />
      </label>
      <label className="grid gap-1 text-xs sm:col-span-2">
        Número
        <input name="numero" className={SELECT} />
      </label>
      <label className="grid gap-1 text-xs sm:col-span-3">
        Complemento
        <input name="complemento" className={SELECT} />
      </label>
      <label className="grid gap-1 text-xs sm:col-span-3">
        Bairro
        <input name="bairro" className={SELECT} />
      </label>
      <label className="grid gap-1 text-xs sm:col-span-3">
        Cidade
        <input name="cidade" className={SELECT} />
      </label>
      <label className="grid gap-1 text-xs">
        UF
        <input name="estado" maxLength={2} className={`${SELECT} uppercase`} />
      </label>
      <label className="grid gap-1 text-xs sm:col-span-2">
        CEP
        <input name="cep" className={`${SELECT} tabular-nums`} />
      </label>
      <label className="grid gap-1 text-xs sm:col-span-2">
        Tipo
        <select name="tipo_endereco" defaultValue="Residencial" className={SELECT}>
          {TIPOS_ENDERECO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {estado.erro && <p className="text-destructive text-sm sm:col-span-6">{estado.erro}</p>}
      <div className="sm:col-span-6">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar endereço
        </Button>
      </div>
    </form>
  )
}

export function RemoverEndereco({ enderecoId }: { enderecoId: string }) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerEnderecoAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="endereco_id" value={enderecoId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente} aria-label="Remover endereço">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive size-4" />}
      </Button>
    </form>
  )
}

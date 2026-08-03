"use client"

import { useActionState } from "react"
import { Check, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { type Sede } from "@/lib/db/organizacao"
import { formatarCnpjCpf } from "@/lib/formato"

import { salvarOrganizacaoAction, salvarSedeAction } from "./actions"

function Sucesso({ estado }: { estado: EstadoForm }) {
  if (!estado.ok) return null
  return (
    <p className="text-success-fg flex items-center gap-1.5 text-sm">
      <Check className="size-4" />
      {estado.ok}
    </p>
  )
}

export function OrganizacaoForm({
  dados,
  logoUrl,
}: {
  dados: {
    nomeRazao: string | null
    nomeFantasia: string | null
    cnpjCpf: string | null
    siteUrl: string | null
    emailContato: string | null
    noticiasUrl: string | null
    noticiasFeedUrl: string | null
  }
  logoUrl: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarOrganizacaoAction,
    {}
  )

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="nome_razao">Razão social *</Label>
        <Input
          id="nome_razao"
          name="nome_razao"
          required
          defaultValue={dados.nomeRazao ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome_fantasia">Nome fantasia</Label>
          <Input
            id="nome_fantasia"
            name="nome_fantasia"
            defaultValue={dados.nomeFantasia ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cnpj_cpf">CNPJ</Label>
          <Input
            id="cnpj_cpf"
            name="cnpj_cpf"
            defaultValue={formatarCnpjCpf(dados.cnpjCpf)}
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="site_url">Site institucional</Label>
          <Input
            id="site_url"
            name="site_url"
            type="url"
            inputMode="url"
            placeholder="https://…"
            defaultValue={dados.siteUrl ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email_contato">E-mail de contato</Label>
          <Input
            id="email_contato"
            name="email_contato"
            type="email"
            placeholder="contato@…"
            defaultValue={dados.emailContato ?? ""}
          />
          <span className="text-muted-foreground text-xs">
            Exibido na política de privacidade (LGPD).
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="noticias_url">Página de notícias</Label>
          <Input
            id="noticias_url"
            name="noticias_url"
            type="url"
            inputMode="url"
            placeholder="https://…/noticias/"
            defaultValue={dados.noticiasUrl ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="noticias_feed_url">Feed RSS de notícias</Label>
          <Input
            id="noticias_feed_url"
            name="noticias_feed_url"
            type="url"
            inputMode="url"
            placeholder="https://…/feed/"
            defaultValue={dados.noticiasFeedUrl ?? ""}
          />
        </div>
      </div>
      <span className="text-muted-foreground -mt-2 text-xs">
        Alimentam o widget de notícias do painel quando não há notícias
        internas cadastradas. Opcionais.
      </span>

      <div className="grid gap-1.5">
        <Label htmlFor="logo">Logo</Label>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo atual"
              className="bg-muted h-16 w-16 rounded-md border object-contain p-1"
            />
          ) : (
            <div className="bg-muted text-muted-foreground grid h-16 w-16 place-items-center rounded-md border text-xs">
              sem logo
            </div>
          )}
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="max-w-xs"
          />
        </div>
        <span className="text-muted-foreground text-xs">
          PNG, JPG, WEBP ou SVG, até 3 MB. Usado no cabeçalho dos ofícios.
        </span>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <Sucesso estado={estado} />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar organização
        </Button>
      </div>
    </form>
  )
}

const INPUT_SEDE =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none"

export function SedeForm({ sede }: { sede: Sede }) {
  const [estado, formAction, pendente] = useActionState(salvarSedeAction, {})

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="sede_id" value={sede.id} />
      <div className="grid gap-3 sm:grid-cols-6">
        <label className="grid gap-1 text-xs sm:col-span-4">
          Logradouro
          <input
            name="logradouro"
            defaultValue={sede.logradouro ?? ""}
            className={INPUT_SEDE}
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          Número
          <input
            name="numero"
            defaultValue={sede.numero ?? ""}
            className={INPUT_SEDE}
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-3">
          Complemento
          <input
            name="complemento"
            defaultValue={sede.complemento ?? ""}
            className={INPUT_SEDE}
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-3">
          Bairro
          <input
            name="bairro"
            defaultValue={sede.bairro ?? ""}
            className={INPUT_SEDE}
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-3">
          Cidade
          <input
            name="cidade"
            defaultValue={sede.cidade ?? ""}
            className={INPUT_SEDE}
          />
        </label>
        <label className="grid gap-1 text-xs">
          UF
          <input
            name="estado"
            maxLength={2}
            defaultValue={sede.estado ?? ""}
            className={`${INPUT_SEDE} uppercase`}
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          CEP
          <input
            name="cep"
            defaultValue={sede.cep ?? ""}
            className={`${INPUT_SEDE} tabular-nums`}
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-6">
          Telefones
          <input
            name="telefones"
            defaultValue={sede.telefones ?? ""}
            placeholder="(22) 2765-9550 / (22) 99742-3547"
            className={INPUT_SEDE}
          />
        </label>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar sede
        </Button>
        <Sucesso estado={estado} />
      </div>
    </form>
  )
}

"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowRight, Copy, Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { atualizarTenantAction, criarTenantAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const STATUS = [
  { valor: "ativo", rotulo: "Ativo" },
  { valor: "trial", rotulo: "Trial" },
  { valor: "suspenso", rotulo: "Suspenso" },
]

function CamposOrganizacao({
  inicial,
}: {
  inicial?: {
    nomeRazao: string | null
    nomeFantasia: string | null
    cnpjCpf: string | null
    slug: string
    plano: string | null
    status: string
  }
}) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="nome_razao">Razão social *</Label>
        <Input
          id="nome_razao"
          name="nome_razao"
          required
          defaultValue={inicial?.nomeRazao ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome_fantasia">Nome fantasia</Label>
          <Input
            id="nome_fantasia"
            name="nome_fantasia"
            defaultValue={inicial?.nomeFantasia ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cnpj_cpf">CNPJ</Label>
          <Input
            id="cnpj_cpf"
            name="cnpj_cpf"
            defaultValue={inicial?.cnpjCpf ?? ""}
            className="tabular-nums"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="slug">Subdomínio *</Label>
          <div className="flex items-center gap-1">
            <Input
              id="slug"
              name="slug"
              required
              defaultValue={inicial?.slug ?? ""}
              placeholder="minhaorg"
              className="font-mono"
            />
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              .confluir.com.br
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={inicial?.status ?? "ativo"}
            className={SELECT}
          >
            {STATUS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plano">Plano</Label>
          <Input id="plano" name="plano" defaultValue={inicial?.plano ?? ""} />
        </div>
      </div>
    </>
  )
}

export function NovoTenantForm() {
  const [estado, formAction, pendente] = useActionState(criarTenantAction, {})
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <CamposOrganizacao />

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Administrador da organização
        </legend>
        <p className="text-muted-foreground -mt-1 text-xs">
          Recebe acesso total e vai cadastrar os demais usuários da organização.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="admin_nome">Nome *</Label>
            <Input id="admin_nome" name="admin_nome" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="admin_email">E-mail *</Label>
            <Input id="admin_email" name="admin_email" type="email" required />
          </div>
        </div>
      </fieldset>

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
      {estado.aviso && (
        <Alert variant="warning">
          <AlertDescription>{estado.aviso}</AlertDescription>
        </Alert>
      )}
      {estado.link && (
        <Alert>
          <AlertDescription className="grid gap-2">
            <span className="text-sm font-medium">
              Link de acesso do administrador
            </span>
            <div className="flex items-center gap-2">
              <Input readOnly value={estado.link} className="font-mono text-xs" />
              <CopiarBotao texto={estado.link} />
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {!estado.ok && (
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            Criar organização
          </Button>
        )}
        {estado.tenantId && (
          <Button variant="outline" asChild>
            <Link href={`/admin/${estado.tenantId}`}>
              Ver organização
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </form>
  )
}

function CopiarBotao({ texto }: { texto: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      aria-label="Copiar link"
      onClick={() => navigator.clipboard?.writeText(texto)}
    >
      <Copy />
    </Button>
  )
}

export function EditarTenantForm({
  tenantId,
  inicial,
}: {
  tenantId: string
  inicial: {
    nomeRazao: string | null
    nomeFantasia: string | null
    cnpjCpf: string | null
    slug: string
    plano: string | null
    status: string
  }
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarTenantAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <CamposOrganizacao inicial={inicial} />
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
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}

"use client"

import { useActionState } from "react"
import { Loader2, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TIPOS_CARTAO } from "@/lib/compras-constantes"

import { criarCartaoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function CartaoForm({
  pessoas,
}: {
  pessoas: { id: string; nome: string }[]
}) {
  const [estado, acao, pendente] = useActionState(criarCartaoAction, {})
  return (
    <form action={acao} className="grid gap-4">
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
      <div className="grid gap-4 md:grid-cols-5">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="apelido">Nome do cartão *</Label>
          <Input id="apelido" name="apelido" required placeholder="Ex.: Cartão da Sede" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo *</Label>
          <select id="tipo" name="tipo" required defaultValue="credito" className={SELECT}>
            {TIPOS_CARTAO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bandeira">Bandeira</Label>
          <Input id="bandeira" name="bandeira" placeholder="Visa, Master…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="final">4 últimos dígitos *</Label>
          <Input
            id="final"
            name="final"
            required
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{4}"
            placeholder="1234"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5 md:w-80">
          <Label htmlFor="titular_id">Titular / responsável</Label>
          <select id="titular_id" name="titular_id" defaultValue="" className={SELECT}>
            <option value="">Não informado</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Cadastrar cartão
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Por segurança, o sistema guarda só os 4 últimos dígitos — nunca o
        número inteiro, a validade ou o código de segurança.
      </p>
    </form>
  )
}

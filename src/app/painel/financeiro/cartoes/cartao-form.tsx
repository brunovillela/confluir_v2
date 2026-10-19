"use client"

import { useActionState, useEffect, useState } from "react"
import { Loader2, Plus, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TIPOS_CARTAO, USOS_CARTAO } from "@/lib/compras-constantes"

import { criarCartaoAction, definirUsoCartaoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Botão "Novo cartão" no topo da página: o formulário abre num diálogo. */
export function NovoCartaoDialog({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Novo cartão
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Novo cartão</DialogTitle>
          <DialogDescription>Cadastre cada cartão uma vez; desative quando for cancelado.</DialogDescription>
        </DialogHeader>
        {/* key: reabrir o diálogo traz o formulário limpo. */}
        <CartaoForm key={String(aberto)} pessoas={pessoas} onSalvo={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  )
}

export function CartaoForm({
  pessoas,
  onSalvo,
}: {
  pessoas: { id: string; nome: string }[]
  /** Chamado depois de cadastrar (o diálogo fecha). */
  onSalvo?: () => void
}) {
  const [estado, acao, pendente] = useActionState(criarCartaoAction, {})
  useEffect(() => {
    if (estado.ok) onSalvo?.()
  }, [estado, onSalvo])
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
        <CamposUso pessoas={pessoas} />
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

/**
 * Uso do cartão e responsável: corporativo (fatura no Financeiro; o titular é
 * só informativo) ou com um responsável (obrigatório; ele vê a fatura em Meu
 * cartão).
 */
function CamposUso({
  pessoas,
  uso: usoInicial = "corporativo",
  titularId = "",
}: {
  pessoas: { id: string; nome: string }[]
  uso?: string
  titularId?: string
}) {
  const [uso, setUso] = useState(usoInicial)
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:min-w-[36rem]">
      <div className="grid gap-1.5">
        <Label htmlFor="uso">Uso *</Label>
        <select id="uso" name="uso" value={uso} onChange={(e) => setUso(e.target.value)} className={SELECT}>
          {USOS_CARTAO.map((u) => (
            <option key={u.valor} value={u.valor}>
              {u.rotulo}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">{USOS_CARTAO.find((u) => u.valor === uso)?.descricao}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="titular_id">{uso === "responsavel" ? "Responsável *" : "Titular (opcional)"}</Label>
        <select
          id="titular_id"
          name="titular_id"
          defaultValue={titularId}
          required={uso === "responsavel"}
          className={SELECT}
        >
          <option value="">{uso === "responsavel" ? "Escolha quem fica com o cartão" : "Não informado"}</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Troca o uso / responsável de um cartão já cadastrado. */
export function UsoCartaoForm({
  cartaoId,
  uso,
  titularId,
  pessoas,
}: {
  cartaoId: string
  uso: string
  titularId: string | null
  pessoas: { id: string; nome: string }[]
}) {
  const [estado, acao, pendente] = useActionState(definirUsoCartaoAction, {})
  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="cartao_id" value={cartaoId} />
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
      <div className="flex flex-wrap items-end gap-4">
        <CamposUso pessoas={pessoas} uso={uso} titularId={titularId ?? ""} />
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

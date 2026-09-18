"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LinhaInstitucional, ResponsavelLinha } from "@/lib/db/linhas-institucionais"
import { formatarTelefone } from "@/lib/formato"

import { atualizarLinhaAction, criarLinhaAction, excluirLinhaAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const OPERADORAS = ["Vivo", "Claro", "TIM", "Oi", "Algar"]

function SeletorResponsavel({
  id,
  responsaveis,
  padrao,
}: {
  id: string
  responsaveis: ResponsavelLinha[]
  padrao?: string | null
}) {
  const grupos = [...new Set(responsaveis.map((r) => r.origem))]
  return (
    <select id={id} name="usuario_id" className={SELECT} defaultValue={padrao ?? ""}>
      <option value="">Sem responsável (na entidade)</option>
      {grupos.map((g) => (
        <optgroup key={g} label={g}>
          {responsaveis
            .filter((r) => r.origem === g)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

function Campos({
  prefixo,
  linha,
  responsaveis,
}: {
  prefixo: string
  linha?: LinhaInstitucional
  responsaveis: ResponsavelLinha[]
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-numero`}>Número (com DDD)</Label>
          <Input
            id={`${prefixo}-numero`}
            name="numero"
            required
            inputMode="tel"
            placeholder="(22) 98115-1126"
            defaultValue={linha ? formatarTelefone(linha.numero) : ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-operadora`}>Operadora</Label>
          <Input
            id={`${prefixo}-operadora`}
            name="operadora"
            list="operadoras-linha"
            autoComplete="off"
            defaultValue={linha?.operadora ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-chip`}>Chip (ICCID)</Label>
          <Input
            id={`${prefixo}-chip`}
            name="chip"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={linha?.chip ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-resp`}>Com quem está</Label>
          <SeletorResponsavel
            id={`${prefixo}-resp`}
            responsaveis={responsaveis}
            padrao={linha?.usuarioId}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-obs`}>Observação</Label>
          <Input
            id={`${prefixo}-obs`}
            name="observacao"
            autoComplete="off"
            placeholder="Ex.: aparelho da recepção, plano corporativo"
            defaultValue={linha?.observacao ?? ""}
          />
        </div>
      </div>
      <datalist id="operadoras-linha">
        {OPERADORAS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
}

function Mensagens({ estado }: { estado: { erro?: string; ok?: string } }) {
  return (
    <>
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
    </>
  )
}

/** Formulário de cadastro (dentro de um GrupoColapsavel na página). */
export function AdicionarLinha({ responsaveis }: { responsaveis: ResponsavelLinha[] }) {
  const [estado, formAction, pendente] = useActionState(criarLinhaAction, {})
  return (
    <form action={formAction} className="grid gap-4">
      <Mensagens estado={estado} />
      <Campos prefixo="nova" responsaveis={responsaveis} />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Cadastrar linha
        </Button>
      </div>
    </form>
  )
}

/** Formulário de edição (children do CartaoEditavel de cada linha). */
export function EditarLinha({
  linha,
  responsaveis,
}: {
  linha: LinhaInstitucional
  responsaveis: ResponsavelLinha[]
}) {
  const [estado, formAction, pendente] = useActionState(atualizarLinhaAction, {})
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={linha.id} />
      <Mensagens estado={estado} />
      <Campos prefixo={linha.id} linha={linha} responsaveis={responsaveis} />
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirLinha({ id, numero }: { id: string; numero: string }) {
  const [estado, formAction, pendente] = useActionState(excluirLinhaAction, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Remover a linha ${formatarTelefone(numero)} do cadastro?`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <p className="text-destructive mb-1 text-xs">{estado.erro}</p>}
      <Button type="submit" variant="ghost" size="sm" disabled={pendente} aria-label="Remover linha">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
      </Button>
    </form>
  )
}

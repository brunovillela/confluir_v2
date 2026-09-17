"use client"

import { useActionState, useState } from "react"
import { CalendarCheck, Loader2, Trash2, UserCog, UserRoundCheck } from "lucide-react"
import { toast } from "sonner"

import { FiliadoPicker } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { MOTIVOS_OCUPACAO } from "@/lib/contas-funcao-constantes"

import {
  encerrarOcupacaoAction,
  excluirOcupacaoAction,
  novaContaFuncaoAction,
  registrarOcupacaoAction,
  type ResultadoContaFuncao,
} from "./actions"

const SELECT =
  "border-input bg-background h-9 rounded-md border px-3 text-sm [color-scheme:light] dark:[color-scheme:dark]"

/** Conta do posto (ex.: Recepção), com o e-mail coletivo como login. */
export function NovaContaFuncao({ aoCancelar }: { aoCancelar: () => void }) {
  const [estado, formAction, pendente] = useActionState<ResultadoContaFuncao, FormData>(
    novaContaFuncaoAction,
    {}
  )
  const v = estado.valores
  return (
    <form key={JSON.stringify(v ?? {})} action={formAction} className="grid max-w-xl gap-3">
      <p className="text-muted-foreground text-sm">
        Para um e-mail coletivo usado por quem ocupa um posto — como{" "}
        <strong>recepcao@</strong>. A conta é do posto: quem entra no lugar usa
        a mesma conta, e cada período fica registrado com o nome da pessoa.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="conta-nome">Nome do posto</Label>
          <Input
            id="conta-nome"
            name="nome"
            required
            placeholder="Recepção"
            autoComplete="off"
            defaultValue={v?.nome}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="conta-email">E-mail do posto</Label>
          <Input
            id="conta-email"
            name="email"
            type="email"
            required
            placeholder="recepcao@…"
            autoComplete="off"
            defaultValue={v?.email}
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserCog />}
          Criar conta de função
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={aoCancelar}>
          Voltar à busca
        </Button>
      </div>
    </form>
  )
}

export function RegistrarOcupacao({ acessoId, hoje }: { acessoId: string; hoje: string }) {
  const [versao, setVersao] = useState(0)
  const [motivo, setMotivo] = useState("titular")
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    async (prev, formData) => {
      const r = await registrarOcupacaoAction(prev, formData)
      if (r.ok) {
        toast.success(r.ok)
        setVersao((n) => n + 1)
        setMotivo("titular")
      }
      return r
    },
    {}
  )
  const cobertura = motivo !== "titular"
  return (
    <form key={versao} action={formAction} className="grid gap-3">
      <input type="hidden" name="acesso_id" value={acessoId} />
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-1.5">
          <Label>Pessoa</Label>
          <FiliadoPicker
            endpoint="/painel/institucional/usuarios/busca-usuario"
            nome="pessoa_id"
            placeholder="Busque por nome ou CPF"
          />
          <span className="text-muted-foreground text-xs">
            Não achou? Cadastre-a em <strong>Nova pessoa</strong> (sem conceder
            login) — o vínculo Prestador(a) de serviço serve para o prestador.
          </span>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="oc-motivo">Motivo</Label>
          <select
            id="oc-motivo"
            name="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={SELECT}
          >
            {MOTIVOS_OCUPACAO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="oc-inicio">Início</Label>
          <Input id="oc-inicio" name="inicio" type="date" required defaultValue={hoje} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="oc-fim">{cobertura ? "Último dia" : "Fim (se já souber)"}</Label>
          <Input id="oc-fim" name="fim" type="date" required={cobertura} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="oc-obs">Observação</Label>
          <Input id="oc-obs" name="observacao" autoComplete="off" />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {cobertura
          ? "Nos dias da cobertura, as ações da conta são atribuídas a quem cobre; o titular volta a responder depois."
          : "Um titular novo encerra, na véspera do início, o titular que estava em aberto."}
      </p>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserRoundCheck />}
          Registrar no posto
        </Button>
      </div>
    </form>
  )
}

export function AcoesOcupacao({
  acessoId,
  ocupacaoId,
  aberta,
  pessoa,
  hoje,
}: {
  acessoId: string
  ocupacaoId: string
  aberta: boolean
  pessoa: string
  hoje: string
}) {
  const [encerrando, setEncerrando] = useState(false)
  const [estadoEnc, encerrar, pendenteEnc] = useActionState<EstadoForm, FormData>(
    async (prev, formData) => {
      const r = await encerrarOcupacaoAction(prev, formData)
      if (r.ok) toast.success(r.ok)
      return r
    },
    {}
  )
  const [estadoExc, excluir, pendenteExc] = useActionState<EstadoForm, FormData>(
    async (prev, formData) => {
      const r = await excluirOcupacaoAction(prev, formData)
      if (r.ok) toast.success(r.ok)
      return r
    },
    {}
  )
  const erro = estadoEnc.erro ?? estadoExc.erro
  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      {aberta && encerrando ? (
        <form action={encerrar} className="flex items-center gap-1">
          <input type="hidden" name="acesso_id" value={acessoId} />
          <input type="hidden" name="ocupacao_id" value={ocupacaoId} />
          <Input
            name="fim"
            type="date"
            required
            defaultValue={hoje}
            aria-label={`Último dia de ${pessoa}`}
            className="h-8 w-36"
          />
          <Button type="submit" size="sm" disabled={pendenteEnc}>
            {pendenteEnc ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
            Encerrar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEncerrando(false)}>
            Cancelar
          </Button>
        </form>
      ) : aberta ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setEncerrando(true)}>
          <CalendarCheck />
          Encerrar
        </Button>
      ) : null}
      <form
        action={excluir}
        onSubmit={(e) => {
          if (!confirm(`Excluir o período de ${pessoa}? Use só para lançamento errado — para quem saiu, encerre o período.`)) {
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="acesso_id" value={acessoId} />
        <input type="hidden" name="ocupacao_id" value={ocupacaoId} />
        <Button type="submit" size="sm" variant="ghost" disabled={pendenteExc} title="Excluir período">
          {pendenteExc ? <Loader2 className="animate-spin" /> : <Trash2 />}
          <span className="sr-only">Excluir</span>
        </Button>
      </form>
      {erro && <p className="text-destructive max-w-48 text-right text-xs whitespace-normal">{erro}</p>}
    </div>
  )
}

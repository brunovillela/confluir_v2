"use client"

import { useActionState, useState } from "react"
import {
  CalendarCheck,
  Loader2,
  Trash2,
  UserCog,
  UserRoundCheck,
  UserRoundPlus,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { FiliadoPicker, type SugestaoFiliado } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { MOTIVOS_OCUPACAO } from "@/lib/contas-funcao-constantes"
import { VINCULOS_INSTITUICAO } from "@/lib/vinculos-instituicao"

import {
  cadastrarOcupanteAction,
  encerrarOcupacaoAction,
  excluirOcupacaoAction,
  novaContaFuncaoAction,
  registrarOcupacaoAction,
  type ResultadoContaFuncao,
  type ResultadoOcupante,
} from "./actions"

const SELECT =
  "border-input bg-background h-9 rounded-md border px-3 text-sm [color-scheme:light] dark:[color-scheme:dark]"

/** Conta do posto (ex.: Recepção), com o e-mail coletivo como login. */
export function NovaContaFuncao({ aoCancelar }: { aoCancelar: () => void }) {
  const [estado, formAction, pendente] = useActionState<ResultadoContaFuncao, FormData>(
    novaContaFuncaoAction,
    {},
  )
  const v = estado.valores
  return (
    <form key={JSON.stringify(v ?? {})} action={formAction} className="grid max-w-xl gap-3">
      <p className="text-muted-foreground text-sm">
        Para um e-mail coletivo usado por quem ocupa um posto — como <strong>recepcao@</strong>. A
        conta é do posto: quem entra no lugar usa a mesma conta, e cada período fica registrado com
        o nome da pessoa.
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
    {},
  )
  const cobertura = motivo !== "titular"
  const [cadastrando, setCadastrando] = useState(false)
  // Quem acabou de ser cadastrado já vem escolhido no seletor (a key o remonta).
  const [escolhida, setEscolhida] = useState<SugestaoFiliado | null>(null)
  return (
    <div className="grid gap-3">
      {cadastrando && (
        <CadastrarOcupante
          aoCancelar={() => setCadastrando(false)}
          aoCadastrar={(p) => {
            setEscolhida(p)
            setCadastrando(false)
          }}
        />
      )}
      <form key={`${versao}-${escolhida?.id ?? ""}`} action={formAction} className="grid gap-3">
        <input type="hidden" name="acesso_id" value={acessoId} />
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-1.5">
            <Label>Pessoa</Label>
            <FiliadoPicker
              endpoint="/painel/institucional/usuarios/busca-usuario"
              nome="pessoa_id"
              placeholder="Busque por nome ou CPF"
              inicial={escolhida}
            />
            {!cadastrando && (
              <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                Não achou?
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setCadastrando(true)}
                >
                  Cadastrar pessoa
                </Button>
                — sem e-mail e sem acesso próprio: ela entra pela conta do posto.
              </span>
            )}
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
    </div>
  )
}

/**
 * Cadastro rápido de quem vai ocupar o posto: nome, CPF e vínculo. Não cria
 * acesso nem pede e-mail — a pessoa usa a conta do posto. CPF já cadastrado
 * traz a pessoa existente.
 */
function CadastrarOcupante({
  aoCancelar,
  aoCadastrar,
}: {
  aoCancelar: () => void
  aoCadastrar: (p: SugestaoFiliado) => void
}) {
  const [estado, formAction, pendente] = useActionState<ResultadoOcupante, FormData>(
    async (prev, formData) => {
      const r = await cadastrarOcupanteAction(prev, formData)
      if (r.pessoa) {
        toast.success(
          r.pessoa.jaExistia
            ? `${r.pessoa.nome ?? "A pessoa"} já estava cadastrada — escolhida abaixo.`
            : `${r.pessoa.nome} cadastrada — escolhida abaixo.`,
        )
        aoCadastrar({
          id: r.pessoa.id,
          nome_completo: r.pessoa.nome,
          cpf: r.pessoa.cpf,
          matricula_sindical: null,
          filiacao_condicao: null,
        })
      }
      return r
    },
    {},
  )
  return (
    <form action={formAction} className="bg-muted/30 grid gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Cadastrar quem vai ocupar o posto</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={aoCancelar}
          aria-label="Fechar"
        >
          <X />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="ocup-nome">Nome completo</Label>
          <Input id="ocup-nome" name="nome_completo" required autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ocup-cpf">CPF</Label>
          <Input
            id="ocup-cpf"
            name="cpf"
            required
            inputMode="numeric"
            placeholder="000.000.000-00"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ocup-vinculo">Vínculo</Label>
          <select
            id="ocup-vinculo"
            name="vinculo_instituicao"
            defaultValue="Prestador(a) de serviço"
            className={SELECT}
          >
            <option value="">Nenhum</option>
            {VINCULOS_INSTITUICAO.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Sem e-mail e sem acesso próprio: a pessoa entra com o login do posto. Se um dia precisar de
        acesso pessoal, conceda em Usuários e permissões.
      </p>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
          Cadastrar pessoa
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
    {},
  )
  const [estadoExc, excluir, pendenteExc] = useActionState<EstadoForm, FormData>(
    async (prev, formData) => {
      const r = await excluirOcupacaoAction(prev, formData)
      if (r.ok) toast.success(r.ok)
      return r
    },
    {},
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
          if (
            !confirm(
              `Excluir o período de ${pessoa}? Use só para lançamento errado — para quem saiu, encerre o período.`,
            )
          ) {
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="acesso_id" value={acessoId} />
        <input type="hidden" name="ocupacao_id" value={ocupacaoId} />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          disabled={pendenteExc}
          title="Excluir período"
        >
          {pendenteExc ? <Loader2 className="animate-spin" /> : <Trash2 />}
          <span className="sr-only">Excluir</span>
        </Button>
      </form>
      {erro && (
        <p className="text-destructive max-w-48 text-right text-xs whitespace-normal">{erro}</p>
      )}
    </div>
  )
}

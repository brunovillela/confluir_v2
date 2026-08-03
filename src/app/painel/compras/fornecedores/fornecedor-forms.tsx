"use client"

import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type {
  ContaBancaria,
  EnderecoFornecedor,
  Fornecedor,
} from "@/lib/db/fornecedores"

import {
  atualizarFornecedorAction,
  criarFornecedorAction,
  definirInativaAction,
  excluirContaAction,
  excluirEnderecoAction,
  excluirFornecedorAction,
  salvarContaAction,
  salvarEnderecoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Estado = { erro?: string; ok?: string }
type AcaoServidor = (prev: Estado, formData: FormData) => Promise<Estado>

const ACOES_SIMPLES: Record<string, AcaoServidor> = {
  inativar: definirInativaAction,
  excluirFornecedor: excluirFornecedorAction,
  excluirEndereco: excluirEnderecoAction,
  excluirConta: excluirContaAction,
}

export function BotaoAcaoFornecedor({
  acao,
  campos,
  confirmacao,
  variant = "outline",
  children,
  acoes = ACOES_SIMPLES,
}: {
  acao: keyof typeof ACOES_SIMPLES
  campos: Record<string, string>
  confirmacao?: string
  variant?: "default" | "outline" | "ghost" | "destructive"
  children: React.ReactNode
  /** Mapa de ações — Fornecedores por padrão; Entidades passa o seu. */
  acoes?: Record<string, AcaoServidor>
}) {
  const [estado, formAction, pendente] = useActionState(acoes[acao], {})
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (confirmacao && !confirm(confirmacao)) e.preventDefault()
      }}
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <Button type="submit" variant={variant} size="sm" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        {children}
      </Button>
      {estado.erro && (
        <span className="text-destructive max-w-72 text-right text-xs">
          {estado.erro}
        </span>
      )}
    </form>
  )
}

/** Cadastro/edição do fornecedor ou entidade apoiada (linhas de `empresa`). */
export function FornecedorForm({
  fornecedor,
  aoCancelarHref,
  acaoCriar = criarFornecedorAction,
  acaoAtualizar = atualizarFornecedorAction,
  rotuloEntidade = "fornecedor",
  rotuloBloqueio = "Bloqueado para fornecimento",
}: {
  fornecedor?: Fornecedor
  aoCancelarHref?: string
  /** Ações do formulário — Fornecedores por padrão; Entidades passa as suas. */
  acaoCriar?: AcaoServidor
  acaoAtualizar?: AcaoServidor
  /** Palavra usada no botão/placeholder ("fornecedor" ou "entidade apoiada"). */
  rotuloEntidade?: string
  rotuloBloqueio?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    fornecedor ? acaoAtualizar : acaoCriar,
    {}
  )
  const [pj, setPj] = useState(fornecedor?.pessoa_juridica ?? true)
  const [bloqueado, setBloqueado] = useState(
    fornecedor?.fornecedor_bloqueado ?? false
  )

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {fornecedor && (
        <input type="hidden" name="fornecedor_id" value={fornecedor.id} />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome_fantasia">Nome fantasia</Label>
          <Input
            id="nome_fantasia"
            name="nome_fantasia"
            defaultValue={fornecedor?.nome_fantasia ?? ""}
            placeholder={`Como ${rotuloEntidade === "fornecedor" ? "o fornecedor" : "a entidade"} é conhecida`}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nome_razao">Razão social</Label>
          <Input
            id="nome_razao"
            name="nome_razao"
            defaultValue={fornecedor?.nome_razao ?? ""}
            placeholder="Razão social ou nome completo"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cnpj_cpf">CNPJ/CPF (só números)</Label>
          <Input
            id="cnpj_cpf"
            name="cnpj_cpf"
            inputMode="numeric"
            defaultValue={fornecedor?.cnpj_cpf ?? ""}
            placeholder="14 dígitos (CNPJ) ou 11 (CPF)"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch checked={pj} onCheckedChange={setPj} aria-label="Pessoa jurídica" />
          Pessoa jurídica
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch
            checked={bloqueado}
            onCheckedChange={setBloqueado}
            aria-label={rotuloBloqueio}
          />
          {rotuloBloqueio}
        </label>
      </div>
      <input type="hidden" name="pessoa_juridica" value={pj ? "on" : ""} />
      <input
        type="hidden"
        name="fornecedor_bloqueado"
        value={bloqueado ? "on" : ""}
      />
      <div className="flex justify-end gap-2">
        {aoCancelarHref && (
          <Button type="button" variant="outline" asChild>
            <a href={aoCancelarHref}>Cancelar</a>
          </Button>
        )}
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {fornecedor ? "Salvar alterações" : `Cadastrar ${rotuloEntidade}`}
        </Button>
      </div>
    </form>
  )
}

export function EnderecoForm({
  fornecedorId,
  endereco,
  aoCancelarHref,
  acao = salvarEnderecoAction,
}: {
  fornecedorId: string
  endereco?: EnderecoFornecedor
  aoCancelarHref: string
  acao?: AcaoServidor
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const [buscandoCep, setBuscandoCep] = useState(false)

  async function preencherPorCep(e: React.FocusEvent<HTMLInputElement>) {
    const cep = e.target.value.replace(/\D/g, "")
    if (cep.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const d = await r.json()
      if (!d.erro) {
        const form = e.target.form
        const setar = (nome: string, valor: string) => {
          const campo = form?.elements.namedItem(nome) as HTMLInputElement | null
          if (campo && valor) campo.value = valor
        }
        setar("logradouro", d.logradouro)
        setar("bairro", d.bairro)
        setar("cidade", d.localidade)
        setar("estado", d.uf)
      }
    } catch {
      // ViaCEP fora do ar não impede o preenchimento manual.
    } finally {
      setBuscandoCep(false)
    }
  }

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="fornecedor_id" value={fornecedorId} />
      {endereco && <input type="hidden" name="endereco_id" value={endereco.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="end-nome">Identificação</Label>
          <Input
            id="end-nome"
            name="nome_endereco"
            defaultValue={endereco?.nome_endereco ?? ""}
            placeholder="Ex.: Matriz, Depósito"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end-cep">CEP {buscandoCep && "(buscando…)"}</Label>
          <Input
            id="end-cep"
            name="cep"
            inputMode="numeric"
            defaultValue={endereco?.cep ?? ""}
            onBlur={preencherPorCep}
            placeholder="Somente números"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end-numero">Número</Label>
          <Input
            id="end-numero"
            name="numero"
            defaultValue={endereco?.numero ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="end-logradouro">Logradouro</Label>
          <Input
            id="end-logradouro"
            name="logradouro"
            defaultValue={endereco?.logradouro ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end-complemento">Complemento</Label>
          <Input
            id="end-complemento"
            name="complemento"
            defaultValue={endereco?.complemento ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="end-bairro">Bairro</Label>
          <Input
            id="end-bairro"
            name="bairro"
            defaultValue={endereco?.bairro ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end-cidade">Cidade</Label>
          <Input
            id="end-cidade"
            name="cidade"
            defaultValue={endereco?.cidade ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end-estado">UF</Label>
          <Input
            id="end-estado"
            name="estado"
            maxLength={2}
            defaultValue={endereco?.estado ?? ""}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {endereco ? "Salvar endereço" : "Adicionar endereço"}
        </Button>
      </div>
    </form>
  )
}

const TIPOS_CONTA = ["Conta corrente", "Conta poupança", "Conta salário"] as const

export function ContaForm({
  fornecedorId,
  conta,
  aoCancelarHref,
  acao = salvarContaAction,
}: {
  fornecedorId: string
  conta?: ContaBancaria
  aoCancelarHref: string
  acao?: AcaoServidor
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="fornecedor_id" value={fornecedorId} />
      {conta && <input type="hidden" name="conta_id" value={conta.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cb-banco">Banco</Label>
          <Input
            id="cb-banco"
            name="banco"
            defaultValue={conta?.banco ?? ""}
            placeholder="Ex.: 001 - Banco do Brasil"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cb-agencia">Agência</Label>
          <Input
            id="cb-agencia"
            name="agencia"
            defaultValue={conta?.agencia ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cb-conta">Conta</Label>
          <Input id="cb-conta" name="conta" defaultValue={conta?.conta ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cb-tipo">Tipo de conta</Label>
          <select
            id="cb-tipo"
            name="tipo_conta"
            className={SELECT}
            defaultValue={conta?.tipo_conta ?? ""}
          >
            <option value="">Não informado</option>
            {TIPOS_CONTA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cb-pix">Chave Pix</Label>
          <Input id="cb-pix" name="pix" defaultValue={conta?.pix ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cb-favorecido">Favorecido</Label>
          <Input
            id="cb-favorecido"
            name="favorecido"
            defaultValue={conta?.favorecido ?? ""}
            placeholder="Titular da conta, se diferente"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {conta ? "Salvar conta" : "Adicionar conta"}
        </Button>
      </div>
    </form>
  )
}

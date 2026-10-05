"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { AlertTriangle, Loader2, Sparkles } from "lucide-react"

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
import type { DadosCnpj } from "@/lib/db/fornecedores-cnpj"

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
import { confirmarEnvio } from "@/components/ui/confirmacao"

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
        if (confirmacao) confirmarEnvio(e, confirmacao)
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
  consultarCnpj,
}: {
  fornecedor?: Fornecedor
  aoCancelarHref?: string
  /** Ações do formulário — Fornecedores por padrão; Entidades passa as suas. */
  acaoCriar?: AcaoServidor
  acaoAtualizar?: AcaoServidor
  /** Palavra usada no botão/placeholder ("fornecedor" ou "entidade apoiada"). */
  rotuloEntidade?: string
  rotuloBloqueio?: string
  /** Consulta da Receita + IA (Fornecedores). Sem ela, o botão não aparece. */
  consultarCnpj?: (cnpj: string) => Promise<{ ficha?: DadosCnpj; erro?: string }>
}) {
  const [estado, formAction, pendente] = useActionState(
    fornecedor ? acaoAtualizar : acaoCriar,
    {}
  )
  const formRef = useRef<HTMLFormElement>(null)
  const [consultando, iniciarConsulta] = useTransition()
  const [ficha, setFicha] = useState<DadosCnpj | null>(null)
  const [erroCnpj, setErroCnpj] = useState<string | null>(null)
  const [usarEndereco, setUsarEndereco] = useState(!fornecedor)
  const [pj, setPj] = useState(fornecedor?.pessoa_juridica ?? true)

  function preencherPeloCnpj() {
    if (!consultarCnpj) return
    const form = formRef.current
    const campo = form?.elements.namedItem("cnpj_cpf") as HTMLInputElement | null
    const cnpj = campo?.value ?? ""
    setErroCnpj(null)
    iniciarConsulta(async () => {
      const r = await consultarCnpj(cnpj)
      if (r.erro || !r.ficha) {
        setFicha(null)
        setErroCnpj(r.erro ?? "Não foi possível consultar o CNPJ.")
        return
      }
      const f = r.ficha
      const setar = (nome: string, valor: string | null) => {
        const el = form?.elements.namedItem(nome) as HTMLInputElement | null
        if (el && valor) el.value = valor
      }
      setar("cnpj_cpf", f.cnpj)
      setar("nome_razao", f.nome_razao)
      setar("nome_fantasia", f.nome_fantasia ?? f.nome_razao)
      setPj(true)
      setFicha(f)
    })
  }
  const [bloqueado, setBloqueado] = useState(
    fornecedor?.fornecedor_bloqueado ?? false
  )

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {fornecedor && (
        <input type="hidden" name="fornecedor_id" value={fornecedor.id} />
      )}
      {consultarCnpj && !fornecedor && (
        <p className="text-muted-foreground text-xs">
          Comece pelo CNPJ: <strong>Preencher pelo CNPJ</strong> traz a razão social, o nome
          fantasia e o endereço do cadastro da Receita Federal, padronizados pela IA.
        </p>
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_auto_auto]">
        <div className="grid gap-1.5 md:col-span-2 xl:col-span-1">
          <Label htmlFor="cnpj_cpf">CNPJ/CPF (só números)</Label>
          <div className="flex gap-2">
            <Input
              id="cnpj_cpf"
              name="cnpj_cpf"
              inputMode="numeric"
              defaultValue={fornecedor?.cnpj_cpf ?? ""}
              placeholder="14 dígitos (CNPJ) ou 11 (CPF)"
            />
            {consultarCnpj && (
              <Button
                type="button"
                variant="outline"
                onClick={preencherPeloCnpj}
                disabled={consultando}
                title="Consulta o cadastro da Receita Federal e padroniza com IA"
                className="shrink-0"
              >
                {consultando ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Preencher pelo CNPJ
              </Button>
            )}
          </div>
          {erroCnpj && <p className="text-destructive text-xs">{erroCnpj}</p>}
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
      {ficha && (
        <FichaReceita
          ficha={ficha}
          fornecedorId={fornecedor?.id ?? null}
          usarEndereco={usarEndereco}
          setUsarEndereco={setUsarEndereco}
        />
      )}
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

/** O que a Receita Federal diz do CNPJ consultado — conferência antes de salvar. */
function FichaReceita({
  ficha,
  fornecedorId,
  usarEndereco,
  setUsarEndereco,
}: {
  ficha: DadosCnpj
  fornecedorId: string | null
  usarEndereco: boolean
  setUsarEndereco: (v: boolean) => void
}) {
  const e = ficha.endereco
  const linhaEnd = e
    ? [
        [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", "),
        [e.bairro, e.cidade && e.estado ? `${e.cidade}/${e.estado}` : e.cidade].filter(Boolean).join(" · "),
        e.cep ? `CEP ${e.cep}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    : null
  const duplicado = ficha.existente && ficha.existente.id !== fornecedorId ? ficha.existente : null
  return (
    <div className="bg-muted/40 grid gap-2 rounded-md border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        <Sparkles className="text-primary size-4" />
        Cadastro na Receita Federal
        <span className="text-muted-foreground text-xs font-normal">
          {ficha.viaIA ? "· padronizado pela IA — confira antes de salvar" : "· IA indisponível, padronização simples"}
        </span>
      </p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-xs">Situação cadastral</dt>
          <dd>{ficha.situacao ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Início da atividade</dt>
          <dd>{ficha.abertura ? ficha.abertura.slice(0, 10).split("-").reverse().join("/") : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Contato</dt>
          <dd className="break-words">{[ficha.telefone, ficha.email].filter(Boolean).join(" · ") || "—"}</dd>
        </div>
        {ficha.atividade && (
          <div className="sm:col-span-3">
            <dt className="text-muted-foreground text-xs">Atividade</dt>
            <dd>{ficha.atividade}</dd>
          </div>
        )}
      </dl>
      {duplicado && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription>
            <span>
              Já existe um cadastro ativo com este CNPJ:{" "}
              <a href={`/painel/compras/fornecedores/${duplicado.id}`} className="font-medium underline">
                {duplicado.nome}
              </a>
              . Use-o em vez de criar outro.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {ficha.alertas.length > 0 && (
        <ul className="text-warning-fg list-disc pl-5 text-xs">
          {ficha.alertas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {e && linhaEnd && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            name="receita_endereco_usar"
            checked={usarEndereco}
            onChange={(ev) => setUsarEndereco(ev.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>
            Adicionar o endereço da Receita ao fornecedor: <strong>{linhaEnd}</strong>
          </span>
        </label>
      )}
      {e && <input type="hidden" name="receita_endereco" value={JSON.stringify(e)} />}
    </div>
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

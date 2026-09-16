"use client"

import { textoValidade } from "@/lib/auth-email-constantes"

import { useActionState, useState } from "react"
import {
  Check,
  KeyRound,
  Loader2,
  MailWarning,
  Save,
  Send,
  Trash2,
  UserPlus,
  UserRoundPlus,
} from "lucide-react"

import { FiliadoPicker } from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import {
  type CandidatoOnboarding,
  type ResultadoLogin,
  type ResultadoNovaPessoa,
} from "@/lib/db/acessos"
import { VINCULOS_INSTITUICAO } from "@/lib/vinculos-instituicao"
import { CATALOGO_PERMISSOES } from "@/lib/permissoes-catalogo"

import {
  concederAcessoAction,
  concederLoginAction,
  gerarLinkRecuperacaoAction,
  novaPessoaAction,
  onboardingEmLoteAction,
  revogarAcessoAction,
  salvarDepartamentosComprasAction,
  salvarPerfisUsuarioAction,
  salvarPermissoesAction,
} from "./actions"

/** Perfil (RBAC) exibido no seletor — tipo local (client não importa server-only). */
export type PerfilOpcao = {
  id: string
  nome: string
  descricao: string | null
  alcada_aprovacao: number | null
  ativo: boolean
}

export function PerfisUsuarioForm({
  usuarioId,
  acessoId,
  perfis,
  atribuidos,
}: {
  usuarioId: string
  acessoId: string
  perfis: PerfilOpcao[]
  atribuidos: string[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarPerfisUsuarioAction,
    {}
  )
  const marcados = new Set(atribuidos)

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <input type="hidden" name="acesso_id" value={acessoId} />

      {perfis.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            Nenhum perfil cadastrado. Rode o script dos perfis e crie-os em{" "}
            <strong>Perfis de acesso</strong>.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {perfis.map((p) => (
            <label
              key={p.id}
              className="border-border hover:bg-muted/40 flex items-start gap-2 rounded-md border p-3 text-sm"
            >
              <input
                type="checkbox"
                name="perfil_id"
                value={p.id}
                defaultChecked={marcados.has(p.id)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  {p.nome}
                  {!p.ativo && (
                    <span className="text-muted-foreground"> (inativo)</span>
                  )}
                </span>
                {p.descricao && (
                  <span className="text-muted-foreground text-xs">
                    {p.descricao}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <Check className="size-4" />
          {estado.ok}
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar perfis
        </Button>
      </div>
    </form>
  )
}

export function OnboardingLote({
  emailOk,
  aptos,
  jaComLogin,
  semEmail,
}: {
  emailOk: boolean
  aptos: CandidatoOnboarding[]
  jaComLogin: number
  semEmail: CandidatoOnboarding[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    onboardingEmLoteAction,
    {}
  )
  const podeDisparar = emailOk && aptos.length > 0

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Convida de uma vez os funcionários do quadro (por vínculo institucional)
        que ainda não têm login. Cada um recebe o{" "}
        <strong>perfil padrão de onboarding</strong> (definido em Perfis de
        acesso) — ou, se nenhum estiver marcado, só o autosserviço
        (contracheques, ponto, férias). Os demais acessos são liberados depois,
        por perfil.
      </p>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      {!emailOk && (
        <Alert variant="warning">
          <MailWarning />
          <AlertDescription>
            O e-mail (BREVO) ainda não está configurado. O disparo fica
            bloqueado até configurar — assim ninguém recebe conta sem o convite
            chegar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="border-border rounded-md border p-3">
          <p className="text-muted-foreground text-xs">Aptos a convite</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {aptos.length}
          </p>
        </div>
        <div className="border-border rounded-md border p-3">
          <p className="text-muted-foreground text-xs">Já com login</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {jaComLogin}
          </p>
        </div>
        <div className="border-border rounded-md border p-3">
          <p className="text-muted-foreground text-xs">Sem e-mail</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {semEmail.length}
          </p>
        </div>
      </div>

      {semEmail.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">
            {semEmail.length} sem e-mail cadastrado (não serão convidados)
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {semEmail.map((c) => (
              <li key={c.usuarioId}>
                {c.nome ?? "(sem nome)"}
                {c.vinculo ? ` — ${c.vinculo}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !confirm(
              `Criar login e enviar convite para ${aptos.length} pessoa(s)?`
            )
          ) {
            e.preventDefault()
          }
        }}
      >
        <Button type="submit" disabled={!podeDisparar || pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Disparar convites ({aptos.length})
        </Button>
      </form>
    </div>
  )
}

export function ConcederAcesso() {
  const [novaPessoa, setNovaPessoa] = useState(false)
  if (novaPessoa) return <NovaPessoa aoCancelar={() => setNovaPessoa(false)} />
  return (
    <div className="grid gap-3">
      <ConcederAcessoBusca />
      <p className="text-muted-foreground text-sm">
        Não encontrou a pessoa?{" "}
        <Button type="button" variant="outline" size="sm" onClick={() => setNovaPessoa(true)}>
          <UserRoundPlus />
          Nova pessoa
        </Button>
      </p>
    </div>
  )
}

/**
 * Cadastro de quem ainda não está em Usuários. Se o CPF (ou o e-mail de um
 * cadastro antigo sem CPF) já existe, mostra a pessoa e oferece o acesso a ela
 * em vez de criar outra.
 */
function NovaPessoa({ aoCancelar }: { aoCancelar: () => void }) {
  const [estado, formAction, pendente] = useActionState<ResultadoNovaPessoa, FormData>(
    novaPessoaAction,
    {}
  )
  const v = estado.valores
  return (
    <div className="grid max-w-xl gap-4">
      {/* A key remonta os campos com o que foi digitado: o React limpa o form ao fim da action. */}
      <form key={JSON.stringify(v ?? {})} action={formAction} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nova-nome">Nome completo</Label>
          <Input id="nova-nome" name="nome_completo" required autoComplete="off" defaultValue={v?.nome} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="nova-cpf">CPF</Label>
            <Input
              id="nova-cpf"
              name="cpf"
              required
              inputMode="numeric"
              placeholder="000.000.000-00"
              autoComplete="off"
              defaultValue={v?.cpf}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nova-vinculo">Vínculo com a entidade</Label>
            <select
              id="nova-vinculo"
              name="vinculo_instituicao"
              defaultValue={v?.vinculo ?? ""}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="">Nenhum (só o acesso)</option>
              {VINCULOS_INSTITUICAO.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nova-email">E-mail</Label>
          <Input id="nova-email" name="email" type="email" required autoComplete="off" defaultValue={v?.email} />
          <span className="text-muted-foreground text-xs">
            O convite vai para este e-mail, e é com ele que a pessoa entra. Com
            vínculo, ela passa a contar no quadro da entidade (aniversários do
            painel, convite em lote); o Pessoal depende do vínculo trabalhista.
          </span>
        </div>
        {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
            Cadastrar e conceder acesso
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={aoCancelar}>
            Voltar à busca
          </Button>
        </div>
      </form>

      {estado.existente && <PessoaJaCadastrada pessoa={estado.existente} />}
    </div>
  )
}

function PessoaJaCadastrada({ pessoa }: { pessoa: NonNullable<ResultadoNovaPessoa["existente"]> }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    concederAcessoAction,
    {}
  )
  return (
    <Alert variant="warning">
      <AlertDescription className="grid gap-2">
        <span>
          {pessoa.motivo === "cpf" ? "Este CPF já está" : "Este e-mail já está"} no cadastro de{" "}
          <strong>{pessoa.nome ?? "(sem nome)"}</strong>
          {pessoa.email ? ` (${pessoa.email})` : ""}. Conceda o acesso a esse cadastro em vez de criar outro.
        </span>
        <form action={formAction}>
          <input type="hidden" name="usuario_id" value={pessoa.usuarioId} />
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Conceder acesso a {pessoa.nome?.split(" ")[0] ?? "esta pessoa"}
          </Button>
        </form>
        {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
      </AlertDescription>
    </Alert>
  )
}

function ConcederAcessoBusca() {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    concederAcessoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      <div className="grid gap-1.5">
        <Label>Pessoa (busque nos usuários por nome ou CPF)</Label>
        <FiliadoPicker
          endpoint="/painel/institucional/usuarios/busca-usuario"
          nome="usuario_id"
          placeholder="Busque por nome ou CPF"
        />
        <span className="text-muted-foreground text-xs">
          Cria o perfil de permissões da pessoa. O login (conta de acesso) é uma
          etapa à parte.
        </span>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Conceder acesso
        </Button>
      </div>
    </form>
  )
}

export function PermissoesForm({
  acessoId,
  flags,
  alcada,
}: {
  acessoId: string
  flags: Record<string, boolean>
  alcada: number | null
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarPermissoesAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="acesso_id" value={acessoId} />

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="alcada">Alçada de aprovação em compras (R$)</Label>
        <Input
          id="alcada"
          name="alcada_aprovacao"
          type="number"
          min={0}
          step="0.01"
          defaultValue={alcada ?? ""}
          className="tabular-nums"
        />
        <span className="text-muted-foreground text-xs">
          Valor máximo que a pessoa pode aprovar sem nível superior.
        </span>
      </div>

      <div className="grid gap-4">
        {CATALOGO_PERMISSOES.map((area) => (
          <div key={area.area} className="rounded-lg border p-4">
            <p className="mb-3 text-sm font-semibold">{area.area}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {area.flags.map((f) => (
                <label
                  key={f.chave}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name={f.chave}
                    value="1"
                    defaultChecked={flags[f.chave] === true}
                    className="size-4 shrink-0"
                  />
                  {f.rotulo}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <Check className="size-4" />
          {estado.ok}
        </p>
      )}

      <div className="bg-background/80 sticky bottom-0 border-t py-3 backdrop-blur">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar permissões
        </Button>
      </div>
    </form>
  )
}

function LinkGerado({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">Link para definir a senha</Label>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="border-input bg-muted/40 text-foreground h-9 w-full rounded-md border px-3 font-mono text-xs shadow-xs outline-none"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(link)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          }}
        >
          {copiado ? <Check /> : null}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Vale por {textoValidade()} e funciona uma única vez. Se vencer, gere outro.
      </p>
    </div>
  )
}

/**
 * Integração/onboarding: cria a conta de acesso (sem login) ou gera link de
 * redefinição (com login). O link é sempre exibido — o e-mail é best-effort.
 */
export function AcessoLogin({
  acessoId,
  temLogin,
}: {
  acessoId: string
  temLogin: boolean
}) {
  const acao = temLogin ? gerarLinkRecuperacaoAction : concederLoginAction
  const [estado, formAction, pendente] = useActionState<ResultadoLogin, FormData>(
    acao,
    {}
  )

  return (
    <div className="grid gap-3">
      <form action={formAction}>
        <input type="hidden" name="acesso_id" value={acessoId} />
        <Button type="submit" size="sm" disabled={pendente} variant={temLogin ? "outline" : "default"}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {temLogin ? "Gerar link de redefinição de senha" : "Conceder login (criar acesso)"}
        </Button>
      </form>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <Check className="size-4" />
          {estado.ok}
          {estado.emailEnviado === false ? " (e-mail não enviado)" : ""}
        </p>
      )}
      {estado.link && <LinkGerado link={estado.link} />}
    </div>
  )
}

export function RevogarAcesso({ acessoId }: { acessoId: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    revogarAcessoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Revogar o acesso desta pessoa? O perfil de permissões é removido (o cadastro de usuário permanece)."
          )
        )
          e.preventDefault()
      }}
    >
      <input type="hidden" name="acesso_id" value={acessoId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
        Revogar acesso
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/** Compras: por quais departamentos a pessoa compra e vê compras. */
export function DepartamentosComprasForm({
  acessoId,
  usuarioId,
  departamentos,
  marcados,
}: {
  acessoId: string
  usuarioId: string
  departamentos: { id: string; nome: string }[]
  marcados: string[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarDepartamentosComprasAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="acesso_id" value={acessoId} />
      <input type="hidden" name="usuario_id" value={usuarioId} />
      {departamentos.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum departamento cadastrado em Institucional → Organização.
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {departamentos.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="departamento_id"
                  value={d.id}
                  defaultChecked={marcados.includes(d.id)}
                  className="accent-primary"
                />
                {d.nome}
              </label>
            </li>
          ))}
        </ul>
      )}
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar departamentos
        </Button>
      </div>
    </form>
  )
}

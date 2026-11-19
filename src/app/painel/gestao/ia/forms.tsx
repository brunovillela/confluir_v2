"use client"

import { useActionState } from "react"
import { KeyRound, Loader2, PlugZap, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampoSenha } from "@/components/ui/campo-senha"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { MODULOS_IA } from "@/lib/ia-processos"

import { removerChaveAction, salvarChaveAction, salvarPreferenciasAction, testarChaveSalvaAction } from "./actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  if (estado.erro && !estado.campo) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Cadastro (ou troca) da chave. O campo é de senha e nunca volta preenchido. */
export function ChaveForm({ temChave, podeGuardar }: { temChave: boolean; podeGuardar: boolean }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarChaveAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.ok ?? "form"}>
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="chave">{temChave ? "Trocar pela chave" : "Chave de API da OpenAI"}</Label>
        <CampoSenha
          id="chave"
          name="chave"
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          className="max-w-md font-mono"
          required
          disabled={!podeGuardar}
        />
        <p className="text-muted-foreground text-xs">
          Testamos a chave antes de guardar. Ela é cifrada no servidor e não aparece de novo — nem para você.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pendente || !podeGuardar}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {temChave ? "Testar e trocar" : "Testar e salvar"}
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function TestarChaveBotao() {
  const [estado, action, pendente] = useActionState<EstadoForm>(testarChaveSalvaAction, {})
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Testar agora
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function RemoverChaveBotao({ final }: { final: string | null }) {
  const [estado, action, pendente] = useActionState<EstadoForm>(removerChaveAction, {})
  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(e) =>
        confirmarEnvio(e, `Remover a chave${final ? ` terminada em ${final}` : ""}? A IA volta a usar a conta da plataforma.`)
      }
    >
      <div>
        <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Remover chave
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export type PreferenciasIniciais = {
  modelo: string | null
  modeloPadrao: string
  iaAtiva: boolean
  modulosDesligados: string[]
  limiteMensalUsd: number | null
  bloquearNoLimite: boolean
  precoEntrada: number | null
  precoEntradaCache: number | null
  precoSaida: number | null
}

function br(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",")
}

export function PreferenciasForm({ inicial }: { inicial: PreferenciasIniciais }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarPreferenciasAction, {})
  return (
    <form action={action} className="grid gap-5">
      <ErroNoCampo estado={estado} />

      <label htmlFor="ia_ativa" className="flex items-start gap-2 text-sm">
        <input id="ia_ativa" type="checkbox" name="ia_ativa" defaultChecked={inicial.iaAtiva} className="mt-0.5" />
        <span>
          <span className="font-medium">IA ligada na entidade</span>
          <span className="text-muted-foreground block text-xs">
            Desmarcado, nenhuma tela chama a IA: os botões avisam que ela está desligada.
          </span>
        </span>
      </label>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">Módulos com IA</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS_IA.filter((m) => m.slug !== "outros").map((m) => (
            <label key={m.slug} htmlFor={`modulo-${m.slug}`} className="flex items-center gap-2 text-sm">
              <input
                id={`modulo-${m.slug}`}
                type="checkbox"
                name="modulos"
                value={m.slug}
                defaultChecked={!inicial.modulosDesligados.includes(m.slug)}
              />
              {m.titulo}
            </label>
          ))}
          {/* "Outros" (processos fora do catálogo e o teste da chave) fica sempre ligado. */}
          <input type="hidden" name="modulos" value="outros" />
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="modelo">Modelo</Label>
        <Input
          id="modelo"
          name="modelo"
          defaultValue={inicial.modelo ?? ""}
          placeholder={`${inicial.modeloPadrao} (padrão da plataforma)`}
          className="max-w-xs font-mono"
          maxLength={64}
        />
        <p className="text-muted-foreground text-xs">
          Em branco, vale o padrão. Um modelo menor (ex.: gpt-5.4-mini) custa menos; a chave precisa ter acesso a ele.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Preços do modelo (US$ por 1 milhão de tokens)</legend>
        <p className="text-muted-foreground text-xs">
          Copie da página de preços da OpenAI. Servem para estimar o custo no relatório e no teto; sem eles, o relatório mostra só os tokens.
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="preco_entrada">Entrada</Label>
            <Input id="preco_entrada" name="preco_entrada" inputMode="decimal" defaultValue={br(inicial.precoEntrada)} className="w-32" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preco_entrada_cache">Entrada em cache</Label>
            <Input id="preco_entrada_cache" name="preco_entrada_cache" inputMode="decimal" defaultValue={br(inicial.precoEntradaCache)} className="w-32" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preco_saida">Saída</Label>
            <Input id="preco_saida" name="preco_saida" inputMode="decimal" defaultValue={br(inicial.precoSaida)} className="w-32" />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Teto mensal</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="limite_mensal_usd">Custo estimado por mês (US$)</Label>
          <Input
            id="limite_mensal_usd"
            name="limite_mensal_usd"
            inputMode="decimal"
            defaultValue={br(inicial.limiteMensalUsd)}
            placeholder="sem teto"
            className="w-40"
          />
        </div>
        <label htmlFor="bloquear_no_limite" className="flex items-start gap-2 text-sm">
          <input id="bloquear_no_limite" type="checkbox" name="bloquear_no_limite" defaultChecked={inicial.bloquearNoLimite} className="mt-0.5" />
          <span>
            Parar a IA ao atingir o teto
            <span className="text-muted-foreground block text-xs">
              Desmarcado, o teto só aparece como alerta aqui e no painel da Gestão.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configuração
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

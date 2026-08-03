"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import {
  EmpresaCombobox,
  type EmpresaOpcao,
} from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_CONTRATO_MARCAVEIS } from "@/lib/contratos-constantes"
import type { Contrato } from "@/lib/db/contratos"
import type { EstadoForm } from "@/lib/contas"

import {
  atualizarContratoAction,
  criarContratoAction,
  excluirContratoAction,
} from "./actions"

type AcaoForm = (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; nome: string }
export type OpcaoCategoria = { id: string; nome: string; sigiloso: boolean }

/** Valor NUMERIC → texto pt-BR editável (sem símbolo). */
function valorParaTexto(valor: number | null): string {
  if (valor == null) return ""
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ContratoForm({
  contrato,
  fornecedores,
  departamentos,
  centrosCusto,
  usuarios,
  categorias,
  contratoPrincipalId,
  responsavelPadraoId,
  aoCancelarHref,
  acaoCriar = criarContratoAction,
  acaoAtualizar = atualizarContratoAction,
  beneficiarioRotulo = "Fornecedor",
  mostrarCategoria = true,
  rotuloSubmit,
}: {
  contrato?: Contrato
  fornecedores: EmpresaOpcao[]
  departamentos: Opcao[]
  centrosCusto: Opcao[]
  usuarios: Opcao[]
  categorias: OpcaoCategoria[]
  contratoPrincipalId?: string
  responsavelPadraoId?: string
  aoCancelarHref: string
  /** Ações do formulário (Contratos por padrão; Ajudas passa as suas). */
  acaoCriar?: AcaoForm
  acaoAtualizar?: AcaoForm
  /** Rótulo do favorecido: "Fornecedor" (contrato) ou "Entidade apoiada" (ajuda). */
  beneficiarioRotulo?: string
  /** Categoria só faz sentido em Contratos. */
  mostrarCategoria?: boolean
  /** Sobrescreve o texto do botão (padrão deriva de "contrato"). */
  rotuloSubmit?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    contrato ? acaoAtualizar : acaoCriar,
    {}
  )
  const tipoAtivo = (chave: (typeof TIPOS_CONTRATO_MARCAVEIS)[number]["chave"]) =>
    chave === "aditivo"
      ? (contrato?.aditivo ?? Boolean(contratoPrincipalId))
      : (contrato?.sob_demanda ?? false)

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {contrato && (
        <input type="hidden" name="contrato_id" value={contrato.id} />
      )}
      {contratoPrincipalId && (
        <input
          type="hidden"
          name="contrato_principal_id"
          value={contratoPrincipalId}
        />
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="objeto">Objeto do contrato *</Label>
        <Textarea
          id="objeto"
          name="objeto"
          required
          rows={3}
          defaultValue={contrato?.objeto ?? ""}
          placeholder="Descrição do que é contratado"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>{beneficiarioRotulo}</Label>
          <EmpresaCombobox
            empresas={fornecedores}
            name="fornecedor_id"
            defaultId={contrato?.fornecedor_id ?? undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input
            id="valor"
            name="valor"
            inputMode="decimal"
            defaultValue={valorParaTexto(contrato?.valor ?? null)}
            placeholder="Ex.: 3.500,00"
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_inicio">Início da vigência</Label>
          <input
            id="vigencia_inicio"
            name="vigencia_inicio"
            type="date"
            defaultValue={contrato?.vigencia_inicio ?? ""}
            className={DATA}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_termino">Término da vigência</Label>
          <input
            id="vigencia_termino"
            name="vigencia_termino"
            type="date"
            defaultValue={contrato?.vigencia_termino ?? ""}
            className={DATA}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="departamento_id">Departamento</Label>
          <select
            id="departamento_id"
            name="departamento_id"
            className={SELECT}
            defaultValue={contrato?.departamento_id ?? ""}
          >
            <option value="">Não informado</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_id">Centro de custo</Label>
          <select
            id="centro_custo_id"
            name="centro_custo_id"
            className={SELECT}
            defaultValue={contrato?.centro_custo_id ?? ""}
          >
            <option value="">Não informado</option>
            {centrosCusto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="responsavel_id">Responsável (gestor)</Label>
          <select
            id="responsavel_id"
            name="responsavel_id"
            className={SELECT}
            defaultValue={contrato?.responsavel_id ?? responsavelPadraoId ?? ""}
          >
            <option value="">Não informado</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        {mostrarCategoria && (
          <div className="grid gap-1.5">
            <Label htmlFor="categoria_id">Categoria</Label>
            <select
              id="categoria_id"
              name="categoria_id"
              className={SELECT}
              defaultValue={contrato?.categoria_id ?? ""}
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.sigiloso ? " (sigilosa)" : ""}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              Contratos de categoria sigilosa ficam ocultos para quem não edita.
            </p>
          </div>
        )}
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Tipo (pode combinar)</legend>
        <div className="flex flex-wrap gap-4">
          {TIPOS_CONTRATO_MARCAVEIS.map((t) => (
            <label key={t.chave} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={t.chave}
                defaultChecked={tipoAtivo(t.chave)}
                className="size-4 accent-primary"
              />
              {t.rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Arquivo do contrato (PDF, até 5 MB)</Label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept="application/pdf"
          className="text-muted-foreground file:bg-muted file:text-foreground file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm text-sm"
        />
        {contrato?.arquivo_contrato && (
          <p className="text-muted-foreground text-xs">
            Já existe um arquivo — enviar outro substitui o atual.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {rotuloSubmit ?? (contrato ? "Salvar alterações" : "Cadastrar contrato")}
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirContrato({
  contratoId,
  acao = excluirContratoAction,
  confirmacao = "Excluir este contrato? Ele sai das listagens.",
}: {
  contratoId: string
  acao?: AcaoForm
  confirmacao?: string
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (!confirm(confirmacao)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Excluir
      </Button>
      {estado.erro && (
        <span className="text-destructive max-w-72 text-right text-xs">
          {estado.erro}
        </span>
      )}
    </form>
  )
}

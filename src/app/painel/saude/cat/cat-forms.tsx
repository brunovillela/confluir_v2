"use client"

import { useActionState, useEffect, useRef } from "react"
import { CircleAlert, Loader2, Save, TriangleAlert, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPOS_OBRIGATORIOS, type EstadoCampo } from "@/lib/cat-conferencia"
import { cn } from "@/lib/utils"
import {
  BLOCOS,
  CAMPOS_CAT,
  nomeCampo,
  type CampoCat,
} from "@/lib/saude-campos"

import {
  atualizarCatAction,
  criarCatAction,
  importarCatsAction,
  type EstadoCat,
} from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function ImportarCatsForm() {
  const [estado, formAction, pendente] = useActionState(importarCatsAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          name="arquivo"
          accept=".csv,text/csv"
          required
          className="max-w-sm"
        />
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Importar CATs
        </Button>
      </div>
      {estado.erro && (
        <p className="text-destructive text-sm whitespace-pre-line">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

/** Formulário individual — os 50 campos, na ordem e nos blocos do formulário. */
export function CatForm({
  valores,
  id,
  origemId,
  pedirConfirmacao,
  arquivo,
  aoSalvar,
}: {
  /** Valores atuais por nome de campo (`campo_<n>`), na edição. */
  valores?: Record<string, string>
  id?: string
  /** CAT de origem, quando esta é uma reabertura/óbito do mesmo acidente. */
  origemId?: string | null
  /** Já se sabe que é possível duplicidade: mostra a confirmação desde o início. */
  pedirConfirmacao?: boolean
  /** O PDF lido pela IA: vai junto e fica guardado na CAT. */
  arquivo?: File
  /** Fica na tela depois de salvar (lote): avisa quem chamou em vez de navegar. */
  aoSalvar?: (id: string, mensagem: string) => void
}) {
  const [estado, formAction, pendente] = useActionState<EstadoCat, FormData>(
    id ? atualizarCatAction : criarCatAction,
    {}
  )

  // O File não tem atributo: entra no input pelo DataTransfer, a cada montagem
  // (a key do form muda depois de um erro e remonta o input vazio).
  const pdf = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!arquivo || !pdf.current) return
    const dt = new DataTransfer()
    dt.items.add(arquivo)
    pdf.current.files = dt.files
  }, [arquivo, estado.tentativa])

  const avisado = useRef<string | null>(null)
  useEffect(() => {
    if (estado.salvoId && avisado.current !== estado.salvoId) {
      avisado.current = estado.salvoId
      aoSalvar?.(estado.salvoId, estado.ok ?? "CAT salva.")
    }
  }, [estado.salvoId, estado.ok, aoSalvar])

  // Depois de um erro, o formulário reabre com o que foi digitado (a key o remonta).
  const atuais = estado.valores ?? valores
  return (
    <form key={estado.tentativa ?? 0} action={formAction} className="grid gap-4">
      {id && <input type="hidden" name="id" value={id} />}
      {origemId && <input type="hidden" name="cat_origem_id" value={origemId} />}
      {arquivo && <input ref={pdf} type="file" name="arquivo_pdf" accept="application/pdf" hidden />}
      {aoSalvar && <input type="hidden" name="permanecer" value="1" />}

      {BLOCOS.map((bloco) => (
        <Card key={bloco}>
          <CardContent>
            <p className="mb-3 text-sm font-medium">{bloco}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS_CAT.filter((c) => c.bloco === bloco).map((campo) => (
                <Campo
                  key={campo.n}
                  campo={campo}
                  valor={atuais?.[nomeCampo(campo)] ?? ""}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {!id && (estado.confirmar || pedirConfirmacao) && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="confirmar_possivel" className="accent-primary mt-1" />
          <span>
            Conferi: é <strong>outra CAT</strong>, não a mesma que já está na base.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {id ? "Salvar alterações" : "Cadastrar CAT"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Um campo do formulário da CAT. Na conferência em fila recebe o `estado`
 * (aviso da leitura ou obrigatório vazio) e pode ficar `escondido` — só
 * visualmente: o input continua no form, senão o campo seria gravado vazio.
 */
export function Campo({
  campo,
  valor,
  estado,
  escondido,
}: {
  campo: CampoCat
  valor: string
  estado?: EstadoCampo
  escondido?: boolean
}) {
  const nome = nomeCampo(campo)
  const obrigatorio = CAMPOS_OBRIGATORIOS.has(campo.n)
  const conferir = estado?.tipo === "conferir"
  const vazio = estado?.tipo === "vazio_obrigatorio"
  const idEstado = estado && estado.tipo !== "ok" ? `${nome}-estado` : undefined
  const marca = {
    "aria-invalid": vazio || undefined,
    "aria-describedby": idEstado,
    className: cn(conferir && "border-warning"),
  }
  const rotulo = (
    <Label htmlFor={nome}>
      <span className="text-muted-foreground tabular-nums">{campo.n}</span>{" "}
      {campo.rotulo}
      {obrigatorio && " *"}
    </Label>
  )

  return (
    <div
      className={cn("grid gap-1.5", campo.largo && "sm:col-span-2 lg:col-span-3", escondido && "hidden")}
    >
      {rotulo}
      {campo.tipo === "bool" ? (
        <select id={nome} name={nome} defaultValue={valor} {...marca} className={cn(SELECT, marca.className, vazio && "border-error")}>
          <option value="">Não informado</option>
          <option value="Sim">Sim</option>
          <option value="Não">Não</option>
        </select>
      ) : campo.tipo === "data" ? (
        <Input
          id={nome}
          name={nome}
          type="date"
          defaultValue={valor}
          required={obrigatorio}
          {...marca}
          className={cn("[color-scheme:light] dark:[color-scheme:dark]", marca.className)}
        />
      ) : campo.tipo === "inteiro" ? (
        <Input
          id={nome}
          name={nome}
          inputMode="numeric"
          defaultValue={valor}
          {...marca}
          className={cn("tabular-nums", marca.className)}
        />
      ) : (
        <Input
          id={nome}
          name={nome}
          defaultValue={valor}
          required={obrigatorio}
          placeholder={dica(campo)}
          {...marca}
        />
      )}
      {conferir && (
        <div id={idEstado} className="grid gap-0.5 text-xs">
          {estado.avisos.map((a, i) => (
            <p key={i} className="text-warning-fg flex items-start gap-1">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="text-info-fg font-medium">Leitura da IA:</span> {a.replace(/^Campo \d+ \(.*?\):\s*/, "")}
              </span>
            </p>
          ))}
        </div>
      )}
      {vazio && (
        <p id={idEstado} className="text-error-fg flex items-center gap-1 text-xs">
          <CircleAlert className="size-3.5 shrink-0" />
          Não encontrado no documento
        </p>
      )}
      {ajuda(campo) && (
        <p className="text-muted-foreground text-xs">{ajuda(campo)}</p>
      )}
    </div>
  )
}

function dica(campo: CampoCat): string | undefined {
  if (campo.tipo === "codigo") return "757010600 – Perna (do tornozelo ao joelho)"
  if (campo.tipo === "cbo") return "311205 - Técnico em petroquímica"
  if (campo.tipo === "cid") return "S01.4"
  if (campo.tipo === "cpf") return "000.000.000-00"
  if (campo.n === 20 || campo.n === 41) return "HH:MM"
  return undefined
}

function ajuda(campo: CampoCat): string | undefined {
  if (campo.tipo === "codigo") {
    return "Código de 9 dígitos e descrição, separados por travessão. Sem o código, o registro entra na fila de revisão."
  }
  if (campo.tipo === "cbo") return "Código de 6 dígitos e ocupação."
  if (campo.n === 44) {
    return "É este campo que alimenta o indicador de afastamento do painel."
  }
  return undefined
}

"use client"

import { useActionState, useRef, useState } from "react"
import { Loader2, Save, Sparkles } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import {
  PADRAO_OFICIO,
  ROTULOS_TIPO_OFICIO,
  TIPOS_OFICIO,
  eAutomatico,
  type TipoOficio,
} from "@/lib/oficios-constantes"

import { melhorarOficio } from "./ia-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const AREA =
  "border-input bg-background text-foreground min-h-24 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export type OficioFormDados = {
  id?: string
  tipo?: string | null
  data?: string | null
  sedeId?: string | null
  destinatarioEmpresaId?: string | null
  destinatarioTexto?: string | null
  aosCuidados?: string | null
  assunto?: string | null
  corpo?: string | null
  assinanteIntegranteId?: string | null
}

export function OficioForm({
  action,
  dados,
  empresas,
  sedes,
  assinantes,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: OficioFormDados
  empresas: EmpresaOpcao[]
  sedes: { id: string; nome: string }[]
  assinantes: { id: string; nome: string; cargo: string | null }[]
}) {
  const [estado, formAction, pendente] = useActionState(action, {})
  const [tipo, setTipo] = useState<TipoOficio>(
    (dados?.tipo as TipoOficio) ?? "desfiliacao"
  )
  const novo = !dados?.id
  // No cadastro novo, assunto/corpo seguem o padrão do tipo; na edição, os valores salvos.
  const assuntoDefault = novo ? PADRAO_OFICIO[tipo].assunto : (dados?.assunto ?? "")
  const corpoDefault = novo ? PADRAO_OFICIO[tipo].corpo : (dados?.corpo ?? "")

  const corpoRef = useRef<HTMLTextAreaElement>(null)
  const [iaPendente, setIaPendente] = useState(false)
  const [iaErro, setIaErro] = useState<string | null>(null)

  async function melhorarRedacao() {
    setIaErro(null)
    const corpo = corpoRef.current?.value.trim() ?? ""
    if (corpo.length < 10) {
      setIaErro("Escreva o corpo do ofício primeiro.")
      return
    }
    setIaPendente(true)
    const form = corpoRef.current?.form
    const assunto = (
      form?.elements.namedItem("assunto") as HTMLInputElement | null
    )?.value
    const destinatario = (
      form?.elements.namedItem("destinatario_texto") as HTMLInputElement | null
    )?.value
    const { texto, erro } = await melhorarOficio({
      corpo,
      assunto,
      tipo,
      destinatario,
    })
    setIaPendente(false)
    if (erro) {
      setIaErro(erro)
      return
    }
    if (texto && corpoRef.current) corpoRef.current.value = texto
  }

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="oficio_id" value={dados.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo *</Label>
          <select
            id="tipo"
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoOficio)}
            className={SELECT}
          >
            {TIPOS_OFICIO.map((t) => (
              <option key={t} value={t}>
                {ROTULOS_TIPO_OFICIO[t]}
              </option>
            ))}
          </select>
          {eAutomatico(tipo) && (
            <span className="text-muted-foreground text-xs">
              Automático — a lista de pessoas é puxada da fonte pagadora depois de salvar.
            </span>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data do documento</Label>
          <input
            id="data"
            name="data"
            type="date"
            defaultValue={dados?.data ?? ""}
            className={SELECT}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Destinatário (empresa / fonte pagadora)</Label>
        <EmpresaCombobox
          empresas={empresas}
          name="destinatario_empresa_id"
          defaultId={dados?.destinatarioEmpresaId ?? undefined}
        />
        <Input
          name="destinatario_texto"
          defaultValue={dados?.destinatarioTexto ?? ""}
          placeholder="Ou destinatário livre (ofício manual)"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="aos_cuidados">Aos cuidados (A/C) — opcional</Label>
        <Input
          id="aos_cuidados"
          name="aos_cuidados"
          defaultValue={dados?.aosCuidados ?? ""}
          placeholder="Ex.: Sr. João da Silva — Departamento de Pessoal"
        />
        <span className="text-muted-foreground text-xs">
          Só aparece no ofício se preenchido.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="sede_id">Sede (cidade do cabeçalho)</Label>
          <select
            id="sede_id"
            name="sede_id"
            defaultValue={dados?.sedeId ?? ""}
            className={SELECT}
          >
            <option value="">(selecione)</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assinante_integrante_id">Assinante (diretoria)</Label>
          <select
            id="assinante_integrante_id"
            name="assinante_integrante_id"
            defaultValue={dados?.assinanteIntegranteId ?? ""}
            className={SELECT}
          >
            <option value="">(selecione)</option>
            {assinantes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
                {a.cargo ? ` — ${a.cargo}` : ""}
              </option>
            ))}
          </select>
          {assinantes.length === 0 && (
            <span className="text-warning-fg text-xs">
              Nenhum assinante — cadastre a diretoria vigente em Institucional.
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assunto">Assunto *</Label>
        <Input
          key={`assunto-${novo ? tipo : "e"}`}
          id="assunto"
          name="assunto"
          required
          defaultValue={assuntoDefault}
        />
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="corpo">Corpo</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={melhorarRedacao}
            disabled={iaPendente}
            className="h-7 px-2 text-xs"
          >
            {iaPendente ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {iaPendente ? "Gerando…" : "Melhorar com IA"}
          </Button>
        </div>
        <textarea
          key={`corpo-${novo ? tipo : "e"}`}
          id="corpo"
          name="corpo"
          ref={corpoRef}
          rows={5}
          defaultValue={corpoDefault}
          className={AREA}
        />
        {iaErro && <p className="text-destructive text-xs">{iaErro}</p>}
        {eAutomatico(tipo) && (
          <span className="text-muted-foreground text-xs">
            A lista de nomes entra logo abaixo do corpo no documento.
          </span>
        )}
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {novo ? "Criar ofício" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}

"use client"

import { useActionState, useRef, useState } from "react"
import { Loader2, Save, Sparkles } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import {
  EXPLICACAO_TIPO_OFICIO,
  padraoOficio,
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
  departamentoId?: string | null
}

function tipoSalvo(valor: string | null | undefined): TipoOficio | "" {
  return (TIPOS_OFICIO as readonly string[]).includes(valor ?? "") ? (valor as TipoOficio) : ""
}

export function OficioForm({
  action,
  dados,
  empresas,
  sedes,
  assinantes,
  departamentos,
  semDepartamentoPermitido,
  entidade = null,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: OficioFormDados
  empresas: EmpresaOpcao[]
  sedes: { id: string; nome: string }[]
  assinantes: { id: string; nome: string; cargo: string | null }[]
  /** Departamentos que a pessoa pode escolher (os dela, ou todos). */
  departamentos: { id: string; nome: string }[]
  /** Quem vê todos os ofícios pode deixar sem departamento. */
  semDepartamentoPermitido: boolean
  /** Nome da organização, para o texto padrão de filiação/desfiliação. */
  entidade?: string | null
}) {
  const [estado, formAction, pendente] = useActionState(action, {})
  // Ofício novo começa SEM tipo: o resto do formulário só abre depois da escolha.
  const [tipo, setTipo] = useState<TipoOficio | "">(tipoSalvo(dados?.tipo))
  // No manual, o destinatário é uma empresa cadastrada OU um texto livre — um só.
  const [destinoLivre, setDestinoLivre] = useState(
    !dados?.destinatarioEmpresaId && !!dados?.destinatarioTexto
  )
  const novo = !dados?.id
  // No cadastro novo, assunto/corpo seguem o padrão do tipo; na edição, os valores salvos.
  const assuntoDefault = novo && tipo ? padraoOficio(tipo, entidade).assunto : (dados?.assunto ?? "")
  const corpoDefault = novo && tipo ? padraoOficio(tipo, entidade).corpo : (dados?.corpo ?? "")

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
    const assunto = (form?.elements.namedItem("assunto") as HTMLInputElement | null)?.value
    const destinatario = (form?.elements.namedItem("destinatario_texto") as HTMLInputElement | null)
      ?.value
    const { texto, erro } = await melhorarOficio({
      corpo,
      assunto,
      tipo: tipo || "manual",
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
    // Duas colunas na tela larga: à esquerda os dados do ofício, à direita só
    // o corpo do texto — é onde se passa mais tempo, então ganha a altura toda.
    <form action={formAction} className="grid gap-6 lg:grid-cols-2">
      {dados?.id && <input type="hidden" name="oficio_id" value={dados.id} />}

      <fieldset className="grid gap-2 lg:col-span-2">
        <legend className="mb-2 text-sm font-medium">Tipo de ofício *</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {TIPOS_OFICIO.map((t) => (
            <label
              key={t}
              className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary/5 hover:bg-muted/50 flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors"
            >
              <input
                type="radio"
                name="tipo"
                value={t}
                required
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium">{ROTULOS_TIPO_OFICIO[t]}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {EXPLICACAO_TIPO_OFICIO[t]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {!tipo && (
          <p className="text-muted-foreground text-sm">
            Escolha o tipo para preencher o restante do ofício.
          </p>
        )}
      </fieldset>

      {tipo && (
        <>
          <div className="grid content-start gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="grid gap-1.5">
                <Label htmlFor="departamento_id">
                  Departamento{semDepartamentoPermitido ? "" : " *"}
                </Label>
                <select
                  id="departamento_id"
                  name="departamento_id"
                  required={!semDepartamentoPermitido}
                  defaultValue={
                    dados?.departamentoId ?? (departamentos.length === 1 ? departamentos[0].id : "")
                  }
                  className={SELECT}
                >
                  <option value="" disabled={!semDepartamentoPermitido}>
                    {semDepartamentoPermitido ? "(sem departamento)" : "(selecione)"}
                  </option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground text-xs">
                  Só quem é do departamento vê o ofício.
                </span>
              </div>
            </div>

            {eAutomatico(tipo) ? (
              <div className="grid gap-1.5">
                <Label>Empresa (fonte pagadora) *</Label>
                <EmpresaCombobox
                  empresas={empresas}
                  name="destinatario_empresa_id"
                  defaultId={dados?.destinatarioEmpresaId ?? undefined}
                />
                {/* Ofício antigo (Bubble) pode ter só o destinatário em texto: preserva. */}
                {!dados?.destinatarioEmpresaId && dados?.destinatarioTexto && (
                  <>
                    <input
                      type="hidden"
                      name="destinatario_texto"
                      value={dados.destinatarioTexto}
                    />
                    <span className="text-warning-fg text-xs">
                      Registrado como “{dados.destinatarioTexto}”. Escolha a empresa para puxar a
                      lista de nomes.
                    </span>
                  </>
                )}
                <span className="text-muted-foreground text-xs">
                  É dela que sai a lista de nomes, depois de salvar.
                </span>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={destinoLivre ? "destinatario_texto" : undefined}>
                    Destinatário *
                  </Label>
                  <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
                    {[
                      { livre: false, rotulo: "Empresa cadastrada" },
                      { livre: true, rotulo: "Outro destinatário" },
                    ].map((o) => (
                      <button
                        key={o.rotulo}
                        type="button"
                        onClick={() => setDestinoLivre(o.livre)}
                        aria-pressed={destinoLivre === o.livre}
                        className={`rounded px-2 py-1 transition-colors ${
                          destinoLivre === o.livre
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {o.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
                {destinoLivre ? (
                  <Input
                    id="destinatario_texto"
                    name="destinatario_texto"
                    required
                    defaultValue={dados?.destinatarioTexto ?? ""}
                    placeholder="Pessoa, órgão ou entidade — ex.: Superintendência Regional do Trabalho"
                  />
                ) : (
                  <EmpresaCombobox
                    empresas={empresas}
                    name="destinatario_empresa_id"
                    defaultId={dados?.destinatarioEmpresaId ?? undefined}
                  />
                )}
              </div>
            )}

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
          </div>

          <div className="grid content-start gap-1.5">
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
                {iaPendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {iaPendente ? "Gerando…" : "Melhorar com IA"}
              </Button>
            </div>
            <textarea
              key={`corpo-${novo ? tipo : "e"}`}
              id="corpo"
              name="corpo"
              ref={corpoRef}
              rows={18}
              defaultValue={corpoDefault}
              className={`${AREA} min-h-72 lg:min-h-[28rem]`}
            />
            {iaErro && <p className="text-destructive text-xs">{iaErro}</p>}
            {eAutomatico(tipo) && (
              <span className="text-muted-foreground text-xs">
                A lista de nomes entra logo abaixo do corpo no documento.
              </span>
            )}
          </div>
        </>
      )}

      <div className="grid gap-2 lg:col-span-2">
        {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
        {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
        <div>
          <Button type="submit" disabled={pendente || !tipo}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            {novo ? "Criar ofício" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </form>
  )
}

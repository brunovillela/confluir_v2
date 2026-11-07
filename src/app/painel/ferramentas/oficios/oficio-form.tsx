"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Eye, Loader2, Plus, Save, Sparkles, X } from "lucide-react"

import { EditorOficio, type EditorOficioRef } from "@/components/editor-oficio"
import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import { registrarFormularioOficio } from "@/lib/oficio-alteracoes"
import { corpoEmTexto, saudacaoNoCorpo } from "@/lib/oficio-formatacao"
import {
  EXPLICACAO_TIPO_OFICIO,
  FECHO_PADRAO,
  MAX_ASSINANTES_OFICIO,
  MAX_LINHAS_AOS_CUIDADOS,
  SAUDACAO_PADRAO,
  SUGESTOES_FECHO,
  SUGESTOES_SAUDACAO,
  padraoOficio,
  ROTULOS_TIPO_OFICIO,
  TIPOS_OFICIO,
  eAutomatico,
  type TipoOficio,
} from "@/lib/oficios-constantes"

import { melhorarOficio } from "./ia-actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

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
  saudacao?: string | null
  fecho?: string | null
  assinanteIntegranteId?: string | null
  /** Demais assinantes, na ordem do documento. */
  coassinantesIds?: string[]
  departamentoId?: string | null
}

type OpcaoAssinante = { id: string; nome: string; cargo: string | null }

/** Campos do formulário como texto, para saber se algo mudou desde o último salvamento. */
function retrato(form: HTMLFormElement | null): string {
  if (!form) return ""
  return Array.from(new FormData(form))
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${k}=${v as string}`)
    .join("\u0000")
}

/**
 * Assinantes da diretoria: o primeiro é o principal e os demais assinam junto,
 * na ordem da lista (é a ordem dos nomes no documento).
 */
function CampoAssinantes({ opcoes, iniciais }: { opcoes: OpcaoAssinante[]; iniciais: string[] }) {
  // Chave estável por linha, para remover uma do meio sem trocar os valores.
  const [linhas, setLinhas] = useState(() => {
    const ids = iniciais.filter((v, i) => v || i === 0)
    return (ids.length ? ids : [""]).map((id, i) => ({ chave: i, id }))
  })
  const nova = (atual: { chave: number }[]) => ({ chave: Math.max(-1, ...atual.map((x) => x.chave)) + 1, id: "" })
  const escolhidos = linhas.map((l) => l.id).filter(Boolean)

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="assinante_integrante_id">
        {linhas.length > 1 ? "Assinantes (diretoria)" : "Assinante (diretoria)"}
      </Label>
      {linhas.map((l, i) => (
        <div key={l.chave} className="flex items-center gap-2">
          <select
            id={i === 0 ? "assinante_integrante_id" : undefined}
            aria-label={i === 0 ? undefined : `Assinante ${i + 1}`}
            name={i === 0 ? "assinante_integrante_id" : "coassinante_integrante_id"}
            value={l.id}
            onChange={(e) =>
              setLinhas((atual) => atual.map((x) => (x.chave === l.chave ? { ...x, id: e.target.value } : x)))
            }
            className={SELECT}
          >
            <option value="">(selecione)</option>
            {opcoes
              .filter((a) => a.id === l.id || !escolhidos.includes(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.cargo ? ` — ${a.cargo}` : ""}
                </option>
              ))}
          </select>
          {linhas.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Tirar este assinante"
              aria-label={`Tirar o assinante ${i + 1}`}
              onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {opcoes.length === 0 ? (
          <span className="text-warning-fg text-xs">
            Nenhum assinante — cadastre a diretoria vigente em Institucional.
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {linhas.length > 1
              ? "Todos recebem o convite juntos; o ofício é emitido quando o último assinar."
              : "Precisa de mais de uma assinatura? Adicione os demais."}
          </span>
        )}
        {linhas.length < MAX_ASSINANTES_OFICIO && escolhidos.length < opcoes.length && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setLinhas((atual) => [...atual, nova(atual)])}
          >
            <Plus />
            Adicionar assinante
          </Button>
        )}
      </div>
    </div>
  )
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

  const corpoRef = useRef<EditorOficioRef>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // Retrato do que está salvo e do que foi mandado salvar (vira o salvo no sucesso).
  const salvo = useRef<string | null>(null)
  const enviando = useRef<string | null>(null)
  const envio = useEnvioFormulario(formAction, estado, {
    ref: formRef,
    antes: () => {
      enviando.current = retrato(formRef.current)
    },
  })
  const [saudacao, setSaudacao] = useState(dados?.saudacao ?? SAUDACAO_PADRAO)
  // Saudação escrita no começo do corpo: sairia repetida (ofício 331/2026).
  const [saudacaoRepetida, setSaudacaoRepetida] = useState<{ saudacao: string; resto: string } | null>(
    () => saudacaoNoCorpo(dados?.corpo)
  )

  // Alterações não salvas: o envio para assinatura e a emissão usam a versão salva.
  useEffect(() => {
    if (novo) return
    // Depois da montagem: o editor normaliza o corpo ao abrir.
    const t = setTimeout(() => {
      salvo.current = retrato(formRef.current)
    }, 0)
    const alterado = () => salvo.current != null && retrato(formRef.current) !== salvo.current
    const desregistrar = registrarFormularioOficio({
      alterado,
      salvar: () => formRef.current?.requestSubmit(),
    })
    const aoSair = (e: BeforeUnloadEvent) => {
      if (!alterado()) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", aoSair)
    return () => {
      clearTimeout(t)
      desregistrar()
      window.removeEventListener("beforeunload", aoSair)
    }
  }, [novo])

  useEffect(() => {
    if (estado.ok && enviando.current != null) {
      salvo.current = enviando.current
      enviando.current = null
    }
  }, [estado])

  function conferirCorpo() {
    setSaudacaoRepetida(saudacaoNoCorpo(corpoRef.current?.valor()))
  }

  function usarComoSaudacao() {
    if (!saudacaoRepetida) return
    setSaudacao(saudacaoRepetida.saudacao)
    corpoRef.current?.definir(saudacaoRepetida.resto)
    setSaudacaoRepetida(null)
  }

  /**
   * PDF do que está na tela, sem salvar (tarja "PRÉVIA"), numa aba nova. Vai
   * por um formulário comum (POST com target _blank), não por fetch + blob: a
   * aba aberta por blob fica em branco em parte dos navegadores e no celular.
   */
  function verPrevia() {
    const form = formRef.current
    if (!form) return
    const envio = document.createElement("form")
    envio.method = "post"
    envio.action = "/oficio/previa"
    envio.target = "_blank"
    envio.enctype = "multipart/form-data"
    envio.hidden = true
    for (const [nome, valor] of new FormData(form)) {
      if (typeof valor !== "string") continue
      // textarea guarda as quebras de linha (corpo, A/C) sem mexer.
      const campo = document.createElement("textarea")
      campo.name = nome
      campo.value = valor
      envio.appendChild(campo)
    }
    document.body.appendChild(envio)
    envio.submit()
    envio.remove()
  }
  const [iaPendente, setIaPendente] = useState(false)
  const [iaErro, setIaErro] = useState<string | null>(null)

  async function melhorarRedacao() {
    setIaErro(null)
    const corpo = corpoRef.current?.valor() ?? ""
    if (corpoEmTexto(corpo).trim().length < 10) {
      setIaErro("Escreva o corpo do ofício primeiro.")
      return
    }
    setIaPendente(true)
    const form = formRef.current
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
    if (texto) {
      corpoRef.current?.definir(texto)
      conferirCorpo()
    }
  }

  return (
    // Duas colunas na tela larga: à esquerda os dados do ofício, à direita só
    // o corpo do texto — é onde se passa mais tempo, então ganha a altura toda.
    <form action={formAction} {...envio} className="grid gap-6 lg:grid-cols-2">
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
              <Textarea
                id="aos_cuidados"
                name="aos_cuidados"
                rows={2}
                defaultValue={dados?.aosCuidados ?? ""}
                placeholder={"Ex.: Sr. João da Silva\nGerente do Departamento de Pessoal"}
                className="min-h-16"
              />
              <span className="text-muted-foreground text-xs">
                Só aparece no ofício se preenchido. Use uma linha para o nome e outra para o cargo
                (até {MAX_LINHAS_AOS_CUIDADOS} linhas).
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
            </div>

            <CampoAssinantes
              opcoes={assinantes}
              iniciais={[dados?.assinanteIntegranteId ?? "", ...(dados?.coassinantesIds ?? [])]}
            />

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
              <Label id="rotulo-corpo" htmlFor="corpo">
                Corpo
              </Label>
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
            <div className="grid gap-1.5">
              <Label htmlFor="saudacao">Saudação</Label>
              <Input
                id="saudacao"
                name="saudacao"
                list="sugestoes-saudacao"
                value={saudacao}
                onChange={(e) => setSaudacao(e.target.value)}
                placeholder={SAUDACAO_PADRAO}
                maxLength={120}
              />
              <datalist id="sugestoes-saudacao">
                {SUGESTOES_SAUDACAO.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            {/* O input do editor (contentEditable) sobe até aqui. */}
            <div onInput={conferirCorpo}>
              <EditorOficio
                key={`corpo-${novo ? tipo : "e"}`}
                id="corpo"
                name="corpo"
                rotuloId="rotulo-corpo"
                ref={corpoRef}
                valorInicial={corpoDefault}
              />
            </div>
            {saudacaoRepetida && (
              <div className="border-warning/40 bg-warning/10 grid gap-2 rounded-md border px-3 py-2 text-sm">
                <p>
                  O texto começa com uma saudação (“{saudacaoRepetida.saudacao}”), e o ofício já tem a
                  saudação “{saudacao || SAUDACAO_PADRAO}” logo acima dele. Do jeito que está, sai
                  repetida.
                </p>
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={usarComoSaudacao}>
                    Usar “{saudacaoRepetida.saudacao}” como saudação
                  </Button>
                </div>
              </div>
            )}
            {iaErro && <p className="text-destructive text-xs">{iaErro}</p>}
            {eAutomatico(tipo) && (
              <span className="text-muted-foreground text-xs">
                A lista de nomes entra logo abaixo do corpo no documento.
              </span>
            )}
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="fecho">Fecho</Label>
              <Input
                id="fecho"
                name="fecho"
                list="sugestoes-fecho"
                defaultValue={dados?.fecho ?? FECHO_PADRAO}
                placeholder={FECHO_PADRAO}
                maxLength={120}
              />
              <datalist id="sugestoes-fecho">
                {SUGESTOES_FECHO.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
        </>
      )}

      <div className="grid gap-2 lg:col-span-2">
        {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
        {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pendente || !tipo}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            {novo ? "Criar ofício" : "Salvar alterações"}
          </Button>
          {tipo && (
            <Button type="button" variant="outline" onClick={verPrevia}>
              <Eye />
              Ver como fica (PDF)
            </Button>
          )}
        </div>
        {tipo && (
          <span className="text-muted-foreground text-xs">
            A prévia mostra o que está na tela, mesmo sem salvar.
          </span>
        )}
      </div>
    </form>
  )
}

"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Save, Sparkles, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  atualizarTermoAction,
  criarTermoAction,
  definirVigenteAction,
  excluirTermoAction,
  melhorarTermoAction,
} from "./actions"

/**
 * Com o Primeiro acesso exigindo o termo (Filiados › Área do associado), a
 * versão que passa a valer barra toda a base no próximo acesso ao portal:
 * quem publica confirma antes, sabendo disso.
 */
const AVISO_PRIMEIRO_ACESSO =
  "Com o Primeiro acesso exigindo o termo (Filiados › Área do associado), todos os associados terão de aceitar esta versão no próximo acesso ao portal — e só depois usam o resto dele."

/**
 * Editor de termo com "Melhorar com IA". Sem `id` = nova versão; com `id` =
 * edição. No LGPD, também o "O que mudou nesta versão": o associado o lê, em
 * destaque, no passo de renovação do primeiro acesso (LGPD art. 8º, § 6º).
 */
export function TermoEditor({
  tipo,
  id,
  textoInicial = "",
  oQueMudouInicial = "",
  avisoPublicar = false,
}: {
  tipo: "lgpd" | "desconto"
  id?: string
  textoInicial?: string
  oQueMudouInicial?: string
  /** O Primeiro acesso exige o termo: publicar uma versão pede confirmação. */
  avisoPublicar?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const refMudou = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const [iaPendente, setIaPendente] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function melhorar() {
    const texto = ref.current?.value.trim() ?? ""
    if (texto.length < 10) {
      setErro("Escreva o texto do termo antes de usar a IA.")
      return
    }
    setErro(null)
    setOk(null)
    setIaPendente(true)
    const { texto: melhorado, erro } = await melhorarTermoAction({ tipo, texto })
    setIaPendente(false)
    if (erro) setErro(erro)
    else if (melhorado && ref.current) {
      ref.current.value = melhorado
      setOk("Texto aprimorado pela IA — revise e salve.")
    }
  }

  async function salvar() {
    const texto = ref.current?.value.trim() ?? ""
    if (texto.length < 10) {
      setErro("Escreva o texto do termo.")
      return
    }
    // Nova versão de LGPD passa a valer na hora: com o primeiro acesso
    // exigindo o termo, toda a base vai aceitá-la de novo.
    if (!id && avisoPublicar) {
      const ok = await confirmar({
        titulo: "Publicar a nova versão do termo?",
        descricao: `Esta versão passa a valer agora. ${AVISO_PRIMEIRO_ACESSO}`,
        confirmar: "Publicar",
      })
      if (!ok) return
    }
    setErro(null)
    setOk(null)
    setAviso(null)
    setSalvando(true)
    const oQueMudou = tipo === "lgpd" ? (refMudou.current?.value ?? "") : undefined
    const res = id
      ? await atualizarTermoAction({ tipo, id, texto, oQueMudou })
      : await criarTermoAction({ tipo, texto, oQueMudou })
    setSalvando(false)
    if (res.erro) {
      setErro(res.erro)
      return
    }
    if (!id && ref.current) ref.current.value = ""
    if (!id && refMudou.current) refMudou.current.value = ""
    setOk(id ? "Termo atualizado." : "Nova versão salva e definida como vigente.")
    if ("aviso" in res && res.aviso) setAviso(res.aviso)
    router.refresh()
  }

  return (
    <div className="grid gap-2">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{ok}</AlertDescription>
        </Alert>
      )}
      {aviso && (
        <Alert variant="warning">
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      <Textarea
        ref={ref}
        defaultValue={textoInicial}
        rows={6}
        placeholder="Escreva o texto legal que o filiado autoriza…"
        aria-label="Texto do termo"
      />
      {tipo === "lgpd" && (
        <div className="grid gap-1.5">
          <Label htmlFor={`o-que-mudou-${id ?? "nova"}`}>O que mudou nesta versão (opcional)</Label>
          <Textarea
            id={`o-que-mudou-${id ?? "nova"}`}
            ref={refMudou}
            defaultValue={oQueMudouInicial}
            rows={2}
            maxLength={1000}
            placeholder="Ex.: incluímos o envio de avisos pelo celular e o prazo de guarda das gravações das assembleias."
          />
          <p className="text-muted-foreground text-xs">
            Quem já tinha aceitado uma versão anterior lê este resumo, em destaque, antes do texto, ao aceitar de novo
            no portal.
          </p>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={melhorar}
          disabled={iaPendente || salvando}
        >
          {iaPendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Melhorar com IA
        </Button>
        <Button type="button" onClick={salvar} disabled={salvando || iaPendente}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          {id ? "Salvar edição" : "Salvar como vigente"}
        </Button>
      </div>
    </div>
  )
}

export function AcoesVersao({
  tipo,
  id,
  emVigor,
  avisoPublicar = false,
}: {
  tipo: "lgpd" | "desconto"
  id: string
  emVigor: boolean
  /** O Primeiro acesso exige o termo: tornar vigente pede confirmação. */
  avisoPublicar?: boolean
}) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const rodar = (fn: () => Promise<{ erro?: string }>) =>
    startTransition(async () => {
      setErro(null)
      const res = await fn()
      if (res.erro) setErro(res.erro)
      else router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {erro && <span className="text-destructive mr-1 text-xs">{erro}</span>}
      {!emVigor && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={pendente}
          onClick={async () => {
            if (
              avisoPublicar &&
              !(await confirmar({
                titulo: "Tornar esta versão vigente?",
                descricao: `Ela passa a valer agora no lugar da atual. ${AVISO_PRIMEIRO_ACESSO}`,
                confirmar: "Tornar vigente",
              }))
            )
              return
            rodar(() => definirVigenteAction({ tipo, id }))
          }}
        >
          <CheckCircle2 />
          Tornar vigente
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
        onClick={async () => {
          if (await confirmar("Excluir esta versão do termo?"))
            rodar(() => excluirTermoAction({ tipo, id }))
        }}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

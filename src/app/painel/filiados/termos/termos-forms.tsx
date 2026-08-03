"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Save, Sparkles, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import {
  atualizarTermoAction,
  criarTermoAction,
  definirVigenteAction,
  excluirTermoAction,
  melhorarTermoAction,
} from "./actions"

/** Editor de termo com "Melhorar com IA". Sem `id` = nova versão; com `id` = edição. */
export function TermoEditor({
  tipo,
  id,
  textoInicial = "",
}: {
  tipo: "lgpd" | "desconto"
  id?: string
  textoInicial?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const [iaPendente, setIaPendente] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

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
    setErro(null)
    setOk(null)
    setSalvando(true)
    const res = id
      ? await atualizarTermoAction({ tipo, id, texto })
      : await criarTermoAction({ tipo, texto })
    setSalvando(false)
    if (res.erro) {
      setErro(res.erro)
      return
    }
    if (!id && ref.current) ref.current.value = ""
    setOk(id ? "Termo atualizado." : "Nova versão salva e definida como vigente.")
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
      <Textarea
        ref={ref}
        defaultValue={textoInicial}
        rows={6}
        placeholder="Escreva o texto legal que o filiado autoriza…"
      />
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
}: {
  tipo: "lgpd" | "desconto"
  id: string
  emVigor: boolean
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
          onClick={() => rodar(() => definirVigenteAction({ tipo, id }))}
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
        onClick={() => {
          if (confirm("Excluir esta versão do termo?"))
            rodar(() => excluirTermoAction({ tipo, id }))
        }}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

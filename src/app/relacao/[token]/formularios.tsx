"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, Loader2, Send, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { rotuloCompetencia } from "@/lib/repasse"

import { confirmarComunicacaoAction, prepararEnvioAction, registrarEnvioAction, type EstadoLink } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const TIPOS_ARQUIVO: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}
const tipoDoArquivo = (a: File) => a.type || TIPOS_ARQUIVO[(a.name.split(".").pop() ?? "").toLowerCase()] || "application/octet-stream"

/** Guarda nome e e-mail de quem envia, para não digitar de novo (só neste navegador). */
function lembrado(chave: string): string {
  try {
    return localStorage.getItem(`relacao:${chave}`) ?? ""
  } catch {
    return ""
  }
}
function lembrar(chave: string, valor: string) {
  try {
    localStorage.setItem(`relacao:${chave}`, valor)
  } catch {
    /* sem armazenamento: tudo bem */
  }
}

export function EnviarRelacao({
  token,
  opcoes,
  mostrarTipo,
}: {
  token: string
  opcoes: { competencia: number; tipo: string; pendente: boolean }[]
  mostrarTipo: boolean
}) {
  const [semDesconto, setSemDesconto] = useState(false)
  const [etapa, setEtapa] = useState<"" | "subindo" | "registrando">("")
  const [estado, setEstado] = useState<EstadoLink>({})
  const nomeRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  // Preenche nome e e-mail lembrados depois de hidratar (sem estado: nada a reconciliar).
  useEffect(() => {
    if (nomeRef.current && !nomeRef.current.value) nomeRef.current.value = lembrado("nome")
    if (emailRef.current && !emailRef.current.value) emailRef.current.value = lembrado("email")
  }, [])

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const dados = new FormData(form)
    setEstado({})
    if (!semDesconto) {
      const arquivo = dados.get("arquivo")
      if (!(arquivo instanceof File) || arquivo.size === 0) {
        setEstado({ erro: "Escolha o arquivo da relação.", campo: "arquivo" })
        return
      }
      setEtapa("subindo")
      const preparo = await prepararEnvioAction(token, arquivo.name, arquivo.size)
      if (preparo.erro || !preparo.caminho || !preparo.tokenUpload) {
        setEtapa("")
        setEstado({ erro: preparo.erro ?? "Não foi possível preparar o envio." })
        return
      }
      const { createClient } = await import("@/lib/supabase/client")
      const { error } = await createClient()
        .storage.from("relacoes-desconto")
        .uploadToSignedUrl(preparo.caminho, preparo.tokenUpload, arquivo, { contentType: tipoDoArquivo(arquivo) })
      if (error) {
        setEtapa("")
        setEstado({ erro: `Falha ao enviar o arquivo: ${error.message}` })
        return
      }
      dados.set("caminho", preparo.caminho)
      dados.set("nome_arquivo", arquivo.name)
      dados.set("tamanho", String(arquivo.size))
    }
    dados.delete("arquivo")
    setEtapa("registrando")
    const r = await registrarEnvioAction({}, dados)
    setEtapa("")
    setEstado(r)
    if (!r.erro) {
      const nome = String(dados.get("nome") ?? "")
      const email = String(dados.get("email") ?? "")
      lembrar("nome", nome)
      lembrar("email", email)
      form.reset()
      if (nomeRef.current) nomeRef.current.value = nome
      if (emailRef.current) emailRef.current.value = email
      setSemDesconto(false)
    }
  }

  if (opcoes.length === 0) {
    return <p className="text-muted-foreground text-sm">Não há competência aberta para envio no momento.</p>
  }

  return (
    <form onSubmit={enviar} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-1.5">
        <Label htmlFor="competencia">Competência{mostrarTipo ? " e tipo de contribuição" : ""}</Label>
        <select id="competencia" name="competencia" className={SELECT} defaultValue={`${opcoes[0].competencia}|${opcoes[0].tipo}`}>
          {opcoes.map((o) => (
            <option key={`${o.competencia}|${o.tipo}`} value={`${o.competencia}|${o.tipo}`}>
              {rotuloCompetencia(o.competencia)}
              {mostrarTipo ? ` — ${o.tipo}` : ""}
              {o.pendente ? " (pendente)" : ""}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sem_desconto" checked={semDesconto} onChange={(e) => setSemDesconto(e.target.checked)} className="accent-primary size-4" />
        Não houve desconto nesta competência
      </label>

      {!semDesconto && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="arquivo">Arquivo da relação</Label>
            <Input id="arquivo" name="arquivo" type="file" limite="até 25 MB" accept=".pdf,.xlsx,.xls,.ods,.csv,.txt,.jpg,.jpeg,.png,.webp" aria-invalid={estado.campo === "arquivo"} />
            <p className="text-muted-foreground text-xs">
              A relação deve trazer nome, CPF ou matrícula e o valor descontado de cada trabalhador.
            </p>
          </div>
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="valor">Total descontado (opcional)</Label>
            <Input id="valor" name="valor" inputMode="decimal" placeholder="Ex.: 12.345,67" aria-invalid={estado.campo === "valor"} />
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Seu nome</Label>
          <Input ref={nomeRef} id="nome" name="nome" required aria-invalid={estado.campo === "nome"} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Seu e-mail (para receber o comprovante)</Label>
          <Input ref={emailRef} id="email" name="email" type="email" aria-invalid={estado.campo === "email"} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="observacao">Recado ao sindicato (opcional)</Label>
        <Textarea id="observacao" name="observacao" rows={2} />
      </div>

      <div>
        <Button type="submit" disabled={etapa !== ""}>
          {etapa ? <Loader2 className="animate-spin" /> : semDesconto ? <Send /> : <Upload />}
          {etapa === "subindo" ? "Enviando o arquivo…" : etapa === "registrando" ? "Registrando…" : semDesconto ? "Informar sem desconto" : "Enviar relação"}
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          {estado.ok}
        </p>
      )}
    </form>
  )
}

export function ConfirmarRecebimento({ token, comunicacaoId }: { token: string; comunicacaoId: string }) {
  const [estado, setEstado] = useState<EstadoLink>({})
  const [pendente, setPendente] = useState(false)
  const nomeRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (nomeRef.current && !nomeRef.current.value) nomeRef.current.value = lembrado("nome")
    if (emailRef.current) emailRef.current.value = lembrado("email")
  }, [])

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPendente(true)
    const dados = new FormData(e.currentTarget)
    const r = await confirmarComunicacaoAction({}, dados)
    setPendente(false)
    setEstado(r)
    if (!r.erro) lembrar("nome", String(dados.get("nome") ?? ""))
  }

  return (
    <form onSubmit={confirmar} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="comunicacao_id" value={comunicacaoId} />
      <input ref={emailRef} type="hidden" name="email" defaultValue="" />
      <div className="grid gap-1">
        <Label htmlFor={`n-${comunicacaoId}`} className="text-xs">
          Seu nome
        </Label>
        <Input ref={nomeRef} id={`n-${comunicacaoId}`} name="nome" required className="h-9 w-56" />
      </div>
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
        Confirmo o recebimento
      </Button>
      {estado.erro && <p className="text-destructive w-full text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg w-full text-sm">{estado.ok}</p>}
    </form>
  )
}

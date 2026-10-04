"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Combine, FileUp, Loader2, Pencil, Save, ScanText, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TEMAS_CLAUSULA, type TemaClausula } from "@/lib/acordos-constantes"

import {
  confirmarDocumentoAction,
  extrairClausulasAction,
  juntarClausulaAction,
  prepararEnvioDocumentoAction,
  salvarClausulaAction,
  type EstadoExtracao,
} from "../actions"
import { confirmar, confirmarEnvio } from "@/components/ui/confirmacao"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Envia o PDF DIRETO ao armazenamento (link assinado — sem o limite de 4 MB
 * da server action) e, em seguida, separa as cláusulas.
 */
export function EnviarDocumento({
  acordoId,
  qtdClausulas,
}: {
  acordoId: string
  qtdClausulas: number
}) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "extraindo">("parado")
  const [resultado, setResultado] = useState<EstadoExtracao>({})

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const arquivo = (e.currentTarget.elements.namedItem("pdf") as HTMLInputElement).files?.[0]
    if (!arquivo) return
    if (!arquivo.name.toLowerCase().endsWith(".pdf")) {
      setResultado({ erro: "Envie o PDF do acordo." })
      return
    }
    if (qtdClausulas > 0 && !(await confirmar(`O acordo já tem ${qtdClausulas} cláusula(s). A extração vai SUBSTITUIR todas. Continuar?`))) {
      return
    }
    setResultado({})
    setEtapa("enviando")
    const envio = await prepararEnvioDocumentoAction(acordoId)
    if (envio.erro || !envio.caminho || !envio.token) {
      setEtapa("parado")
      setResultado({ erro: envio.erro ?? "Não foi possível preparar o envio." })
      return
    }
    // Carrega o cliente do Supabase só na hora do envio.
    const { createClient } = await import("@/lib/supabase/client")
    const { error } = await createClient()
      .storage.from("acordos")
      .uploadToSignedUrl(envio.caminho, envio.token, arquivo, { contentType: "application/pdf" })
    if (error) {
      setEtapa("parado")
      setResultado({ erro: `Falha ao enviar o PDF: ${error.message}` })
      return
    }
    const conf = await confirmarDocumentoAction(acordoId, envio.caminho)
    if (conf.erro) {
      setEtapa("parado")
      setResultado({ erro: conf.erro })
      return
    }
    setEtapa("extraindo")
    const fd = new FormData()
    fd.set("acordo_id", acordoId)
    setResultado(await extrairClausulasAction({}, fd))
    setEtapa("parado")
    router.refresh()
  }

  return (
    <form onSubmit={enviar} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="pdf">PDF do acordo</Label>
        <Input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" required disabled={etapa !== "parado"} />
        <span className="text-muted-foreground text-xs">
          Sem limite prático de tamanho. O texto de cada cláusula vem do próprio PDF; a IA só sugere o
          tema e um resumo.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={etapa !== "parado"}>
          {etapa === "parado" ? <FileUp /> : <Loader2 className="animate-spin" />}
          {etapa === "enviando"
            ? "Enviando o PDF…"
            : etapa === "extraindo"
              ? "Separando as cláusulas…"
              : "Enviar e extrair cláusulas"}
        </Button>
        {etapa === "extraindo" && (
          <span className="text-muted-foreground text-xs">
            Um acordo grande (100 cláusulas) leva até dois minutos. Não feche a página.
          </span>
        )}
      </div>
      <ResultadoExtracao r={resultado} />
    </form>
  )
}

/** Refaz a extração a partir do PDF já guardado. */
export function ExtrairDeNovo({ acordoId, qtdClausulas }: { acordoId: string; qtdClausulas: number }) {
  const [estado, acao, pendente] = useActionState(extrairClausulasAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (qtdClausulas > 0) confirmarEnvio(e, `Refazer a extração SUBSTITUI as ${qtdClausulas} cláusula(s) atuais, inclusive as correções feitas. Continuar?`)
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="acordo_id" value={acordoId} />
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ScanText />}
          {pendente ? "Separando as cláusulas…" : "Extrair de novo do PDF"}
        </Button>
      </div>
      <ResultadoExtracao r={estado} />
    </form>
  )
}

function ResultadoExtracao({ r }: { r: EstadoExtracao }) {
  if (!r.erro && !r.ok) return null
  return (
    <div className="grid gap-2">
      {r.erro && (
        <Alert variant="destructive">
          <AlertDescription>{r.erro}</AlertDescription>
        </Alert>
      )}
      {r.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{r.ok}</AlertDescription>
        </Alert>
      )}
      {r.avisos?.map((a, i) => (
        <Alert key={i} variant="warning">
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

/** Lápis que abre a edição da cláusula (número, título, tema e texto). */
export function EditarClausula({
  acordoId,
  clausula,
}: {
  acordoId: string
  clausula: { id: string; numero: string | null; titulo: string | null; texto: string | null; tema: TemaClausula }
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(salvarClausulaAction, {})
  if (!aberto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)} aria-label="Editar cláusula">
        <Pencil />
      </Button>
    )
  }
  return (
    <form action={acao} className="bg-muted/30 grid w-full gap-3 rounded-md border p-3">
      <input type="hidden" name="clausula_id" value={clausula.id} />
      <input type="hidden" name="acordo_id" value={acordoId} />
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr_16rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`n-${clausula.id}`}>Número</Label>
          <Input id={`n-${clausula.id}`} name="numero" defaultValue={clausula.numero ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`t-${clausula.id}`}>Título</Label>
          <Input id={`t-${clausula.id}`} name="titulo" defaultValue={clausula.titulo ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`tema-${clausula.id}`}>Tema</Label>
          <select id={`tema-${clausula.id}`} name="tema" defaultValue={clausula.tema} className={SELECT}>
            {TEMAS_CLAUSULA.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`x-${clausula.id}`}>Texto</Label>
        <Textarea id={`x-${clausula.id}`} name="texto" rows={8} defaultValue={clausula.texto ?? ""} className="font-mono text-[13px]" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          <X />
          Fechar
        </Button>
        {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
        {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      </div>
    </form>
  )
}

/** A separação cortou no lugar errado: junta com a cláusula de baixo. */
export function JuntarComProxima({ acordoId, clausulaId }: { acordoId: string; clausulaId: string }) {
  return (
    <form
      action={juntarClausulaAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Juntar esta cláusula com a de baixo? O texto da de baixo passa para esta.")}}
    >
      <input type="hidden" name="clausula_id" value={clausulaId} />
      <input type="hidden" name="acordo_id" value={acordoId} />
      <Button type="submit" variant="ghost" size="sm" aria-label="Juntar com a próxima" title="Juntar com a próxima">
        <Combine />
      </Button>
    </form>
  )
}

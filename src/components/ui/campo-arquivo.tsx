"use client"

import * as React from "react"
import { FileSpreadsheet, FileText, FileUp, FileVideo, ImageUp, Paperclip, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Evento que avisa o campo de que o arquivo do input foi trocado por código
 * (foto reduzida, arquivo recusado e limpo) — essas trocas não disparam
 * "change", então quem mexe em `input.files` ou `input.value` dispara este.
 */
export const EVENTO_ARQUIVO_TROCADO = "arquivo-trocado"

export function avisarArquivoTrocado(input: HTMLInputElement | null | undefined) {
  input?.dispatchEvent(new Event(EVENTO_ARQUIVO_TROCADO))
}

type Tipo = "pdf" | "imagem" | "planilha" | "video" | "outro"

/** Cada pedaço do `accept` vira um rótulo legível e um tipo (para o ícone). */
function rotuloDoAceite(item: string): { rotulo: string; tipo: Tipo } | null {
  const a = item.trim().toLowerCase()
  if (!a) return null
  if (a === "application/pdf" || a === ".pdf") return { rotulo: "PDF", tipo: "pdf" }
  if (a === "image/*") return { rotulo: "imagem", tipo: "imagem" }
  if (a === "image/jpeg" || a === ".jpg" || a === ".jpeg") return { rotulo: "JPG", tipo: "imagem" }
  if (a === "image/png" || a === ".png") return { rotulo: "PNG", tipo: "imagem" }
  if (a === "image/webp" || a === ".webp") return { rotulo: "WEBP", tipo: "imagem" }
  if (a === "image/gif" || a === ".gif") return { rotulo: "GIF", tipo: "imagem" }
  if (a === "video/*") return { rotulo: "vídeo", tipo: "video" }
  if (a.startsWith("video/")) return { rotulo: a.slice(6).toUpperCase(), tipo: "video" }
  if (a === ".csv" || a === "text/csv") return { rotulo: "CSV", tipo: "planilha" }
  if (a === ".xlsx" || a === ".xls" || a.includes("spreadsheet") || a.includes("ms-excel")) return { rotulo: "Excel", tipo: "planilha" }
  if (a === ".docx" || a === ".doc" || a.includes("wordprocessing") || a === "application/msword") return { rotulo: "Word", tipo: "outro" }
  if (a === ".txt" || a === "text/plain") return { rotulo: "TXT", tipo: "outro" }
  if (a.startsWith(".")) return { rotulo: a.slice(1).toUpperCase(), tipo: "outro" }
  if (a.includes("/")) return { rotulo: a.split("/")[1].toUpperCase(), tipo: "outro" }
  return null
}

function lerAceite(accept: string | undefined): { texto: string; tipos: Set<Tipo> } {
  const rotulos: string[] = []
  const tipos = new Set<Tipo>()
  for (const item of (accept ?? "").split(",")) {
    const r = rotuloDoAceite(item)
    if (!r) continue
    tipos.add(r.tipo)
    if (!rotulos.includes(r.rotulo)) rotulos.push(r.rotulo)
  }
  if (rotulos.length === 0) return { texto: "Qualquer arquivo", tipos }
  const texto = rotulos.length === 1 ? rotulos[0] : `${rotulos.slice(0, -1).join(", ")} ou ${rotulos.at(-1)}`
  return { texto: texto.charAt(0).toUpperCase() + texto.slice(1), tipos }
}

function tipoDosAceitos(tipos: Set<Tipo>): Tipo {
  if (tipos.size !== 1) return "outro"
  return [...tipos][0]
}

function tipoDoArquivo(arquivo: File): Tipo {
  if (arquivo.type.startsWith("image/")) return "imagem"
  if (arquivo.type.startsWith("video/")) return "video"
  if (/\.(csv|xlsx?)$/i.test(arquivo.name)) return "planilha"
  if (arquivo.type === "application/pdf") return "pdf"
  return "outro"
}

function IconeDoTipo({ tipo, className }: { tipo: Tipo; className?: string }) {
  if (tipo === "pdf") return <FileText className={className} />
  if (tipo === "imagem") return <ImageUp className={className} />
  if (tipo === "planilha") return <FileSpreadsheet className={className} />
  if (tipo === "video") return <FileVideo className={className} />
  return <FileUp className={className} />
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
}

export type CampoArquivoProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Versão de uma linha, para tabelas e ações em linha. */
  compacto?: boolean
  /** Limite mostrado ao lado dos formatos; o padrão é o teto do envio (4 MB). */
  limite?: string | null
}

/**
 * Campo de arquivo com área de soltar: diz o que é aceito (lido do `accept`)
 * e mostra o arquivo escolhido, com botão para tirar. O input nativo continua
 * no formulário, por cima da área e invisível — clicar, soltar um arquivo,
 * `required`, `name`, `ref` e `onChange` funcionam como antes.
 */
export function CampoArquivo({ className, compacto = false, limite, accept, ref, onChange, disabled, ...props }: CampoArquivoProps) {
  const entrada = React.useRef<HTMLInputElement | null>(null)
  const [arquivos, setArquivos] = React.useState<File[]>([])
  const [arrastando, setArrastando] = React.useState(false)

  const { texto: formatos, tipos } = React.useMemo(() => lerAceite(accept), [accept])
  const teto = limite === undefined ? (tipos.has("video") ? null : "até 4 MB") : limite
  const dica = [formatos, teto].filter(Boolean).join(" · ")

  const ler = React.useCallback(() => setArquivos([...(entrada.current?.files ?? [])]), [])

  const juntarRef = React.useCallback(
    (no: HTMLInputElement | null) => {
      entrada.current = no
      if (typeof ref === "function") ref(no)
      else if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = no
    },
    [ref]
  )

  React.useEffect(() => {
    const input = entrada.current
    if (!input) return
    const form = input.form
    // O reset do formulário (inclusive o automático da server action) limpa o input depois do evento.
    const aoResetar = () => setTimeout(ler, 0)
    input.addEventListener(EVENTO_ARQUIVO_TROCADO, ler)
    form?.addEventListener("reset", aoResetar)
    ler()
    return () => {
      input.removeEventListener(EVENTO_ARQUIVO_TROCADO, ler)
      form?.removeEventListener("reset", aoResetar)
    }
  }, [ler])

  function limpar() {
    const input = entrada.current
    if (!input) return
    input.value = ""
    // Avisa quem escuta o onChange (erros de arquivo, prévias) de que ficou vazio.
    input.dispatchEvent(new Event("change", { bubbles: true }))
    ler()
    input.focus()
  }

  const escolhido = arquivos.length > 0
  const tipoIcone: Tipo = escolhido ? (arquivos.length === 1 ? tipoDoArquivo(arquivos[0]) : "outro") : tipoDosAceitos(tipos)
  const nome = arquivos.length === 1 ? arquivos[0].name : `${arquivos.length} arquivos`
  const total = arquivos.reduce((s, a) => s + a.size, 0)

  const input = (
    <input
      ref={juntarRef}
      type="file"
      accept={accept}
      disabled={disabled}
      title=""
      className="absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      onChange={(e) => {
        ler()
        onChange?.(e)
      }}
      {...props}
    />
  )

  const botaoLimpar = escolhido && !disabled && (
    <button
      type="button"
      onClick={limpar}
      aria-label="Tirar o arquivo escolhido"
      title="Tirar o arquivo"
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground relative z-20 flex shrink-0 items-center justify-center rounded-md transition-colors",
        compacto ? "size-6" : "size-8"
      )}
    >
      <X className={compacto ? "size-3.5" : "size-4"} />
    </button>
  )

  const moldura = cn(
    "relative w-full min-w-0 border border-dashed transition-colors",
    "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
    "has-[input[aria-invalid=true]]:border-destructive has-[input:disabled]:opacity-50",
    escolhido
      ? "border-primary/40 bg-primary/[0.04] border-solid"
      : arrastando
        ? "border-primary bg-primary/10"
        : "border-input bg-muted/30 hover:border-primary/60 hover:bg-primary/[0.04]"
  )
  const eventosArrasto = {
    onDragEnter: () => setArrastando(true),
    onDragLeave: () => setArrastando(false),
    onDrop: () => setArrastando(false),
  }

  if (compacto) {
    return (
      <div data-slot="campo-arquivo" className={cn(moldura, "flex h-8 items-center gap-2 rounded-lg pr-1 pl-2.5 text-xs", className)} title={dica} {...eventosArrasto}>
        {input}
        <Paperclip className={cn("size-3.5 shrink-0", escolhido ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate">
          {escolhido ? (
            <span className="font-medium">{nome}</span>
          ) : (
            <>
              <span className="font-medium">Anexar</span>
              <span className="text-muted-foreground"> · {formatos}</span>
            </>
          )}
        </span>
        {botaoLimpar}
      </div>
    )
  }

  return (
    <div data-slot="campo-arquivo" className={cn(moldura, "flex items-center gap-3 rounded-xl p-3", className)} {...eventosArrasto}>
      {input}
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
          escolhido || arrastando ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        <IconeDoTipo tipo={tipoIcone} className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
        {escolhido ? (
          <>
            <span className="truncate font-medium">{nome}</span>
            <span className="text-muted-foreground truncate text-xs">
              {tamanhoLegivel(total)} · clique ou arraste outro para trocar
            </span>
          </>
        ) : (
          <>
            <span className="truncate">
              <span className="text-primary font-medium">{arrastando ? "Solte o arquivo aqui" : "Escolha um arquivo"}</span>
              {!arrastando && <span className="text-muted-foreground"> ou arraste para cá</span>}
            </span>
            <span className="text-muted-foreground truncate text-xs">{dica}</span>
          </>
        )}
      </span>
      {botaoLimpar}
    </div>
  )
}

"use client"

import { useRef, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"

import { iniciarLeituraAction, prepararEnvioListaAction } from "./actions"

const MAX_ARQUIVO = 25 * 1024 * 1024
const MAX_VISAO = 20 * 1024 * 1024

/** Tipo que o bucket aceita, quando o navegador não sabe dizer (CSV no Windows vem vazio). */
function tipoDoArquivo(arquivo: File): string {
  if (arquivo.type) return arquivo.type
  const ext = arquivo.name.toLowerCase().split(".").pop() ?? ""
  return (
    {
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      ods: "application/vnd.oasis.opendocument.spreadsheet",
      csv: "text/csv",
      txt: "text/plain",
      pdf: "application/pdf",
    }[ext] ?? "application/octet-stream"
  )
}

/**
 * Arquivo + fonte pagadora. O arquivo sobe direto ao armazenamento (sem o
 * teto de 4 MB das actions); a leitura pela IA roda em segundo plano e a tela
 * do lote mostra o andamento — dá para sair e voltar depois.
 */
export function EnviarLista({ fontes }: { fontes: { id: string; nome: string }[] }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [fonteId, setFonteId] = useState("")
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "iniciando">("parado")
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const arquivo = entrada.current?.files?.[0]
    setErro(null)
    if (!arquivo) return setErro("Escolha o arquivo da lista (planilha, CSV, PDF ou imagem).")
    if (arquivo.size > MAX_ARQUIVO) return setErro("Arquivo grande demais — até 25 MB. Divida a lista.")
    if (/^image\//.test(arquivo.type) && arquivo.size > MAX_VISAO) {
      return setErro("Imagem grande demais para a leitura — até 20 MB.")
    }
    setEtapa("enviando")
    try {
      const envio = await prepararEnvioListaAction(arquivo.name, arquivo.size)
      if (envio.erro || !envio.caminho || !envio.token) {
        setErro(envio.erro ?? "Não foi possível preparar o envio.")
        return
      }
      const { createClient } = await import("@/lib/supabase/client")
      const { error } = await createClient()
        .storage.from("listas-trabalhadores")
        .uploadToSignedUrl(envio.caminho, envio.token, arquivo, { contentType: tipoDoArquivo(arquivo) })
      if (error) {
        setErro(`Falha ao enviar o arquivo: ${error.message}`)
        return
      }
      setEtapa("iniciando")
      // Redireciona para o lote; só volta aqui se der erro.
      const r = await iniciarLeituraAction({ caminho: envio.caminho, arquivo: arquivo.name, fonteId })
      if (r?.erro) setErro(r.erro)
    } finally {
      setEtapa("parado")
    }
  }

  const ocupado = etapa !== "parado"

  return (
    <form onSubmit={enviar} className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">Lista de trabalhadores *</Label>
          <Input
            ref={entrada}
            id="arquivo"
            name="arquivo"
            type="file"
            required
            limite="até 25 MB (foto e PDF escaneado: 20 MB)"
            accept=".xlsx,.xls,.ods,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp,image/gif"
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="fonte_id">Fonte pagadora da lista</Label>
          <SelectNativo id="fonte_id" value={fonteId} onChange={(e) => setFonteId(e.target.value)}>
            <option value="">Sem fonte — só dados pessoais</option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </SelectNativo>
          <p className="text-muted-foreground text-xs">
            Com a fonte, a busca também usa a matrícula e dá para atualizar
            cargo, lotação, admissão e os outros dados do vínculo nela — e
            cadastrar quem não for encontrado.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {etapa === "enviando" ? "Enviando o arquivo…" : etapa === "iniciando" ? "Abrindo…" : "Ler a lista"}
        </Button>
        <span className="text-muted-foreground text-sm">
          A IA lê em segundo plano: a tela da lista mostra o andamento e você pode sair e voltar.
        </span>
      </div>
    </form>
  )
}

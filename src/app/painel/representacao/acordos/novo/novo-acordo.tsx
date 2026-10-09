"use client"

import { useState } from "react"
import { FileText, Loader2, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { OpcaoFonte } from "@/lib/db/acordos"
import type { DadosLidos } from "@/lib/db/acordos-leitura"

import { AcordoForm } from "../acordos-forms"
import { lerPdfDoAcordoAction, prepararRascunhoAction } from "../actions"

export type PdfLido = { caminho: string; nomeArquivo: string; dados: DadosLidos }

/**
 * Novo acordo pelo PDF: o arquivo sobe direto ao armazenamento, a IA lê e o
 * formulário abaixo já vem preenchido; ao criar, as cláusulas são separadas.
 * Dá para pular e preencher à mão, como antes.
 */
export function NovoAcordo({ fontes }: { fontes: OpcaoFonte[] }) {
  const [lido, setLido] = useState<PdfLido | null>(null)
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "lendo">("parado")
  const [erro, setErro] = useState<string | null>(null)

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setErro(null)
    if (arquivo.type !== "application/pdf") {
      setErro("Escolha o PDF do acordo.")
      return
    }
    setEtapa("enviando")
    try {
      const envio = await prepararRascunhoAction()
      if (envio.erro || !envio.caminho || !envio.token) {
        setErro(envio.erro ?? "Não foi possível preparar o envio.")
        return
      }
      // Envio direto ao armazenamento: sem o limite de 4 MB das actions.
      const { createClient } = await import("@/lib/supabase/client")
      const { error } = await createClient()
        .storage.from("acordos")
        .uploadToSignedUrl(envio.caminho, envio.token, arquivo, { contentType: "application/pdf" })
      if (error) {
        setErro(`Falha ao enviar o PDF: ${error.message}`)
        return
      }
      setEtapa("lendo")
      const r = await lerPdfDoAcordoAction(envio.caminho)
      if (r.erro || !r.dados) {
        setErro(r.erro ?? "Não foi possível ler o acordo.")
        return
      }
      setLido({ caminho: envio.caminho, nomeArquivo: arquivo.name, dados: r.dados })
    } finally {
      setEtapa("parado")
    }
  }

  const ocupado = etapa !== "parado"

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="text-primary size-4" />
            Começar pelo PDF
          </CardTitle>
          <CardDescription>
            Suba o PDF do acordo: a IA preenche os dados abaixo (tipo, título,
            registro, vigência, abrangência e empregadores) e, ao criar, as
            cláusulas são separadas automaticamente. Confira tudo antes de criar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            type="file"
            accept="application/pdf"
            limite={null}
            disabled={ocupado}
            onChange={aoEscolher}
            aria-label="PDF do acordo"
          />
          {ocupado && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
              <Loader2 className="size-4 animate-spin" />
              {etapa === "enviando" ? "Enviando o PDF…" : "Lendo o acordo com a IA…"}
            </p>
          )}
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          {lido && !ocupado && <ResumoLeitura lido={lido} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do acordo</CardTitle>
          {lido && (
            <CardDescription>
              Preenchidos pela IA a partir de <strong>{lido.nomeArquivo}</strong> — confira antes de criar.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {/* key: o formulário renasce com os valores lidos do PDF. */}
          <AcordoForm
            key={lido?.caminho ?? "manual"}
            fontes={fontes}
            fonteIds={lido?.dados.fonteIds ?? []}
            sugestao={lido ?? undefined}
            aoCancelarHref="/painel/representacao/acordos"
          />
        </CardContent>
      </Card>
    </>
  )
}

function ResumoLeitura({ lido }: { lido: PdfLido }) {
  const d = lido.dados
  return (
    <div className="bg-muted/40 grid gap-2 rounded-md border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        <FileText className="size-4" />
        {lido.nomeArquivo}
        <span className="text-muted-foreground text-xs font-normal">
          {d.escaneado
            ? "· escaneado — só os dados do cadastro"
            : `· ${d.clausulas} cláusula${d.clausulas === 1 ? "" : "s"} encontrada${d.clausulas === 1 ? "" : "s"}`}
        </span>
      </p>
      {d.empresasSemCadastro.length > 0 && (
        <p className="text-warning-fg text-xs">
          Empresas citadas que não estão em Empregadores:{" "}
          <strong>{d.empresasSemCadastro.join(", ")}</strong>.{" "}
          <a
            href="/painel/representacao/empregadores/nova"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Cadastrar empregador
          </a>{" "}
          (abre em outra aba) e depois marque-o na edição do acordo.
        </p>
      )}
      {d.avisos.length > 0 && (
        <ul className="text-warning-fg list-disc pl-5 text-xs">
          {d.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

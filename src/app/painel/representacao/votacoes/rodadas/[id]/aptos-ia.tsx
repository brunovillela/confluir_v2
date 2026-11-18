"use client"

import { useRef, useState } from "react"
import { Loader2, Sparkles, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LinhaApto } from "@/lib/aptos-linhas"
import type { ResultadoImportacaoAptos } from "@/lib/db/assembleias"
import type { LeituraAptos } from "@/lib/db/aptos-lista-ia"

import { incluirAptosLidosAction, lerAptosComIAAction, prepararEnvioAptosAction } from "./actions"

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

const n = (v: number) => v.toLocaleString("pt-BR")
const cpfVisivel = (cpf: string | null) =>
  cpf ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : "—"

/**
 * Lista de aptos em qualquer formato, lida pela IA (17/11/2026) — a mesma
 * leitura da "Atualizar por lista" da Filiação. O arquivo sobe direto ao
 * armazenamento, a IA transcreve, a tela mostra a prévia e só "Incluir"
 * grava. As regras de duplicidade são as do CSV (CPF; sem CPF, e-mail + nome).
 */
export function LerAptosComIA({ rodadaId }: { rodadaId: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "lendo" | "incluindo">("parado")
  const [erro, setErro] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<(LeituraAptos & { arquivo: string }) | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacaoAptos | null>(null)

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Sparkles />
        Ler lista com IA
      </Button>
    )
  }

  function recomecar() {
    setLeitura(null)
    setResultado(null)
    setErro(null)
    if (entrada.current) entrada.current.value = ""
  }

  async function ler(e: React.FormEvent) {
    e.preventDefault()
    const arquivo = entrada.current?.files?.[0]
    setErro(null)
    setLeitura(null)
    setResultado(null)
    if (!arquivo) return setErro("Escolha o arquivo da lista (planilha, CSV, PDF ou imagem).")
    if (arquivo.size > MAX_ARQUIVO) return setErro("Arquivo grande demais — até 25 MB. Divida a lista.")
    if (/^image\//.test(arquivo.type) && arquivo.size > MAX_VISAO) {
      return setErro("Imagem grande demais para a leitura — até 20 MB.")
    }
    setEtapa("enviando")
    try {
      const envio = await prepararEnvioAptosAction(arquivo.name, arquivo.size)
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
      setEtapa("lendo")
      const r = await lerAptosComIAAction({ rodadaId, caminho: envio.caminho, arquivo: arquivo.name })
      if (r.erro) setErro(r.erro)
      else setLeitura({ ...r, arquivo: arquivo.name })
    } catch {
      setErro("A leitura não terminou. Tente de novo; se a lista for muito grande, divida o arquivo.")
    } finally {
      setEtapa("parado")
    }
  }

  async function incluir(linhas: LinhaApto[]) {
    setErro(null)
    setEtapa("incluindo")
    try {
      const r = await incluirAptosLidosAction({
        rodadaId,
        linhas: linhas.map((l) => ({
          cpf: l.cpf,
          nome: l.nome_completo,
          matricula: l.matricula,
          email: l.email,
          telefone: l.telefone,
        })),
      })
      if (r.erro || !r.resultado) setErro(r.erro ?? "Falha ao incluir os aptos.")
      else {
        setResultado(r.resultado)
        setLeitura(null)
      }
    } catch {
      setErro("A inclusão não terminou. Confira a lista de aptos antes de tentar de novo.")
    } finally {
      setEtapa("parado")
    }
  }

  const ocupado = etapa !== "parado"
  const linhas = leitura?.linhas ?? []
  const descartadas = leitura?.descartadas ?? []

  return (
    <div className="grid w-full gap-4 rounded-lg border border-dashed p-4">
      {!leitura && !resultado && (
        <form onSubmit={ler} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="arquivo-aptos-ia">Lista de aptos em qualquer formato</Label>
            <Input
              ref={entrada}
              id="arquivo-aptos-ia"
              type="file"
              required
              disabled={ocupado}
              accept=".xlsx,.xls,.ods,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp,image/gif"
            />
            <p className="text-muted-foreground text-xs">
              Planilha (XLSX, XLS, ODS), CSV, PDF (com texto ou escaneado) ou foto da lista, como a empresa mandou —
              não precisa seguir o modelo. A IA lê nome, CPF, matrícula, e-mail e telefone; você confere a prévia antes
              de incluir. Até 25 MB e {n(3000)} trabalhadores por arquivo (para listas maiores, divida o arquivo ou use
              o CSV modelo).
            </p>
          </div>
          {etapa === "lendo" && (
            <Alert variant="info">
              <Loader2 className="animate-spin" />
              <AlertDescription>
                A IA está lendo a lista. Listas grandes levam alguns minutos — não feche esta página.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {etapa === "enviando" ? "Enviando o arquivo…" : etapa === "lendo" ? "Lendo a lista…" : "Ler a lista"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)} disabled={ocupado}>
              Fechar
            </Button>
          </div>
        </form>
      )}

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {leitura && (
        <div className="grid gap-3">
          <p className="text-sm font-medium">
            Prévia de “{leitura.arquivo}”: a IA leu {n(leitura.lidas ?? 0)} trabalhador
            {(leitura.lidas ?? 0) === 1 ? "" : "es"}. Confira antes de incluir.
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            <li>
              <span className="text-2xl font-semibold tabular-nums">{n(linhas.length)}</span>
              <span className="text-muted-foreground block text-xs">prontos para incluir</span>
            </li>
            <li>
              <span className={`text-2xl font-semibold tabular-nums ${descartadas.length ? "text-destructive" : ""}`}>
                {n(descartadas.length)}
              </span>
              <span className="text-muted-foreground block text-xs">descartados (motivo abaixo)</span>
            </li>
          </ul>
          {(leitura.avisos ?? []).length > 0 && (
            <Alert variant="warning">
              <AlertDescription>
                <ul className="grid gap-1">
                  {leitura.avisos!.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {linhas.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">#</th>
                    <th className="px-2 py-1.5 font-medium">Nome</th>
                    <th className="px-2 py-1.5 font-medium">CPF</th>
                    <th className="px-2 py-1.5 font-medium">Matrícula</th>
                    <th className="px-2 py-1.5 font-medium">E-mail</th>
                    <th className="px-2 py-1.5 font-medium">Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 20).map((l) => (
                    <tr key={l.linha} className="border-t">
                      <td className="text-muted-foreground px-2 py-1 tabular-nums">{l.linha}</td>
                      <td className="px-2 py-1">{l.nome_completo ?? "—"}</td>
                      <td className="px-2 py-1 tabular-nums">{cpfVisivel(l.cpf)}</td>
                      <td className="px-2 py-1 tabular-nums">{l.matricula ?? "—"}</td>
                      <td className="px-2 py-1">{l.email ?? "—"}</td>
                      <td className="px-2 py-1 tabular-nums">{l.telefone ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 20 && (
                <p className="text-muted-foreground border-t px-2 py-1.5 text-xs">
                  … e mais {n(linhas.length - 20)}. As primeiras 20 servem para conferir se as colunas foram lidas certo.
                </p>
              )}
            </div>
          )}
          {descartadas.length > 0 && (
            <div className="grid gap-1 border-t pt-3">
              <p className="text-muted-foreground text-xs font-medium">Descartados (linha lida · nome · motivo):</p>
              <ul className="text-muted-foreground grid max-h-48 gap-0.5 overflow-y-auto text-xs">
                {descartadas.slice(0, 50).map((d) => (
                  <li key={d.linha}>
                    <span className="tabular-nums">linha {d.linha}</span> · {d.nome ?? "sem nome"} · {d.motivo}
                  </li>
                ))}
                {descartadas.length > 50 && <li>… e mais {n(descartadas.length - 50)}</li>}
              </ul>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            CPF já apto nesta rodada (ou, sem CPF, o mesmo e-mail e nome) é ignorado ao incluir.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={ocupado || linhas.length === 0} onClick={() => incluir(linhas)}>
              {etapa === "incluindo" ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {etapa === "incluindo" ? "Incluindo…" : `Incluir ${n(linhas.length)} apto${linhas.length === 1 ? "" : "s"}`}
            </Button>
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={recomecar}>
              Ler outro arquivo
            </Button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="grid gap-3">
          <p className="text-sm font-medium">Inclusão concluída — {n(resultado.totalLinhas)} linhas</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-3">
            <li>
              <span className="text-2xl font-semibold tabular-nums">{n(resultado.inseridos)}</span>
              <span className="text-muted-foreground block text-xs">aptos incluídos</span>
            </li>
            <li>
              <span className="text-2xl font-semibold tabular-nums">{n(resultado.ignorados)}</span>
              <span className="text-muted-foreground block text-xs">ignorados (já aptos ou repetidos)</span>
            </li>
            <li>
              <span className={`text-2xl font-semibold tabular-nums ${resultado.erros.length ? "text-destructive" : ""}`}>
                {n(resultado.erros.length)}
              </span>
              <span className="text-muted-foreground block text-xs">linhas com erro</span>
            </li>
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={recomecar}>
              <Sparkles />
              Ler outro arquivo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

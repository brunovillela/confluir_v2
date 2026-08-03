"use client"

import { useActionState } from "react"
import { Download, FileUp, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { importarFiliadosCsv } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full max-w-md truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoFonte = { id: string; nome: string }

/** Importação de filiados em massa (CSV), escolhendo a fonte pagadora. */
export function ImportarFiliados({ fontes }: { fontes: OpcaoFonte[] }) {
  const [estado, formAction, pendente] = useActionState(importarFiliadosCsv, {})
  const r = estado.resultado

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fonte_id">Fonte pagadora</Label>
          <select id="fonte_id" name="fonte_id" required className={SELECT} defaultValue="">
            <option value="" disabled>
              Selecione a fonte…
            </option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">Planilha CSV</Label>
          <Input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".csv,text/csv"
            required
            className="max-w-md"
          />
          <p className="text-muted-foreground text-xs">
            Colunas obrigatórias: nome_completo e cpf. CPF já cadastrado ganha um
            vínculo com a fonte escolhida (nada do cadastro é sobrescrito); CPF
            novo cria o filiado com condição “Ativo” (ou a da coluna “condicao”).
            Limite de 10.000 linhas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
            {pendente ? "Importando…" : "Importar filiados"}
          </Button>
          <Button variant="outline" asChild>
            <a href="/painel/filiados/importar/modelo" download>
              <Download />
              Baixar modelo da planilha
            </a>
          </Button>
        </div>
      </form>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {r && (
        <div className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            Importação concluída — {r.totalLinhas.toLocaleString("pt-BR")}{" "}
            linha{r.totalLinhas === 1 ? "" : "s"} processada
            {r.totalLinhas === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <span className="text-2xl font-semibold tabular-nums">
                {r.criados.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                filiados novos criados
              </span>
            </li>
            <li>
              <span className="text-2xl font-semibold tabular-nums">
                {r.vinculados.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                já cadastrados — vínculo adicionado
              </span>
            </li>
            <li>
              <span className="text-2xl font-semibold tabular-nums">
                {r.ignorados.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                ignorados (vínculo aberto já existia)
              </span>
            </li>
            <li>
              <span
                className={`text-2xl font-semibold tabular-nums ${r.erros.length > 0 ? "text-destructive" : ""}`}
              >
                {r.erros.length.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                linhas com erro
              </span>
            </li>
          </ul>
          {r.erros.length > 0 && (
            <div className="grid gap-1 border-t pt-3">
              <p className="text-muted-foreground text-xs font-medium">
                Erros (linha da planilha · motivo):
              </p>
              <ul className="text-muted-foreground grid max-h-48 gap-0.5 overflow-y-auto text-xs">
                {r.erros.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="tabular-nums">linha {e.linha}</span> ·{" "}
                    {e.motivo}
                  </li>
                ))}
                {r.erros.length > 50 && (
                  <li>… e mais {r.erros.length - 50} erros</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

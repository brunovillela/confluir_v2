"use client"

import { useActionState, useState } from "react"
import { Download, FileUp, Loader2, UserRoundPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { mascaraCpf } from "@/lib/mascaras"
import { cn } from "@/lib/utils"

import { importarContribuicoes, incluirContribuicao } from "./actions"
import { ImportarRelatorioIa } from "./importar-relatorio-ia"

/**
 * Envio da relação de pagamentos: em massa (CSV) ou um filiado por vez.
 * O CPF ou a matrícula na fonte fazem o vínculo com o filiado.
 */
export function EnviarContribuicoes({
  remessaId,
  fonteId,
}: {
  remessaId: string
  fonteId: string
}) {
  const [modo, setModo] = useState<"massa" | "individual" | "ia">("massa")
  const [massa, massaAction, massaPendente] = useActionState(
    importarContribuicoes,
    {}
  )
  const [individual, individualAction, individualPendente] = useActionState(
    incluirContribuicao,
    {}
  )

  const botaoModo = (valor: "massa" | "individual" | "ia", rotulo: string) => (
    <button
      type="button"
      onClick={() => setModo(valor)}
      aria-pressed={modo === valor}
      className={cn(
        "rounded-full px-3 py-1 text-sm transition-colors",
        modo === valor
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {rotulo}
    </button>
  )

  return (
    <div className="grid gap-4">
      <div className="bg-muted/60 inline-flex w-fit items-center gap-1 rounded-full p-1">
        {botaoModo("massa", "Em massa (CSV)")}
        {botaoModo("ia", "Relatório (IA)")}
        {botaoModo("individual", "Individual")}
      </div>

      {modo === "massa" && (
        <form action={massaAction} className="grid gap-3">
          <input type="hidden" name="remessa_id" value={remessaId} />
          <input type="hidden" name="fonte_id" value={fonteId} />
          <div className="grid gap-1.5">
            <Label htmlFor="arquivo">Relação de pagamentos (CSV)</Label>
            <Input
              id="arquivo"
              name="arquivo"
              type="file"
              accept=".csv,text/csv"
              required
            />
            <p className="text-muted-foreground text-xs">
              Colunas: cpf e/ou matricula (na fonte) + valor. Quem não for
              encontrado entra como “não encontrado no cadastro”.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={massaPendente}>
              {massaPendente ? <Loader2 className="animate-spin" /> : <FileUp />}
              {massaPendente ? "Importando…" : "Importar relação"}
            </Button>
            <Button variant="outline" asChild>
              <a href="/painel/filiados/receitas/modelo" download>
                <Download />
                Baixar planilha modelo
              </a>
            </Button>
          </div>
          {massa.erro && (
            <Alert variant="destructive">
              <AlertDescription>{massa.erro}</AlertDescription>
            </Alert>
          )}
          {massa.resultado && (
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                Importação concluída:{" "}
                {massa.resultado.identificados.toLocaleString("pt-BR")}{" "}
                identificado{massa.resultado.identificados === 1 ? "" : "s"} ·{" "}
                {massa.resultado.naoEncontrados.toLocaleString("pt-BR")} não
                encontrado{massa.resultado.naoEncontrados === 1 ? "" : "s"} ·{" "}
                {massa.resultado.erros.length} linha
                {massa.resultado.erros.length === 1 ? "" : "s"} com erro
              </p>
              {massa.resultado.erros.length > 0 && (
                <ul className="text-muted-foreground grid max-h-40 gap-0.5 overflow-y-auto text-xs">
                  {massa.resultado.erros.slice(0, 40).map((e, i) => (
                    <li key={i}>
                      linha {e.linha} · {e.motivo}
                    </li>
                  ))}
                  {massa.resultado.erros.length > 40 && (
                    <li>… e mais {massa.resultado.erros.length - 40}</li>
                  )}
                </ul>
              )}
              <p className="text-muted-foreground text-xs">
                Recarregue a página para ver a relação atualizada.
              </p>
            </div>
          )}
        </form>
      )}

      {modo === "individual" && (
        <form action={individualAction} className="grid gap-3">
          <input type="hidden" name="remessa_id" value={remessaId} />
          <input type="hidden" name="fonte_id" value={fonteId} />
          {individual.erro && (
            <Alert variant="destructive">
              <AlertDescription>{individual.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                name="cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                onChange={(e) => {
                  e.target.value = mascaraCpf(e.target.value)
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matricula">Matrícula na fonte</Label>
              <Input id="matricula" name="matricula" inputMode="numeric" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valor">Valor *</Label>
              <Input
                id="valor"
                name="valor"
                inputMode="decimal"
                placeholder="0,00"
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={individualPendente} size="sm">
              {individualPendente ? (
                <Loader2 className="animate-spin" />
              ) : (
                <UserRoundPlus />
              )}
              Incluir contribuição
            </Button>
          </div>
        </form>
      )}

      {modo === "ia" && (
        <ImportarRelatorioIa remessaId={remessaId} fonteId={fonteId} />
      )}
    </div>
  )
}

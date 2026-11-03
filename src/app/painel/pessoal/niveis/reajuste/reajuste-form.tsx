"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { aplicarReajuste, gerarTabelaComReajuste } from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** As duas saídas do reajuste: ajustar a tabela vigente ou gerar uma nova. */
export function ReajusteConfirmarForm({
  percentualTexto,
  degraus,
  tabelaId,
}: {
  /** Percentual como digitado (pt-BR), repassado à action. */
  percentualTexto: string
  degraus: number
  /** Tabela vigente, copiada ao gerar uma nova. */
  tabelaId: string
}) {
  const [estado, formAction, pendente] = useActionState(aplicarReajuste, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        confirmarEnvio(e, `Aplicar reajuste de ${percentualTexto}% em ${degraus} degraus da tabela vigente? Os valores atuais dela são substituídos, em todos os cargos, e os funcionários com nível lançado são avisados. Não tem desfazer automático.`)
      },
  })
  const [estadoNova, acaoNova, pendenteNova] = useActionState(gerarTabelaComReajuste, {})
  const envioNova = useEnvioFormulario(acaoNova, estadoNova)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={formAction} {...envio} className="grid content-between gap-3 rounded-lg border p-4">
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Ajustar a tabela atual</h3>
          <p className="text-muted-foreground text-xs">
            Substitui os valores da tabela vigente. Os salários mudam na hora, e os valores anteriores não ficam guardados.
          </p>
        </div>
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="percentual" value={percentualTexto} />
        <Button type="submit" disabled={pendente || pendenteNova} variant="outline" className="justify-self-end">
          {pendente && <Loader2 className="animate-spin" />}
          Ajustar em {percentualTexto}%
        </Button>
      </form>

      <form action={acaoNova} {...envioNova} className="grid content-between gap-3 rounded-lg border p-4">
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Gerar nova tabela</h3>
          <p className="text-muted-foreground text-xs">
            Copia a tabela vigente com o percentual e guarda a atual. Nenhum salário muda até você tornar a nova tabela vigente.
          </p>
        </div>
        {estadoNova.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estadoNova.erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="percentual" value={percentualTexto} />
        <input type="hidden" name="tabela_id" value={tabelaId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="data_inicio">Início da vigência *</Label>
            <Input id="data_inicio" name="data_inicio" type="date" required className="[color-scheme:light] dark:[color-scheme:dark]" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data_fim">Término da vigência *</Label>
            <Input id="data_fim" name="data_fim" type="date" required className="[color-scheme:light] dark:[color-scheme:dark]" />
          </div>
        </div>
        <Button type="submit" disabled={pendente || pendenteNova || !tabelaId} className="justify-self-end">
          {pendenteNova && <Loader2 className="animate-spin" />}
          Gerar tabela com {percentualTexto}%
        </Button>
      </form>
    </div>
  )
}

"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { FONTES_DIVERGENCIA, type FonteDivergencia } from "@/lib/votacao-divergencias-fontes"

import { tratarDivergenciaAction } from "./actions"

type FichaOpcao = { id: string; rotulo: string; nomeDifere: boolean; nascimentoDifere: boolean }

/**
 * Tratar a divergência: acertar a ficha com o que o eleitor declarou (nome
 * e/ou nascimento) ou só dizer o que foi feito.
 */
export function TratarDivergencia({
  aptoId,
  fichas,
  nomeInformado,
  nascimentoInformado,
  sugestao,
}: {
  aptoId: string
  fichas: FichaOpcao[]
  nomeInformado: string | null
  nascimentoInformado: string | null
  /** O que a fila sugere quando duas fontes concordam (ou a ficha tem valor impossível). */
  sugestao: { nome: boolean; nascimento: boolean; fonte: FonteDivergencia | null; texto: string | null }
}) {
  const [estado, acao, pendente] = useActionState(tratarDivergenciaAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const primeira = fichas[0]
  // Só oferece trocar o que difere de alguma ficha.
  const podeNome = Boolean(nomeInformado) && fichas.some((f) => f.nomeDifere)
  const podeNascimento = Boolean(nascimentoInformado) && fichas.some((f) => f.nascimentoDifere)
  const id = (s: string) => `${s}_${aptoId}`

  return (
    <form action={acao} {...envio} className="grid gap-3 border-t pt-3">
      <input type="hidden" name="apto_id" value={aptoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {fichas.length > 1 && (
        <div className="grid gap-1.5">
          <Label htmlFor={id("ficha")}>Ficha a atualizar</Label>
          <select
            id={id("ficha")}
            name="ficha_id"
            defaultValue={primeira?.id}
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
          >
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>
      )}
      {fichas.length === 1 && <input type="hidden" name="ficha_id" value={primeira.id} />}
      {(podeNome || podeNascimento) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {podeNome && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="usar_nome" defaultChecked={sugestao.nome} />
              Usar na ficha o nome informado: <strong>{nomeInformado}</strong>
            </label>
          )}
          {podeNascimento && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="usar_nascimento"
                defaultChecked={sugestao.nascimento}
              />
              Usar na ficha o nascimento informado: <strong>{formatar(nascimentoInformado)}</strong>
            </label>
          )}
        </div>
      )}
      {sugestao.texto && <p className="text-success-fg text-xs">{sugestao.texto}</p>}
      {(podeNome || podeNascimento) && (
        <div className="grid gap-1.5">
          <Label htmlFor={id("fonte")}>Fonte (obrigatória para mudar a ficha)</Label>
          <select
            id={id("fonte")}
            name="fonte"
            defaultValue={sugestao.fonte ?? ""}
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
          >
            <option value="">Escolha de onde veio o dado…</option>
            {FONTES_DIVERGENCIA.map((f) => (
              <option key={f.chave} value={f.chave} title={f.ajuda}>
                {f.rotulo}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Sem documento: vale a fonte mais forte que houver. O prontuário guarda o valor anterior, o novo, a
            fonte e quem mudou.
          </p>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={id("obs")}>
          {podeNome || podeNascimento ? "Observação (opcional)" : "O que foi feito"}
        </Label>
        <Textarea
          id={id("obs")}
          name="observacao"
          rows={2}
          maxLength={500}
          placeholder="Ex.: a ficha já estava certa; a lista da empresa está com o nome de solteira; liguei para o filiado e conferi."
        />
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Registrar tratamento
        </Button>
      </div>
    </form>
  )
}

function formatar(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

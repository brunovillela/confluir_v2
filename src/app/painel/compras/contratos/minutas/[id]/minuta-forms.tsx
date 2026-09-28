"use client"

import { useActionState, useMemo, useState } from "react"
import { Loader2, Save, Sparkles, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { clausulasAusentes, pendenciasDaMinuta } from "@/lib/contratos-minutas-constantes"

import {
  ajustarMinutaAction,
  atualizarDadosMinutaAction,
  excluirMinutaAction,
  salvarTextoMinutaAction,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Texto da minuta (editável) + pedido de ajuste à IA. O ajuste parte do que
 * está NA TELA — edição não salva entra como versão antes do ajuste.
 */
export function EditorMinuta({
  id,
  texto: inicial,
  clausulasFixas,
  bloqueio = null,
}: {
  id: string
  texto: string
  /** Cláusulas fixas copiadas na criação da minuta. */
  clausulasFixas: { titulo: string; texto: string }[]
  /** Motivo da trava (em assinatura / assinada): o texto fica só leitura. */
  bloqueio?: string | null
}) {
  const [texto, setTexto] = useState(inicial)
  const [salvo, salvarAcao, salvando] = useActionState(salvarTextoMinutaAction, {})
  const [ajuste, ajustarAcao, ajustando] = useActionState(ajustarMinutaAction, {})
  const pendencias = useMemo(() => pendenciasDaMinuta(texto), [texto])
  const ausentes = useMemo(() => clausulasAusentes(texto, clausulasFixas), [texto, clausulasFixas])
  const alterado = texto !== inicial

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <form action={salvarAcao} className="grid content-start gap-2">
        <input type="hidden" name="id" value={id} />
        <Textarea
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          readOnly={Boolean(bloqueio)}
          className="min-h-[36rem] font-mono text-[13px] leading-relaxed [field-sizing:fixed]"
          aria-label="Texto da minuta"
        />
        {bloqueio ? (
          <p className="text-muted-foreground text-xs">{bloqueio}</p>
        ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={salvando || ajustando || !alterado}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar edição
          </Button>
          {alterado && !salvando && (
            <span className="text-warning-fg text-xs">Há alterações não salvas.</span>
          )}
          {salvo.ok && !alterado && <span className="text-success-fg text-xs">{salvo.ok}</span>}
          {salvo.erro && <span className="text-destructive text-xs">{salvo.erro}</span>}
        </div>
        )}
      </form>

      <div className="grid content-start gap-4">
        {clausulasFixas.length > 0 && (
          <div
            className={
              ausentes.length > 0
                ? "border-destructive/50 grid gap-2 rounded-lg border p-3"
                : "grid gap-2 rounded-lg border p-3"
            }
          >
            <p className="text-sm font-medium">
              Cláusulas fixas{" "}
              <span className="text-muted-foreground font-normal">
                ({clausulasFixas.length - ausentes.length}/{clausulasFixas.length} no texto)
              </span>
            </p>
            <ul className="grid gap-1 text-xs">
              {clausulasFixas.map((c, i) => {
                const falta = ausentes.some((a) => a.texto === c.texto)
                return (
                  <li key={i} className={falta ? "text-destructive" : "text-muted-foreground"}>
                    {falta ? "✗" : "✓"} {c.titulo}
                  </li>
                )
              })}
            </ul>
            {ausentes.length > 0 && (
              <p className="text-destructive text-xs">
                O texto de alguma cláusula fixa foi alterado ou removido. Peça à IA para reincluí-la
                literalmente, ou cole o texto de volta.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-2 rounded-lg border p-3">
          <p className="text-sm font-medium">
            A preencher{" "}
            <span className="text-muted-foreground font-normal">({pendencias.length})</span>
          </p>
          {pendencias.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nenhum “[PREENCHER]” no texto. Ainda assim, revise antes de assinar.
            </p>
          ) : (
            <ul className="text-muted-foreground grid max-h-60 gap-1 overflow-y-auto text-xs">
              {pendencias.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          )}
        </div>

        {!bloqueio && (
        <form action={ajustarAcao} className="grid gap-2 rounded-lg border p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="texto" value={texto} />
          <Label htmlFor="pedido" className="text-sm font-medium">
            Pedir ajuste à IA
          </Label>
          <Textarea
            id="pedido"
            name="pedido"
            rows={4}
            required
            placeholder="Ex.: incluir cláusula de LGPD; trocar o reajuste para INPC; o CNPJ da contratada é 12.345.678/0001-90; deixar mais curto."
          />
          {ajuste.erro && (
            <Alert variant="destructive">
              <AlertDescription>{ajuste.erro}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="outline" disabled={ajustando || salvando}>
            {ajustando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {ajustando ? "Ajustando…" : "Ajustar com IA"}
          </Button>
          <span className="text-muted-foreground text-xs">
            {ajustando
              ? "A IA reescreve a minuta inteira — pode levar até dois minutos."
              : "Cada ajuste vira uma versão; dá para voltar a qualquer uma."}
          </span>
        </form>
        )}
      </div>
    </div>
  )
}

export function DadosMinutaForm({
  id,
  titulo,
  contratoId,
  finalizada,
  contratos,
}: {
  id: string
  titulo: string
  contratoId: string | null
  finalizada: boolean
  contratos: { id: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(atualizarDadosMinutaAction, {})
  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" name="titulo" defaultValue={titulo} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contrato_id">Contrato vinculado</Label>
          <select id="contrato_id" name="contrato_id" defaultValue={contratoId ?? ""} className={SELECT}>
            <option value="">(nenhum)</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="finalizada"
          defaultChecked={finalizada}
          className="accent-primary mt-0.5 size-4"
        />
        <span>
          Finalizada — revisada e pronta para assinatura
          <span className="text-muted-foreground block text-xs">
            O PDF e o Word deixam de sair marcados como “MINUTA”.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar dados
        </Button>
        {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
        {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      </div>
    </form>
  )
}

export function ExcluirMinuta({ id }: { id: string }) {
  return (
    <form
      action={excluirMinutaAction}
      onSubmit={(e) => {
        if (!confirm("Excluir esta minuta e todas as versões?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
        <Trash2 />
        Excluir minuta
      </Button>
    </form>
  )
}

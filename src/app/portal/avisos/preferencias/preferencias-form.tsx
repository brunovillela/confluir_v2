"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { EVENTOS_PORTAL, type EventoPortal, type PreferenciasPortal } from "@/lib/portal-avisos-eventos"

import { salvarPreferenciasPortalAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * Um interruptor por tipo de aviso; o nome do campo é a chave do evento. O
 * mesmo interruptor vale para o e-mail e, quando há push, para o celular.
 * Tipo que nunca vai por e-mail (`semEmail`, como Notícias e convênios) só
 * aparece com o celular disponível — sem ele, o interruptor não mudaria nada.
 * Na visualização pela gestão os interruptores mexem, mas só o botão de
 * salvar fica desligado (contrato do AcaoVisualizacao).
 *
 * `ocultos`: tipos de parte desabilitada na Área do associado. Saem da tela,
 * mas a escolha de antes vai junto no envio (a ação grava ausente como
 * desligado) e vale de novo quando a parte voltar.
 */
export function PreferenciasForm({
  prefs,
  celular = false,
  preview = false,
  ocultos = [],
}: {
  prefs: PreferenciasPortal
  celular?: boolean
  preview?: boolean
  ocultos?: readonly EventoPortal[]
}) {
  const [estado, action, salvando] = useActionState(salvarPreferenciasPortalAction, {})
  const envio2 = useEnvioFormulario(action, estado)
  const eventos = EVENTOS_PORTAL.filter(
    (e) => (celular || !("semEmail" in e && e.semEmail)) && !ocultos.includes(e.chave)
  )
  const guardados = EVENTOS_PORTAL.filter((e) => ocultos.includes(e.chave) && prefs[e.chave])

  return (
    <form {...formVisualizacao(preview, action)} {...(preview ? {} : envio2)} className="grid gap-4">
      {guardados.map((e) => (
        <input key={e.chave} type="hidden" name={e.chave} value="on" />
      ))}
      <ul className="divide-y">
        {eventos.map((e) => {
          // O nome lido pelo leitor de tela diz por onde o aviso sai.
          const canal = "semEmail" in e && e.semEmail ? "Celular" : celular ? "E-mail e celular" : "E-mail"
          return (
            <li key={e.chave} className="flex min-h-14 items-center justify-between gap-4 py-3">
              <label htmlFor={`pref-${e.chave}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-sm font-medium">{e.rotulo}</span>
                <span className="text-muted-foreground block text-xs">{e.descricao}</span>
              </label>
              <Switch
                id={`pref-${e.chave}`}
                name={e.chave}
                defaultChecked={prefs[e.chave]}
                aria-label={`${canal}: ${e.rotulo}`}
              />
            </li>
          )
        })}
      </ul>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>Preferências salvas.</AlertDescription>
        </Alert>
      )}

      <div>
        <AcaoVisualizacao preview={preview} nota="Só o próprio associado salva as preferências dele.">
          <Button type="submit" disabled={salvando} className="min-h-11 w-full sm:w-auto">
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}

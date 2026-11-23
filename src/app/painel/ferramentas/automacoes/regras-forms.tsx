"use client"

import { useActionState, useState, useTransition } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { confirmar } from "@/components/ui/confirmacao"
import { type EstadoForm } from "@/lib/contas"
import {
  ACOES_POR_GATILHO,
  GATILHOS_REGRA,
  PARAMETRO_DA_ACAO,
  ROTULOS_ACAO,
  ROTULOS_GATILHO,
  type AcaoRegra,
  type GatilhoRegra,
} from "@/lib/ferramentas-regras"

import { alternarRegraAction, criarRegraAction, excluirRegraAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string }

/** Monta a regra como uma frase: Quando… Em… Então… (a pessoa ou a etiqueta, se a ação pedir). */
export function NovaRegra({ demandas, pessoas, etiquetas }: { demandas: Opcao[]; pessoas: Opcao[]; etiquetas: Opcao[] }) {
  const [gatilho, setGatilho] = useState<GatilhoRegra>("tarefa_atrasou")
  const [acao, setAcao] = useState<AcaoRegra>("prioridade_alta")
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(criarRegraAction, {})
  const acoes = ACOES_POR_GATILHO[gatilho]
  const acaoValida = acoes.includes(acao) ? acao : acoes[0]
  const parametro = PARAMETRO_DA_ACAO[acaoValida]
  return (
    <form action={enviar} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Quando</span>
          <select
            name="gatilho"
            value={gatilho}
            onChange={(e) => setGatilho(e.target.value as GatilhoRegra)}
            className={SELECT}
          >
            {GATILHOS_REGRA.map((g) => (
              <option key={g} value={g}>
                {ROTULOS_GATILHO[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Em</span>
          <select name="demanda_id" defaultValue="" className={SELECT}>
            <option value="">Qualquer demanda ou avulsa</option>
            {demandas.map((d) => (
              <option key={d.id} value={d.id}>
                Só na demanda: {d.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Então</span>
          <select name="acao" value={acaoValida} onChange={(e) => setAcao(e.target.value as AcaoRegra)} className={SELECT}>
            {acoes.map((a) => (
              <option key={a} value={a}>
                {ROTULOS_ACAO[a].charAt(0).toUpperCase() + ROTULOS_ACAO[a].slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {parametro === "pessoa" && (
        <label className="grid gap-1 text-sm md:max-w-sm">
          <span className="font-medium">Pessoa</span>
          <select name="pessoa_id" defaultValue="" required className={SELECT}>
            <option value="">Escolha…</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {parametro === "etiqueta" && (
        <label className="grid gap-1 text-sm md:max-w-sm">
          <span className="font-medium">Etiqueta</span>
          {etiquetas.length ? (
            <select name="etiqueta_id" defaultValue="" required className={SELECT}>
              <option value="">Escolha…</option>
              {etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground text-xs">Crie a etiqueta antes, em Tarefas → Etiquetas.</span>
          )}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar automação
        </Button>
        {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
        {estado.ok && <span className="text-success-fg text-sm">{estado.ok}</span>}
      </div>
    </form>
  )
}

/** Liga/desliga e exclui uma automação. */
export function AcoesRegra({ id, ativa, frase }: { id: string; ativa: boolean; frase: string }) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={ativa}
        disabled={pendente}
        aria-label={ativa ? "Desligar a automação" : "Ligar a automação"}
        onCheckedChange={(v) =>
          iniciar(async () => {
            const r = await alternarRegraAction(id, v)
            setErro(r.erro ?? null)
          })
        }
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive size-8"
        aria-label="Excluir a automação"
        disabled={pendente}
        onClick={async () => {
          if (!(await confirmar({ titulo: "Excluir a automação?", descricao: frase, confirmar: "Excluir", destrutivo: true }))) return
          iniciar(async () => {
            const r = await excluirRegraAction(id)
            setErro(r.erro ?? null)
          })
        }}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </span>
  )
}

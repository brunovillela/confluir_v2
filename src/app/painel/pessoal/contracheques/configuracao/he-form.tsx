"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { type EstadoForm } from "@/lib/contas"
import type { FaixasHE } from "@/lib/faixas-he"
import type { ReferenciaHoras, RubricaHE } from "@/lib/ponto-horas-pagas"

import { salvarConfigHEAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Linha = { codigo: string; descricao: string; faixa: 1 | 2; tipo: "horas" | "valor" }
const vazia = (): Linha => ({ codigo: "", descricao: "", faixa: 1, tipo: "horas" })

/**
 * Rubricas de hora extra do contracheque da entidade e o que a IA pode ver
 * (Ponto, Fase 2 — 28/11/2026). As sugestões vêm da leitura local de uma
 * remessa (só código e descrição).
 */
export function ConfigHEForm({
  config,
  faixas,
  sugestoes,
}: {
  config: { rubricas: RubricaHE[]; referencia: ReferenciaHoras; iaLinhas: boolean; lerImagem: boolean }
  faixas: FaixasHE
  sugestoes: { codigo: string | null; descricao: string; contracheques: number }[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(salvarConfigHEAction, {})
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    config.rubricas.length
      ? config.rubricas.map((r) => ({ codigo: r.codigo ?? "", descricao: r.descricao ?? "", faixa: r.faixa, tipo: r.tipo }))
      : [vazia()]
  )
  const [lerImagem, setLerImagem] = useState(config.lerImagem)
  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const jaTem = (s: { codigo: string | null; descricao: string }) =>
    linhas.some((l) => (s.codigo && l.codigo === s.codigo) || l.descricao.toUpperCase() === s.descricao.toUpperCase())

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="rubricas" value={JSON.stringify(linhas)} />

      <div className="grid gap-2">
        <div className="text-sm font-medium">Rubricas de hora extra</div>
        <p className="text-muted-foreground text-xs">
          Como aparecem no contracheque: o código, a descrição ou os dois (com o código, a descrição impressa pode variar).
          &quot;Só valor&quot; soma o valor sem contar horas — por exemplo, o DSR sobre horas extras.
        </p>
        <div className="grid gap-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Código"
                placeholder="Código"
                value={l.codigo}
                onChange={(e) => muda(i, { codigo: e.target.value })}
                className="w-24"
              />
              <Input
                aria-label="Descrição"
                placeholder="Descrição (ex.: HORAS EXTRAS 50%)"
                value={l.descricao}
                onChange={(e) => muda(i, { descricao: e.target.value })}
                className="min-w-48 flex-1"
              />
              <select aria-label="Faixa" className={SELECT} value={l.faixa} onChange={(e) => muda(i, { faixa: e.target.value === "2" ? 2 : 1 })}>
                <option value={1}>Faixa 1 ({faixas["70"]})</option>
                <option value={2}>Faixa 2 ({faixas["100"]})</option>
              </select>
              <select aria-label="Conta" className={SELECT} value={l.tipo} onChange={(e) => muda(i, { tipo: e.target.value === "valor" ? "valor" : "horas" })}>
                <option value="horas">Horas e valor</option>
                <option value="valor">Só valor</option>
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label="Remover rubrica" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, vazia()])}>
            <Plus />
            Rubrica
          </Button>
        </div>
      </div>

      {sugestoes.length > 0 && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="text-sm font-medium">Encontradas nos contracheques</div>
          <ul className="grid gap-1 text-sm">
            {sugestoes.map((s) => (
              <li key={`${s.codigo}|${s.descricao}`} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{s.codigo ?? "—"}</span>
                <span>{s.descricao}</span>
                <span className="text-muted-foreground text-xs">em {s.contracheques} contracheque(s)</span>
                {jaTem(s) ? (
                  <span className="text-muted-foreground text-xs">· na lista</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLinhas((ls) => [
                        ...ls.filter((l) => l.codigo || l.descricao),
                        { codigo: s.codigo ?? "", descricao: s.descricao, faixa: /100/.test(s.descricao) ? 2 : 1, tipo: /DSR|REFLEXO/.test(s.descricao) ? "valor" : "horas" },
                      ])
                    }
                  >
                    <Plus />
                    Adicionar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">Confira a faixa de cada uma antes de salvar.</p>
        </div>
      )}

      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">Como a referência das horas vem impressa</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="referencia" value="decimal" defaultChecked={config.referencia === "decimal"} />
          Decimal: 10,50 = 10 horas e meia
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="referencia" value="hhmm" defaultChecked={config.referencia === "hhmm"} />
          Horas e minutos: 10,30 = 10 horas e 30 minutos
        </label>
        <span className="text-muted-foreground text-xs">&quot;10:30&quot; vale nos dois casos.</span>
      </fieldset>

      <label className="flex items-start gap-3">
        <Switch name="ia_linhas" defaultChecked={config.iaLinhas} className="mt-0.5" />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Deixar a IA interpretar as linhas que o texto não resolve</span>
          <span className="text-muted-foreground text-xs">
            Só quando você pede, na tela das horas pagas. Vai ao provedor de IA apenas o trecho da linha de hora extra
            (código, descrição, horas e valor), sem nome, CPF nem qualquer outra linha do contracheque.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <Switch name="ler_imagem" checked={lerImagem} onCheckedChange={setLerImagem} className="mt-0.5" />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Ler por imagem os contracheques escaneados</span>
          <span className="text-muted-foreground text-xs">
            Para PDF sem texto (digitalizado). Atenção: aqui vai ao provedor de IA o contracheque INTEIRO — nome, CPF,
            salário, todos os proventos e descontos (inclusive pensão, empréstimos e plano de saúde). O provedor não guarda
            o arquivo, mas o dado sai da entidade. Prefira pedir à contabilidade o PDF gerado pelo sistema da folha, que
            tem texto e é lido aqui sem IA.
          </span>
        </span>
      </label>
      {lerImagem && !config.lerImagem && (
        <Alert variant="warning">
          <AlertDescription>
            Ao salvar, a leitura por imagem fica disponível na tela das horas pagas — e cada uso manda o contracheque
            inteiro da pessoa à IA.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

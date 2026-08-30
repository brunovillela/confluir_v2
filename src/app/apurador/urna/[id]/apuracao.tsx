"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ApuracaoUrnaDados } from "@/lib/db/votacao-apuracao"

import {
  concluirApuracaoAction,
  iniciarApuracaoAction,
  salvarContagemAction,
} from "../../actions"

function valorAtual(
  dados: ApuracaoUrnaDados,
  perguntaId: string,
  alvo: string,
  tipo: "opcao" | "branco" | "nulo"
): number {
  const c = dados.contagem.find(
    (x) =>
      x.perguntaId === perguntaId &&
      x.tipo === tipo &&
      (tipo === "opcao" ? x.opcaoId === alvo : true)
  )
  return c?.quantidade ?? 0
}

export function ApuracaoUrna({ dados }: { dados: ApuracaoUrnaDados }) {
  const [estIniciar, actIniciar, pendIniciar] = useActionState(
    iniciarApuracaoAction,
    {}
  )
  const [estSalvar, actSalvar, pendSalvar] = useActionState(
    salvarContagemAction,
    {}
  )
  const [estConcluir, actConcluir, pendConcluir] = useActionState(
    concluirApuracaoAction,
    {}
  )

  const concluida = dados.sessao.status === "concluida"
  const iniciada = dados.sessao.status !== "nao_iniciada"

  return (
    <div className="grid gap-5">
      {/* Lacres recebidos */}
      <div className="grid gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4" />
          Lacres recebidos com a urna
        </p>
        {dados.lacres.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nenhum lacre registrado para esta urna.
          </p>
        ) : (
          <div className="grid gap-1">
            {dados.lacres.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline">
                  {l.tipo === "boca" ? "Boca" : "Principal"}
                </Badge>
                <span className="font-mono">nº {l.numero ?? "—"}</span>
                <span className="text-muted-foreground">
                  {l.evento === "rompido" ? "rompido" : "instalado"}
                </span>
                {l.guardadoNaUrna && (
                  <span className="text-muted-foreground">· guardado na urna</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Atestar integridade + iniciar */}
        {!iniciada && (
          <form action={actIniciar} className="mt-2 grid gap-2 border-t pt-3">
            <input type="hidden" name="urna_id" value={dados.urnaId} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="lacres_ok" className="mt-0.5 size-4" />
              <span>
                Atesto que <strong>recebi a urna com os lacres íntegros</strong>,
                conforme registrado, e que os lacres rompidos estão dentro da urna.
              </span>
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="lacres-obs">Observação (opcional)</Label>
              <Input id="lacres-obs" name="lacres_observacao" />
            </div>
            {estIniciar.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estIniciar.erro}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="submit" size="sm" disabled={pendIniciar}>
                {pendIniciar && <Loader2 className="animate-spin" />}
                Abrir urna e iniciar apuração
              </Button>
            </div>
          </form>
        )}
        {iniciada && (
          <Alert
            className={
              dados.sessao.lacresOk
                ? "border-success/40 text-success-fg mt-2"
                : "mt-2"
            }
            variant={dados.sessao.lacresOk ? "default" : "warning"}
          >
            <AlertDescription>
              {dados.sessao.lacresOk
                ? "Integridade dos lacres atestada."
                : "Apuração iniciada com ressalva sobre os lacres."}
              {dados.sessao.lacresObservacao
                ? ` — ${dados.sessao.lacresObservacao}`
                : ""}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Contagem */}
      {iniciada && !concluida && (
        <form action={actSalvar} className="grid gap-5">
          <input type="hidden" name="urna_id" value={dados.urnaId} />
          {dados.perguntas.map((p, i) => (
            <div key={p.id} className="grid gap-2 rounded-lg border p-4">
              <p className="text-sm font-medium">
                {i + 1}. {p.pergunta ?? "Pergunta"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {p.opcoes.map((o) => (
                  <div key={o.id} className="grid gap-1.5">
                    <Label htmlFor={`c-${p.id}-${o.id}`}>{o.texto ?? "(opção)"}</Label>
                    <Input
                      id={`c-${p.id}-${o.id}`}
                      name={`c_${p.id}__${o.id}`}
                      inputMode="numeric"
                      defaultValue={valorAtual(dados, p.id, o.id, "opcao")}
                    />
                  </div>
                ))}
                <div className="grid gap-1.5">
                  <Label htmlFor={`c-${p.id}-branco`}>Branco</Label>
                  <Input
                    id={`c-${p.id}-branco`}
                    name={`c_${p.id}__branco`}
                    inputMode="numeric"
                    defaultValue={valorAtual(dados, p.id, "branco", "branco")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`c-${p.id}-nulo`}>Nulo</Label>
                  <Input
                    id={`c-${p.id}-nulo`}
                    name={`c_${p.id}__nulo`}
                    inputMode="numeric"
                    defaultValue={valorAtual(dados, p.id, "nulo", "nulo")}
                  />
                </div>
              </div>
            </div>
          ))}
          {estSalvar.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estSalvar.erro}</AlertDescription>
            </Alert>
          )}
          {estSalvar.ok && (
            <Alert className="border-success/40 text-success-fg">
              <CheckCircle2 className="size-4" />
              <AlertDescription>{estSalvar.ok}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button type="submit" disabled={pendSalvar}>
              {pendSalvar && <Loader2 className="animate-spin" />}
              Salvar contagem
            </Button>
          </div>
        </form>
      )}

      {/* Concluir */}
      {iniciada && !concluida && (
        <form action={actConcluir}>
          <input type="hidden" name="urna_id" value={dados.urnaId} />
          {estConcluir.erro && (
            <Alert variant="destructive" className="mb-2">
              <AlertDescription>{estConcluir.erro}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            variant="outline"
            disabled={pendConcluir}
            onClick={(e) => {
              if (!confirm("Concluir a apuração desta urna? Salve a contagem antes.")) {
                e.preventDefault()
              }
            }}
          >
            {pendConcluir ? <Loader2 className="animate-spin" /> : <Lock />}
            Concluir apuração da urna
          </Button>
        </form>
      )}

      {concluida && (
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Apuração desta urna <strong>concluída</strong>. Os números entram no
            resultado final da assembleia.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

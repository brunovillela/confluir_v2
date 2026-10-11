"use client"

import { useActionState, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import type { CampanhaPublica } from "@/lib/db/oposicao"
import { formatarData } from "@/lib/formato"

import { confirmarOposicao, desistir } from "../actions"

/** Extrai o id do YouTube de um id cru ou URL. */
function idYoutube(v: string | null): string | null {
  if (!v) return null
  const s = v.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  return m ? m[1] : null
}

export function OposicaoFlow({
  campanha,
  videoUrl,
  videoTempo,
}: {
  campanha: CampanhaPublica
  videoUrl: string | null
  videoTempo: number | null
}) {
  const minimo = videoTempo && videoTempo > 0 ? videoTempo : 0
  const [restante, setRestante] = useState(minimo)
  const [etapa, setEtapa] = useState<"video" | "form">(
    minimo > 0 || videoUrl ? "video" : "form"
  )
  const [estado, formAction, pendente] = useActionState(confirmarOposicao, {})
  const [estDesistir, desistirAction, pendDesistir] = useActionState(desistir, {})

  useEffect(() => {
    if (etapa !== "video" || restante <= 0) return
    const t = setInterval(() => setRestante((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [etapa, restante])

  const embed = idYoutube(videoUrl)

  if (etapa === "video") {
    return (
      <div className="grid gap-4">
        {embed ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg border">
            <iframe
              src={`https://www.youtube.com/embed/${embed}`}
              title="Vídeo de sensibilização"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : videoUrl ? (
          <Alert>
            <AlertDescription>
              Assista ao vídeo:{" "}
              <a
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                abrir vídeo
              </a>
            </AlertDescription>
          </Alert>
        ) : null}

        {restante > 0 && (
          <p className="text-muted-foreground text-center text-sm">
            Aguarde {restante}s para prosseguir…
          </p>
        )}

        {estDesistir.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estDesistir.erro}</AlertDescription>
          </Alert>
        )}

        {/* O primário vem sozinho; "não quero me opor" fica embaixo, discreto
            e com confirmação — lado a lado, parecia um "voltar" (A14). O
            espaço de 12px impede que as áreas de toque dos dois se encostem. */}
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Button
            type="button"
            disabled={restante > 0}
            onClick={() => setEtapa("form")}
          >
            Prosseguir com a oposição
          </Button>
          <form
            action={desistirAction}
            onSubmit={(e) =>
              confirmarEnvio(e, {
                titulo: "Seguir sem registrar oposição?",
                descricao: `Nenhuma oposição será registrada agora. Enquanto o prazo estiver aberto${
                  campanha.prazo_fim ? ` (até ${formatarData(campanha.prazo_fim)})` : ""
                }, você pode voltar e registrar a sua oposição.`,
                confirmar: "Não quero me opor",
                cancelar: "Voltar",
                destrutivo: false,
              })
            }
          >
            <input type="hidden" name="campanha_id" value={campanha.id} />
            <Button
              type="submit"
              variant="ghost"
              disabled={pendDesistir}
              className="text-muted-foreground"
            >
              {pendDesistir && <Loader2 className="animate-spin" />}
              Não quero me opor
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="campanha_id" value={campanha.id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {campanha.fontes.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="empregador_id">Sua fonte pagadora</Label>
          <SelectNativo id="empregador_id" name="empregador_id" required defaultValue="">
            <option value="" disabled>
              Selecione…
            </option>
            {campanha.fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="matricula">Matrícula (se souber)</Label>
        <Input id="matricula" name="matricula" autoComplete="off" className="w-48" />
      </div>

      {campanha.perguntas.length > 0 && (
        <div className="grid gap-4">
          <p className="text-sm font-medium">Questionário</p>
          {campanha.perguntas.map((p, i) => (
            <div key={p.id} className="grid gap-1.5">
              <Label htmlFor={`p_${p.id}`}>
                {i + 1}. {p.pergunta}
              </Label>
              <Textarea id={`p_${p.id}`} name={`pergunta_${p.id}`} rows={2} />
            </div>
          ))}
        </div>
      )}

      {campanha.texto_declaracao && (
        <div className="bg-muted/40 rounded-md border p-4 text-sm whitespace-pre-wrap">
          {campanha.texto_declaracao}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="declaracao"
          required
          className="mt-0.5 size-4"
        />
        Li e concordo com a declaração acima e confirmo a minha oposição.
      </label>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Confirmar oposição
        </Button>
      </div>
    </form>
  )
}

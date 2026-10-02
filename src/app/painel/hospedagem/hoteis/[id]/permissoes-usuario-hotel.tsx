"use client"

import { useActionState, useState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  AREAS_HOTEL,
  nivelNaArea,
  PERFIS_HOTEL,
  type ChaveAreaHotel,
  type NivelHotel,
  type PermissoesHotel,
} from "@/lib/hotel-permissoes"
import { cn } from "@/lib/utils"

import { salvarPermissoesUsuarioHotel } from "../actions"

type Escolha = "" | NivelHotel

/**
 * Permissões do usuário do hotel por área — "Sem acesso", "Ver" ou "Editar",
 * como no painel administrativo. Os atalhos preenchem a grade; nada é salvo
 * até "Salvar permissões". Áreas de outro convênio aparecem esmaecidas: não
 * estão no menu deste hotel, mas a escolha vale se o convênio mudar.
 */
export function PermissoesUsuarioHotel({
  id,
  permissoes,
  garantida,
}: {
  id: string
  permissoes: PermissoesHotel
  garantida: boolean
}) {
  const [estado, acao, pendente] = useActionState(salvarPermissoesUsuarioHotel, {})
  const inicial = Object.fromEntries(
    AREAS_HOTEL.map((a) => [a.chave, (nivelNaArea(permissoes, a.chave) ?? "") as Escolha])
  ) as Record<ChaveAreaHotel, Escolha>
  const [grade, setGrade] = useState(inicial)

  function aplicarPerfil(p: Partial<Record<ChaveAreaHotel, NivelHotel>>) {
    setGrade(Object.fromEntries(AREAS_HOTEL.map((a) => [a.chave, p[a.chave] ?? ""])) as Record<ChaveAreaHotel, Escolha>)
  }

  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Atalhos:</span>
        {PERFIS_HOTEL.map((p) => (
          <Button
            key={p.nome}
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            title={p.descricao}
            onClick={() => aplicarPerfil(p.permissoes)}
          >
            {p.nome}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => aplicarPerfil({})}>
          Limpar
        </Button>
      </div>

      <div className="grid gap-1">
        {AREAS_HOTEL.map((a) => {
          const foraDoConvenio = a.em !== "ambos" && a.em !== (garantida ? "garantida" : "uso")
          const opcoes: { valor: Escolha; rotulo: string }[] = [
            { valor: "", rotulo: "Sem acesso" },
            { valor: "ver", rotulo: "Ver" },
            ...(a.temEdicao ? [{ valor: "editar" as Escolha, rotulo: "Editar" }] : []),
          ]
          return (
            <div
              key={a.chave}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5",
                foraDoConvenio ? "opacity-50" : "hover:bg-muted/50"
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="text-muted-foreground text-xs">
                  {a.descricao}
                  {foraDoConvenio ? " · não existe no convênio deste hotel" : ""}
                </p>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={`Acesso a ${a.titulo}`}>
                {opcoes.map((o) => (
                  <label
                    key={o.valor || "nenhum"}
                    className={cn(
                      "cursor-pointer rounded-md border px-2.5 py-1 text-xs select-none",
                      grade[a.chave] === o.valor
                        ? "border-primary bg-primary/10 text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name={`area_${a.chave}`}
                      value={o.valor}
                      checked={grade[a.chave] === o.valor}
                      onChange={() => setGrade((g) => ({ ...g, [a.chave]: o.valor }))}
                      className="sr-only"
                    />
                    {o.rotulo}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">Início e Ajuda ficam sempre liberados.</p>

      {(estado.erro || estado.ok) && (
        <Alert variant={estado.erro ? "destructive" : undefined} className={estado.ok ? "border-success/40 text-success-fg" : undefined}>
          <AlertDescription>{estado.erro ?? estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar permissões
        </Button>
      </div>
    </form>
  )
}

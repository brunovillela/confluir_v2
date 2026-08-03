"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Link2, Link2Off, Loader2, UserCheck, X } from "lucide-react"

import {
  FiliadoPicker,
  type SugestaoFiliado,
} from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { vincularFiliadoCatAction } from "./actions"

const ENDPOINT = "/painel/saude/cat/busca-filiado"

function docCurto(f: SugestaoFiliado): string {
  const partes: string[] = []
  if (f.cpf) partes.push(`CPF ${f.cpf.replace(/\D/g, "")}`)
  if (f.matricula_sindical) partes.push(`mat. ${f.matricula_sindical}`)
  return partes.join(" · ")
}

/**
 * Vínculo da CAT com um filiado. Como a base migrada quase não tem CPF, o
 * vínculo é manual e com confirmação humana. Quando a CAT traz o CPF, as
 * filiações ativas com aquele CPF são oferecidas como atalho.
 */
export function VincularFiliado({
  catId,
  atual,
  sugestoesCpf,
}: {
  catId: string
  atual: SugestaoFiliado | null
  sugestoesCpf: SugestaoFiliado[]
}) {
  const [estado, formAction, pendente] = useActionState(
    vincularFiliadoCatAction,
    {}
  )
  // O modo "trocar" é reiniciado pela `key` no servidor ao mudar o vínculo.
  const [trocando, setTrocando] = useState(false)

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {atual && !trocando ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm">
            <Link
              href={`/painel/filiados/${atual.id}`}
              className="text-primary font-medium hover:underline"
            >
              {atual.nome_completo ?? "(sem nome)"}
            </Link>
            {docCurto(atual) && (
              <span className="text-muted-foreground"> — {docCurto(atual)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTrocando(true)}
            >
              Alterar
            </Button>
            <form action={formAction}>
              <input type="hidden" name="id" value={catId} />
              <input type="hidden" name="filiado_id" value="" />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pendente}
              >
                {pendente ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Link2Off />
                )}
                Desvincular
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {!atual && (
            <p className="text-muted-foreground text-sm">
              Nenhum filiado vinculado a esta CAT.
            </p>
          )}

          {sugestoesCpf.length > 0 && (
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs">
                {sugestoesCpf.length === 1
                  ? "Filiação com o mesmo CPF da CAT:"
                  : "Filiações com o mesmo CPF da CAT:"}
              </p>
              {sugestoesCpf.map((s) => (
                <form
                  key={s.id}
                  action={formAction}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <input type="hidden" name="id" value={catId} />
                  <input type="hidden" name="filiado_id" value={s.id} />
                  <span className="min-w-0">
                    <span className="font-medium">
                      {s.nome_completo ?? "(sem nome)"}
                    </span>
                    {docCurto(s) && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {docCurto(s)}
                      </span>
                    )}
                  </span>
                  <Button type="submit" size="sm" disabled={pendente}>
                    <UserCheck />
                    Vincular
                  </Button>
                </form>
              ))}
            </div>
          )}

          <form action={formAction} className="grid gap-2 sm:max-w-md">
            <input type="hidden" name="id" value={catId} />
            <FiliadoPicker
              endpoint={ENDPOINT}
              inicial={trocando ? atual : null}
              placeholder="Busque o filiado por nome, CPF ou matrícula"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
                {trocando ? "Salvar vínculo" : "Vincular filiado"}
              </Button>
              {trocando && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTrocando(false)}
                >
                  <X />
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  )
}

"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { PreferenciasAviso } from "@/lib/db/avisos"
import { EVENTOS_TELEGRAM, type GrupoEvento } from "@/lib/telegram-eventos"

import { salvarPreferenciasAvisoAction } from "./actions"

const GRUPOS: { grupo: GrupoEvento; titulo: string; nota: string }[] = [
  {
    grupo: "notificacao",
    titulo: "Notificações sobre você",
    nota: "Também ficam no sino do painel, como histórico.",
  },
  {
    grupo: "pendencia",
    titulo: "Quando chega uma pendência para você",
    nota: "Não vão para o sino: a caixa de entrada do painel já mostra — e some quando é resolvida.",
  },
  {
    grupo: "resumo",
    titulo: "Lembrete e resumos",
    nota: "Só por e-mail, Telegram e celular.",
  },
]

/** Linha por evento, agrupada pelo tipo, uma coluna por canal (e-mail e Telegram). */
export function AvisosForm({
  prefs,
  temEmail,
  telegramAtivo,
}: {
  prefs: PreferenciasAviso
  temEmail: boolean
  telegramAtivo: boolean
}) {
  const [estado, action, salvando] = useActionState(salvarPreferenciasAvisoAction, {})

  return (
    <form action={action} className="grid gap-4">
      {!telegramAtivo && (
        <p className="text-muted-foreground text-sm">
          O Telegram só entrega depois de{" "}
          <Link href="/painel/perfil/telegram" className="underline underline-offset-4">
            vincular o bot e confirmar o telefone
          </Link>
          . As escolhas ficam guardadas para quando isso acontecer.
        </p>
      )}
      {!temEmail && (
        <p className="text-muted-foreground text-sm">
          Sua conta não tem e-mail cadastrado — peça à gestão para incluir.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="py-2 pr-2 font-medium">Aviso</th>
              <th className="w-20 py-2 text-center font-medium">E-mail</th>
              <th className="w-20 py-2 text-center font-medium">Telegram</th>
            </tr>
          </thead>
          {GRUPOS.map((g) => (
          <tbody key={g.grupo}>
            <tr>
              <td colSpan={3} className="pt-4 pb-1">
                <span className="block text-sm font-semibold">{g.titulo}</span>
                <span className="text-muted-foreground block text-xs">{g.nota}</span>
              </td>
            </tr>
            {EVENTOS_TELEGRAM.filter((e) => e.grupo === g.grupo).map(({ chave, rotulo }) => (
              <tr key={chave} className="border-b last:border-0">
                <td className="py-2 pr-2">
                  <label htmlFor={`email-${chave}`}>{rotulo}</label>
                </td>
                <td className="py-2 text-center">
                  <Checkbox
                    id={`email-${chave}`}
                    name={`email:${chave}`}
                    defaultChecked={prefs.email[chave]}
                    aria-label={`E-mail: ${rotulo}`}
                  />
                </td>
                <td className="py-2 text-center">
                  <Checkbox
                    name={`telegram:${chave}`}
                    defaultChecked={prefs.telegram[chave]}
                    aria-label={`Telegram: ${rotulo}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          ))}
        </table>
      </div>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Preferências salvas.</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="sm" disabled={salvando} className="w-fit">
        {salvando ? <Loader2 className="animate-spin" /> : <Save />}
        Salvar preferências
      </Button>
    </form>
  )
}

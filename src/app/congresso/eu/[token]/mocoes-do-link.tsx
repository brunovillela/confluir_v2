"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckCircle2, Plus } from "lucide-react"

import { LeitorQr } from "@/components/leitor-qr"
import { Button } from "@/components/ui/button"
import { lerCodigoMocao } from "@/lib/congressos/mocoes"
import { CHAVE_LINK } from "@/app/congresso/mocao/[codigo]/abrir-com-meu-link"

/** Guarda o link pessoal neste aparelho, para o QR de uma moção abrir direto na tela de assinar. */
export function GuardarLink({ token }: { token: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_LINK, token)
    } catch {
      // Navegação privada ou armazenamento bloqueado: o QR da moção explica o caminho.
    }
  }, [token])
  return null
}

type Item = { id: string; numero: number; codigo: string; titulo: string; tipo: string | null; situacao: string; minha: boolean; assinei: boolean; total: number }

export function MocoesDoLink({ token, mocoes, podeApresentar }: { token: string; mocoes: Item[]; podeApresentar: boolean }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const emColeta = mocoes.filter((m) => m.situacao === "coleta")
  const outras = mocoes.filter((m) => m.situacao !== "coleta")
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <LeitorQr
          rotulo="Ler QR de moção"
          aoLer={(t) => {
            const c = lerCodigoMocao(t)
            if (!c) return setErro("Esse QR não é de uma moção.")
            setErro(null)
            router.push(`/congresso/eu/${token}/mocao/${c}`)
          }}
        />
        {podeApresentar && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/congresso/eu/${token}/mocoes/nova`}>
              <Plus />
              Apresentar moção
            </Link>
          </Button>
        )}
      </div>
      {erro && <p className="text-destructive">{erro}</p>}
      {emColeta.length === 0 && outras.length === 0 && <p className="text-muted-foreground">Nenhuma moção ainda.</p>}
      {emColeta.map((m) => (
        <Link key={m.id} href={`/congresso/eu/${token}/mocao/${m.codigo}`} className="hover:bg-muted flex items-center gap-2 rounded-md border p-3">
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              {m.numero}. {m.titulo}
            </span>
            <span className="text-muted-foreground block text-xs">
              {m.tipo ? `${m.tipo} · ` : ""}
              {m.total} assinatura(s){m.minha ? " · apresentada por você" : ""}
            </span>
          </span>
          {m.assinei ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              assinada
            </span>
          ) : (
            <span className="text-primary shrink-0 text-xs font-medium">Ler e assinar</span>
          )}
        </Link>
      ))}
      {outras.length > 0 && (
        <details>
          <summary className="text-muted-foreground cursor-pointer text-xs">Encerradas ({outras.length})</summary>
          <ul className="mt-2 grid gap-1">
            {outras.map((m) => (
              <li key={m.id}>
                <Link href={`/congresso/eu/${token}/mocao/${m.codigo}`} className="hover:underline">
                  {m.numero}. {m.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

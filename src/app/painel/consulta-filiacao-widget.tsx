"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"

import { Input } from "@/components/ui/input"

import { CondicaoBadge } from "./filiados/condicao-badge"

type Resultado = {
  nome: string | null
  matricula: string | null
  cpfMascarado: string | null
  condicao: string | null
}

/**
 * Consulta básica de filiação: informa a condição do filiado sem abrir o
 * cadastro. Busca por nome (composto), CPF ou matrícula com 3+ caracteres.
 */
export function ConsultaFiliacao() {
  const [termo, setTermo] = useState("")
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef<AbortController | null>(null)

  function aoDigitar(valor: string) {
    setTermo(valor)
    if (timer.current) clearTimeout(timer.current)
    requisicao.current?.abort()

    const q = valor.trim()
    if (q.length < 3) {
      setResultados(null)
      setCarregando(false)
      return
    }
    setCarregando(true)
    timer.current = setTimeout(async () => {
      const controlador = new AbortController()
      requisicao.current = controlador
      try {
        const r = await fetch(
          `/painel/consulta-filiacao?q=${encodeURIComponent(q)}`,
          { signal: controlador.signal }
        )
        const { resultados: res } = (await r.json()) as {
          resultados: Resultado[]
        }
        setResultados(res)
        setCarregando(false)
      } catch {
        // digitação substituiu a requisição
      }
    }, 300)
  }

  useEffect(() => {
    const req = requisicao
    const t = timer
    return () => {
      if (t.current) clearTimeout(t.current)
      req.current?.abort()
    }
  }, [])

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        {carregando && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
        )}
        <Input
          value={termo}
          onChange={(e) => aoDigitar(e.target.value)}
          placeholder="Nome, CPF ou matrícula"
          className="pl-8"
          aria-label="Consultar condição de filiação"
        />
      </div>
      {resultados !== null &&
        (resultados.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum filiado encontrado para “{termo.trim()}”.
          </p>
        ) : (
          <ul className="grid gap-2">
            {resultados.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {r.nome ?? "(sem nome)"}
                  </span>
                  <span className="text-muted-foreground block truncate font-mono text-xs">
                    {[r.cpfMascarado, r.matricula && `mat. ${r.matricula}`]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </span>
                <CondicaoBadge condicao={r.condicao} />
              </li>
            ))}
          </ul>
        ))}
      {resultados === null && (
        <p className="text-muted-foreground text-xs">
          Digite 3 ou mais caracteres — a consulta informa apenas a condição
          da filiação.
        </p>
      )}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { formatarCpf } from "@/lib/cpf"

import { CondicaoBadge } from "./condicao-badge"

type Sugestao = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_condicao: string | null
}

/**
 * Busca rápida do dashboard: com 3+ caracteres consulta /painel/filiados/busca
 * (nome composto, CPF ou matrícula) e lista sugestões; Enter abre a lista
 * completa com o termo aplicado.
 */
export function BuscaRapida() {
  const router = useRouter()
  const [termo, setTermo] = useState("")
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef<AbortController | null>(null)

  function aoDigitar(valor: string) {
    setTermo(valor)
    if (timer.current) clearTimeout(timer.current)
    requisicao.current?.abort()

    const q = valor.trim()
    if (q.length < 3) {
      setSugestoes([])
      setAberto(false)
      setCarregando(false)
      return
    }
    setCarregando(true)
    timer.current = setTimeout(async () => {
      const controlador = new AbortController()
      requisicao.current = controlador
      try {
        const r = await fetch(
          `/painel/filiados/busca?q=${encodeURIComponent(q)}`,
          { signal: controlador.signal }
        )
        const { sugestoes: s } = (await r.json()) as { sugestoes: Sugestao[] }
        setSugestoes(s)
        setAberto(true)
        setCarregando(false)
      } catch {
        // requisição substituída por outra digitação
      }
    }, 300)
  }

  // Cancela debounce/fetch pendentes ao desmontar
  useEffect(() => {
    const req = requisicao
    const t = timer
    return () => {
      if (t.current) clearTimeout(t.current)
      req.current?.abort()
    }
  }, [])

  // Fecha ao clicar fora
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", aoClicar)
    return () => document.removeEventListener("mousedown", aoClicar)
  }, [])

  const urlListaCompleta = `/painel/filiados/lista?busca=${encodeURIComponent(termo.trim())}`

  return (
    <div ref={caixa} className="relative w-full sm:max-w-md">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      {carregando && (
        <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
      )}
      <Input
        value={termo}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && termo.trim()) router.push(urlListaCompleta)
          if (e.key === "Escape") setAberto(false)
        }}
        placeholder="Busca rápida: nome, CPF ou matrícula"
        className="pl-8"
        aria-label="Busca rápida de filiados"
        role="combobox"
        aria-expanded={aberto}
      />
      {aberto && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          {sugestoes.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2.5 text-sm">
              Nenhum filiado encontrado para “{termo.trim()}”.
            </p>
          ) : (
            <ul>
              {sugestoes.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/painel/filiados/${s.id}`)}
                    className="hover:bg-muted/60 flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.nome_completo ?? "(sem nome)"}
                    </span>
                    <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
                      {s.cpf ? formatarCpf(s.cpf) : ""}
                      {s.matricula_sindical && <> · {s.matricula_sindical}</>}
                    </span>
                    <CondicaoBadge condicao={s.filiacao_condicao} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {termo.trim() && (
            <button
              type="button"
              onClick={() => router.push(urlListaCompleta)}
              className="text-muted-foreground hover:bg-muted/60 block w-full border-t px-3 py-2 text-left text-xs transition-colors"
            >
              Ver todos os resultados para “{termo.trim()}” →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search, X } from "lucide-react"

import { CondicaoBadge } from "@/app/painel/filiados/condicao-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatarCpf } from "@/lib/cpf"

export type SugestaoFiliado = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_condicao: string | null
}

/**
 * Seletor de filiado: busca por nome, CPF ou matrícula (3+ caracteres) e
 * grava o id escolhido num input hidden.
 *
 * O `endpoint` é obrigatório e específico de cada módulo de propósito. As
 * rotas de busca ficam DENTRO da área que as usa para herdar o gate de
 * permissão no proxy — se este componente apontasse para uma rota fixa,
 * quem usasse o seletor precisaria da permissão daquele outro módulo.
 */
export function FiliadoPicker({
  endpoint,
  nome = "filiado_id",
  inicial,
  placeholder = "Busque por nome, CPF ou matrícula",
}: {
  endpoint: string
  /** Nome do input hidden que recebe o id. */
  nome?: string
  /** Pré-seleção, na edição. */
  inicial?: SugestaoFiliado | null
  placeholder?: string
}) {
  const [termo, setTermo] = useState("")
  const [sugestoes, setSugestoes] = useState<SugestaoFiliado[]>([])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [selecionado, setSelecionado] = useState<SugestaoFiliado | null>(
    inicial ?? null
  )
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
        const r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, {
          signal: controlador.signal,
        })
        const { sugestoes: s } = (await r.json()) as {
          sugestoes: SugestaoFiliado[]
        }
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

  if (selecionado) {
    return (
      <div className="border-input flex items-center gap-3 rounded-md border px-3 py-2">
        <input type="hidden" name={nome} value={selecionado.id} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {selecionado.nome_completo ?? "(sem nome)"}
        </span>
        <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
          {selecionado.cpf ? formatarCpf(selecionado.cpf) : ""}
        </span>
        <CondicaoBadge condicao={selecionado.filiacao_condicao} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Trocar filiado"
          onClick={() => {
            setSelecionado(null)
            setTermo("")
            setSugestoes([])
          }}
        >
          <X />
        </Button>
      </div>
    )
  }

  return (
    <div ref={caixa} className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      {carregando && (
        <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
      )}
      <Input
        value={termo}
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault()
          if (e.key === "Escape") setAberto(false)
        }}
        placeholder={placeholder}
        className="pl-8"
        aria-label="Buscar filiado"
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
                    onClick={() => {
                      setSelecionado(s)
                      setAberto(false)
                    }}
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
        </div>
      )}
    </div>
  )
}

"use client"

import { useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown, TriangleAlert, X } from "lucide-react"

import { cn } from "@/lib/utils"

export type EmpresaOpcao = {
  id: string
  nome: string
  cnpj_cpf: string | null
  bloqueado: boolean
}

/**
 * Busca-e-escolhe de empresa (linhas de `empresa`), client-side: recebe a
 * lista completa do servidor e filtra localmente. Grava o id no input hidden
 * `name`.
 *
 * `bloqueado` é um conceito de FORNECEDOR (compras). Em outros contextos —
 * a CIPA de uma empresa, por exemplo — passe false: uma empresa bloqueada
 * como fornecedora segue existindo como empresa.
 *
 * (doc antigo abaixo)
 * Busca-e-escolhe de empresa (linhas de `empresa`), client-side: recebe a
 * lista completa do servidor e filtra localmente. Grava o id no input hidden
 * `name`. Fornecedores bloqueados aparecem sinalizados e não são
 * selecionáveis.
 */
export function EmpresaCombobox({
  empresas,
  name,
  defaultId,
}: {
  empresas: EmpresaOpcao[]
  name: string
  defaultId?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState("")
  const [selecionado, setSelecionado] = useState<EmpresaOpcao | null>(
    () => empresas.find((f) => f.id === defaultId) ?? null
  )
  const areaRef = useRef<HTMLDivElement>(null)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    const digitos = termo.replace(/\D/g, "")
    if (!termo) return empresas.slice(0, 50)
    return empresas
      .filter(
        (f) =>
          f.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
          (digitos.length >= 3 && (f.cnpj_cpf ?? "").includes(digitos))
      )
      .slice(0, 50)
  }, [busca, empresas])

  return (
    <div
      ref={areaRef}
      className="relative"
      onBlur={(e) => {
        if (!areaRef.current?.contains(e.relatedTarget as Node)) {
          setAberto(false)
        }
      }}
    >
      <input type="hidden" name={name} value={selecionado?.id ?? ""} />
      {selecionado ? (
        <div className="border-input bg-background flex h-9 items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs">
          <span className="truncate">{selecionado.nome}</span>
          <button
            type="button"
            aria-label="Trocar empresa"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSelecionado(null)
              setBusca("")
              setAberto(true)
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={`empresas-${name}`}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setAberto(true)
            }}
            onFocus={() => setAberto(true)}
            placeholder="Busque por nome ou CNPJ/CPF"
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 pr-8 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <ChevronsUpDown className="text-muted-foreground pointer-events-none absolute top-2.5 right-2.5 size-4" />
        </div>
      )}

      {aberto && !selecionado && (
        <div
          id={`empresas-${name}`}
          className="border-border bg-popover absolute z-(--z-dropdown) mt-1 max-h-64 w-full overflow-y-auto rounded-md border shadow-md"
        >
          {filtrados.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">
              Nenhuma empresa encontrada.
            </p>
          ) : (
            filtrados.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={f.bloqueado}
                onClick={() => {
                  setSelecionado(f)
                  setAberto(false)
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                  f.bloqueado
                    ? "text-muted-foreground cursor-not-allowed opacity-60"
                    : "hover:bg-muted"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{f.nome}</span>
                  {f.cnpj_cpf && (
                    <span className="text-muted-foreground block text-xs tabular-nums">
                      {f.cnpj_cpf}
                    </span>
                  )}
                </span>
                {f.bloqueado ? (
                  <span className="text-warning-fg flex shrink-0 items-center gap-1 text-xs">
                    <TriangleAlert className="size-3.5" />
                    Bloqueado
                  </span>
                ) : (
                  <Check className="text-muted-foreground/0 size-4 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

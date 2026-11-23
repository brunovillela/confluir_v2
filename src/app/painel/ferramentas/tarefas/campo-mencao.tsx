"use client"

import { useMemo, useRef, useState } from "react"

import { Textarea } from "@/components/ui/textarea"
import { mencaoEmDigitacao, semAcento, type PessoaMencionavel } from "@/lib/ferramentas-acompanhamento"
import { cn } from "@/lib/utils"

const MAX_SUGESTOES = 6

/**
 * Campo da mensagem com menção (Onda 4): ao digitar "@", aparece a lista de
 * pessoas; Enter ou Tab escolhe, Esc fecha. O texto vai no campo `texto` do
 * formulário como "@Nome", e o servidor reconhece as menções pelo nome.
 */
export function CampoMencao({
  id,
  pessoas,
  eu,
}: {
  id: string
  pessoas: PessoaMencionavel[]
  eu: string | null
}) {
  const [texto, setTexto] = useState("")
  const [cursor, setCursor] = useState(0)
  const [indice, setIndice] = useState(0)
  const [fechado, setFechado] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)

  const emDigitacao = fechado ? null : mencaoEmDigitacao(texto, cursor)
  const sugestoes = useMemo(() => {
    if (!emDigitacao) return []
    const busca = semAcento(emDigitacao.busca)
    return pessoas
      .filter((p) => p.id !== eu)
      .filter((p) => {
        const nome = semAcento(p.nome)
        return !busca || nome.startsWith(busca) || nome.includes(` ${busca}`)
      })
      .slice(0, MAX_SUGESTOES)
  }, [emDigitacao, pessoas, eu])
  const ativo = Math.min(indice, Math.max(sugestoes.length - 1, 0))

  function escolher(p: PessoaMencionavel) {
    if (!emDigitacao) return
    const antes = texto.slice(0, emDigitacao.inicio)
    const depois = texto.slice(cursor)
    const inserido = `@${p.nome} `
    const novo = antes + inserido + depois.replace(/^\s+/, "")
    const pos = antes.length + inserido.length
    setTexto(novo)
    setCursor(pos)
    setIndice(0)
    requestAnimationFrame(() => {
      campo.current?.focus()
      campo.current?.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative">
      <Textarea
        ref={campo}
        id={id}
        name="texto"
        rows={3}
        maxLength={4000}
        value={texto}
        placeholder="Escreva uma mensagem. Use @ para mencionar alguém."
        aria-autocomplete="list"
        aria-expanded={sugestoes.length > 0}
        aria-controls={`${id}-sugestoes`}
        onChange={(e) => {
          setTexto(e.target.value)
          setCursor(e.target.selectionStart ?? e.target.value.length)
          setFechado(false)
          setIndice(0)
        }}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (!sugestoes.length) return
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setIndice((ativo + 1) % sugestoes.length)
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setIndice((ativo - 1 + sugestoes.length) % sugestoes.length)
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault()
            escolher(sugestoes[ativo])
          } else if (e.key === "Escape") {
            e.preventDefault()
            setFechado(true)
          }
        }}
      />
      {sugestoes.length > 0 && (
        <ul
          id={`${id}-sugestoes`}
          role="listbox"
          aria-label="Pessoas para mencionar"
          className="bg-popover text-popover-foreground absolute bottom-full left-0 z-50 mb-1 grid w-64 max-w-full gap-0.5 rounded-md border p-1 shadow-md"
        >
          {sugestoes.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === ativo}>
              <button
                type="button"
                className={cn("w-full rounded-sm px-2 py-1.5 text-left text-sm", i === ativo ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
                onMouseDown={(e) => {
                  e.preventDefault()
                  escolher(p)
                }}
              >
                {p.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

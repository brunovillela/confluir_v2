import type { CSSProperties } from "react"

import {
  lerCorpo,
  linkSeguro,
  marcadoresDaLista,
  type Alinhamento,
  type Trecho,
} from "@/lib/oficio-formatacao"

/**
 * Corpo do ofício formatado (negrito, listas, alinhamento…) a partir do
 * BBCode gravado — inclusive o dos ofícios herdados do Bubble. Desenhado com
 * elementos React (nada de HTML cru), então não há o que escapar.
 * Sem hooks: serve em página de servidor, na impressão e no editor.
 */

const RECUO_EM = 2.5

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => {
        const estilo: CSSProperties = {}
        if (t.b) estilo.fontWeight = 700
        if (t.i) estilo.fontStyle = "italic"
        const decoracao = [t.u ? "underline" : "", t.s ? "line-through" : ""].filter(Boolean).join(" ")
        if (decoracao) estilo.textDecoration = decoracao
        const link = linkSeguro(t.link)
        return link ? (
          <a key={i} href={link} style={estilo} className="underline" target="_blank" rel="noreferrer">
            {t.texto}
          </a>
        ) : (
          <span key={i} style={estilo}>
            {t.texto}
          </span>
        )
      })}
    </>
  )
}

const alinhar = (a: Alinhamento | null): CSSProperties => (a ? { textAlign: a } : {})

export function OficioCorpo({ corpo, className }: { corpo: string | null | undefined; className?: string }) {
  const blocos = lerCorpo(corpo)
  if (!blocos.length) return null
  return (
    <div className={className} style={{ lineHeight: 1.5 }}>
      {blocos.map((b, i) => {
        if (b.tipo === "lista") {
          const marcadores = marcadoresDaLista(b)
          return (
            <ul key={i} role="list" style={{ margin: "0.25em 0", padding: 0, listStyle: "none" }}>
              {b.itens.map((it, j) => (
                <li
                  key={j}
                  style={{ display: "flex", gap: "0.5em", paddingLeft: `${1.25 + it.nivel * 1.5}em`, whiteSpace: "pre-wrap" }}
                >
                  <span aria-hidden style={{ minWidth: "1.4em", textAlign: "right", flexShrink: 0 }}>
                    {marcadores[j]}
                  </span>
                  <span style={{ flex: 1 }}>
                    <Trechos trechos={it.trechos} />
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        if (b.tipo === "titulo") {
          return (
            <p key={i} style={{ ...alinhar(b.alinhamento), fontWeight: 700, fontSize: "1.08em", margin: "0.4em 0 0.2em" }}>
              <Trechos trechos={b.trechos} />
            </p>
          )
        }
        return (
          <p
            key={i}
            style={{
              ...alinhar(b.alinhamento),
              paddingLeft: b.recuo ? `${b.recuo * RECUO_EM}em` : undefined,
              margin: 0,
              minHeight: "1.5em",
              whiteSpace: "pre-wrap",
            }}
          >
            <Trechos trechos={b.trechos} />
          </p>
        )
      })}
    </div>
  )
}

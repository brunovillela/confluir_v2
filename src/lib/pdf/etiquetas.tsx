import { Document, Page, Text, View } from "@react-pdf/renderer"

import { areaUtil, MM, type ModeloEtiqueta } from "@/lib/etiquetas-pimaco"
import type { LinhaEncaixada } from "@/lib/etiquetas-texto"

/**
 * Folhas de etiquetas (@react-pdf/renderer) no gabarito Pimaco: cada
 * etiqueta é posicionada em coordenadas absolutas a partir das margens e dos
 * passos do modelo, e as linhas chegam JÁ encaixadas (etiquetas-texto.ts) —
 * nada quebra nem encolhe aqui, para a folha sair igual à prévia da tela.
 * Renderizada em `/painel/comunicacao/etiquetas/pdf`.
 */

export type FolhaDeEtiquetas = {
  /** Uma entrada por posição da folha; null = posição em branco. */
  posicoes: (LinhaEncaixada[] | null)[]
}

export function EtiquetasPDF({
  modelo,
  folhas,
  contorno = false,
  numerar = false,
  ajusteX = 0,
  ajusteY = 0,
  titulo,
}: {
  modelo: ModeloEtiqueta
  folhas: FolhaDeEtiquetas[]
  /** Contorno pontilhado de cada etiqueta (teste em papel comum). */
  contorno?: boolean
  /** Número da posição no centro da etiqueta (folha de teste). */
  numerar?: boolean
  /** Deslocamento fino da impressora, em mm (positivo = direita/baixo). */
  ajusteX?: number
  ajusteY?: number
  titulo: string
}) {
  const area = areaUtil(modelo)
  const tamanho = modelo.folha === "a4" ? "A4" : "LETTER"

  return (
    <Document title={titulo} creator="Confluir">
      {folhas.map((folha, f) => (
        <Page key={f} size={tamanho} style={{ fontFamily: "Helvetica", color: "#000" }}>
          {folha.posicoes.map((linhas, i) => {
            const coluna = i % modelo.colunas
            const linha = Math.floor(i / modelo.colunas)
            const x = (modelo.margemEsquerda + coluna * modelo.passoHorizontal + ajusteX) * MM
            const y = (modelo.margemSuperior + linha * modelo.passoVertical + ajusteY) * MM
            if (!linhas && !contorno && !numerar) return null
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: modelo.largura * MM,
                  height: modelo.altura * MM,
                  ...(contorno
                    ? {
                        borderWidth: 0.4,
                        borderStyle: "dashed",
                        borderColor: "#9ca3af",
                        borderRadius: 2 * MM,
                      }
                    : {}),
                }}
              >
                {numerar && (
                  <Text
                    style={{
                      position: "absolute",
                      left: 0,
                      top: (modelo.altura * MM) / 2 - 7,
                      width: modelo.largura * MM,
                      textAlign: "center",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    {i + 1}
                  </Text>
                )}
                {linhas?.map((l, j) => (
                  <Text
                    key={j}
                    style={{
                      position: "absolute",
                      left: area.margemX,
                      top: area.margemY + l.topo,
                      width: area.largura,
                      fontSize: l.corpo,
                      fontFamily: l.negrito ? "Helvetica-Bold" : "Helvetica",
                      textAlign: l.alinhamento === "direita" ? "right" : "left",
                      lineHeight: 1,
                    }}
                  >
                    {l.texto}
                  </Text>
                ))}
              </View>
            )
          })}
        </Page>
      ))}
    </Document>
  )
}

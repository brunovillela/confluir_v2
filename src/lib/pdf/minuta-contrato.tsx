import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * PDF da minuta de contrato. O texto já traz qualificação, cláusulas, local,
 * data e assinaturas (a IA redige tudo) — aqui é só apresentação: cabeçalho
 * da entidade, títulos em negrito e, enquanto não finalizada, a marca MINUTA.
 */

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM * 1.2,
    paddingBottom: CM * 1.5,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.45,
  },
  logo: { width: 100, alignSelf: "center", marginBottom: 6 },
  org: { textAlign: "center", fontSize: 10, fontFamily: "Helvetica-Bold" },
  orgSub: { textAlign: "center", fontSize: 8, color: "#444444", marginBottom: 16 },
  marca: {
    position: "absolute",
    top: 300,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 90,
    color: "#e5e7eb",
    fontFamily: "Helvetica-Bold",
    transform: "rotate(-35deg)",
  },
  corpo: { textAlign: "justify" },
  paragrafo: { marginBottom: 6 },
  titulo: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4 },
  rodape: {
    position: "absolute",
    bottom: CM * 0.7,
    left: CM * 1.2,
    right: CM * 1.2,
    fontSize: 7,
    color: "#777777",
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

/** Linha curta em CAIXA ALTA = título (do contrato ou de cláusula). */
function ehTitulo(linha: string): boolean {
  const t = linha.trim()
  if (t.length === 0 || t.length > 90) return false
  return t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t)
}

export function MinutaContratoPDF({
  texto,
  entidade,
  subtitulo,
  logo,
  rodape,
  minuta,
}: {
  texto: string
  entidade: string | null
  subtitulo: string | null
  logo: string | null
  rodape: string
  /** true enquanto não finalizada: marca d'água "MINUTA". */
  minuta: boolean
}) {
  const linhas = texto.split("\n")
  return (
    <Document title={rodape}>
      <Page size="A4" style={s.page}>
        {minuta ? (
          <Text style={s.marca} fixed>
            MINUTA
          </Text>
        ) : null}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não aceita alt */}
        {logo ? <Image src={logo} style={s.logo} /> : null}
        {entidade ? <Text style={s.org}>{entidade}</Text> : null}
        <Text style={s.orgSub}>{subtitulo ?? ""}</Text>

        <View style={s.corpo}>
          {linhas.map((linha, i) =>
            linha.trim() === "" ? (
              <Text key={i} style={{ marginBottom: 3 }}>
                {" "}
              </Text>
            ) : (
              <Text key={i} style={ehTitulo(linha) ? s.titulo : s.paragrafo}>
                {linha}
              </Text>
            )
          )}
        </View>

        <View style={s.rodape} fixed>
          <Text>{rodape}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

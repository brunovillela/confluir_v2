import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * PDF do termo de cessão de espaço. O texto vem JÁ renderizado do banco (o
 * modelo com os dados daquela cessão) — aqui é só apresentação.
 *
 * As linhas de assinatura ficam no fim mesmo quando a assinatura eletrônica
 * entrar (fase 5): há cessão que se resolve no papel, na recepção.
 */

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM * 1.2,
    paddingBottom: CM * 1.4,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.45,
  },
  logo: { width: 110, alignSelf: "center", marginBottom: 8 },
  org: { textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold" },
  orgSub: { textAlign: "center", fontSize: 9, color: "#444444", marginBottom: 18 },
  corpo: { textAlign: "justify" },
  paragrafo: { marginBottom: 7 },
  titulo: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4 },
  assinaturas: { marginTop: CM * 1.1, flexDirection: "row", gap: 24 },
  campo: { flex: 1, alignItems: "center" },
  risco: { borderTopWidth: 1, borderTopColor: "#555555", width: "100%", marginBottom: 4 },
  campoRotulo: { fontSize: 8, color: "#444444", textAlign: "center" },
  rodape: {
    position: "absolute",
    bottom: CM * 0.7,
    left: CM * 1.2,
    right: CM * 1.2,
    fontSize: 7,
    color: "#777777",
    textAlign: "center",
  },
})

/** Um título de cláusula é a linha curta em CAIXA ALTA — negrito nela. */
function ehTitulo(linha: string): boolean {
  const t = linha.trim()
  if (t.length === 0 || t.length > 70) return false
  return t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t)
}

export function TermoCessaoPDF({
  texto,
  entidade,
  subtitulo,
  codigo,
  numero,
  logo,
}: {
  texto: string
  entidade: string | null
  subtitulo: string | null
  codigo: string | null
  numero: number | null
  logo: string | null
}) {
  const linhas = texto.split("\n")
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não aceita alt */}
        {logo ? <Image src={logo} style={s.logo} /> : null}
        {entidade ? <Text style={s.org}>{entidade}</Text> : null}
        <Text style={s.orgSub}>{subtitulo ?? ""}</Text>

        <View style={s.corpo}>
          {linhas.map((linha, i) =>
            linha.trim() === "" ? (
              <Text key={i} style={{ marginBottom: 4 }}>
                {" "}
              </Text>
            ) : (
              <Text key={i} style={ehTitulo(linha) ? s.titulo : s.paragrafo}>
                {linha}
              </Text>
            )
          )}
        </View>

        <View style={s.assinaturas} wrap={false}>
          <View style={s.campo}>
            <View style={s.risco} />
            <Text style={s.campoRotulo}>CEDENTE</Text>
          </View>
          <View style={s.campo}>
            <View style={s.risco} />
            <Text style={s.campoRotulo}>CONCESSIONÁRIO</Text>
          </View>
        </View>

        <Text style={s.rodape} fixed>
          {[
            numero ? `Pedido nº ${numero}` : null,
            codigo ? `modelo versão ${codigo}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </Page>
    </Document>
  )
}

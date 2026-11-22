import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Certificado de participação em congresso: A4 deitado, um por página, com a
 * condição de participação, a frequência e o QR de /verificar.
 */

export type DadosCertificadoPDF = {
  nome: string
  condicao: string
  frequencia: number | null
  codigo: string
  verificarUrl: string
  qrDataUri: string
}

export type DadosCertificadosPDF = {
  entidade: string | null
  logo: string | null
  congresso: string
  periodo: string | null
  local: string | null
  emitidoEm: string
  certificados: DadosCertificadoPDF[]
}

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", color: "#111827" },
  moldura: { flex: 1, borderWidth: 2, borderColor: "#c2410c", padding: 36, justifyContent: "space-between" },
  topo: { alignItems: "center" },
  logo: { height: 48, objectFit: "contain", marginBottom: 8 },
  entidade: { fontSize: 11, color: "#4b5563" },
  titulo: { fontSize: 30, fontFamily: "Helvetica-Bold", marginTop: 18, letterSpacing: 2, color: "#c2410c" },
  texto: { fontSize: 14, lineHeight: 1.6, textAlign: "center", marginTop: 24, paddingHorizontal: 24 },
  nome: { fontFamily: "Helvetica-Bold", fontSize: 18 },
  base: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  qr: { width: 72, height: 72 },
  pe: { fontSize: 8, color: "#4b5563" },
  codigo: { fontSize: 10, fontFamily: "Courier-Bold" },
})

export function CertificadosPDF({ d }: { d: DadosCertificadosPDF }) {
  return (
    <Document title={`Certificados — ${d.congresso}`}>
      {d.certificados.map((c) => (
        <Page key={c.codigo} size="A4" orientation="landscape" style={s.page}>
          <View style={s.moldura}>
            <View style={s.topo}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
              {d.logo && <Image src={d.logo} style={s.logo} />}
              {d.entidade && <Text style={s.entidade}>{d.entidade}</Text>}
              <Text style={s.titulo}>CERTIFICADO</Text>
            </View>
            <Text style={s.texto}>
              Certificamos que <Text style={s.nome}>{c.nome}</Text> participou do {d.congresso}
              {d.periodo ? `, realizado ${d.periodo}` : ""}
              {d.local ? `, em ${d.local}` : ""}, na condição de {c.condicao}
              {c.frequencia !== null ? `, com frequência de ${String(c.frequencia).replace(".", ",")}% das sessões` : ""}.
            </Text>
            <View style={s.base}>
              <View>
                <Text style={s.pe}>Emitido em {d.emitidoEm}</Text>
                <Text style={s.pe}>Confira a autenticidade em {c.verificarUrl}</Text>
                <Text style={s.codigo}>{c.codigo}</Text>
              </View>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
              <Image src={c.qrDataUri} style={s.qr} />
            </View>
          </View>
        </Page>
      ))}
    </Document>
  )
}

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Moção com as assinaturas: o texto, o resumo SHA-256 da versão assinada, o
 * limiar e a lista de quem assinou (meio e prova de presença). Substitui a
 * folha de assinaturas e acompanha o ofício ao destinatário.
 */

export type DadosMocaoPDF = {
  congresso: string
  entidade: string | null
  numero: number
  tipo: string | null
  titulo: string
  destinatario: string | null
  texto: string
  versao: number
  hash: string
  situacao: string
  proponente: string | null
  base: string | null
  limiar: string[]
  assinaturas: { nome: string; papel: string | null; base: string | null; meio: string; quando: string }[]
  verificarUrl: string
  qrDataUri: string
  geradoEm: string
}

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  entidade: { fontSize: 9, color: "#4b5563" },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 6 },
  sub: { fontSize: 9, color: "#4b5563", marginTop: 3 },
  texto: { marginTop: 14, lineHeight: 1.4 },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d1d5db", paddingVertical: 3 },
  cab: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingBottom: 3 },
  n: { width: 24 },
  nome: { flex: 1 },
  papel: { width: 90 },
  base: { width: 80 },
  meio: { width: 90 },
  quando: { width: 70 },
  bold: { fontFamily: "Helvetica-Bold" },
  hash: { fontSize: 7, fontFamily: "Courier", color: "#4b5563", marginTop: 4 },
  rodape: { position: "absolute", bottom: 16, left: 36, right: 36, fontSize: 7, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
})

export function MocaoPDF({ d }: { d: DadosMocaoPDF }) {
  return (
    <Document title={`Moção ${d.numero} — ${d.titulo}`}>
      <Page size="A4" style={s.page}>
        <View style={s.topo}>
          <View style={{ flex: 1 }}>
            {d.entidade && <Text style={s.entidade}>{d.entidade}</Text>}
            <Text style={s.entidade}>{d.congresso}</Text>
            <Text style={s.titulo}>
              Moção {d.numero}
              {d.tipo ? ` — ${d.tipo}` : ""}: {d.titulo}
            </Text>
            <Text style={s.sub}>
              {d.destinatario ? `Destinatário: ${d.destinatario} · ` : ""}
              {d.proponente ? `Apresentada por ${d.proponente}` : ""}
              {d.base ? ` · Base de origem: ${d.base}` : ""} · {d.situacao}
            </Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
          <Image src={d.qrDataUri} style={{ width: 70, height: 70 }} />
        </View>
        <Text style={s.texto}>{d.texto}</Text>
        <Text style={s.hash}>
          Versão {d.versao} · SHA-256 do texto: {d.hash}
        </Text>
        {d.limiar.length > 0 && (
          <>
            <Text style={s.secao}>Mínimo de assinaturas</Text>
            {d.limiar.map((l) => (
              <Text key={l}>{l}</Text>
            ))}
          </>
        )}
        <Text style={s.secao}>Assinaturas ({d.assinaturas.length})</Text>
        <View style={s.cab} fixed>
          <Text style={[s.n, s.bold]}>#</Text>
          <Text style={[s.nome, s.bold]}>Nome</Text>
          <Text style={[s.papel, s.bold]}>Papel</Text>
          <Text style={[s.base, s.bold]}>Base</Text>
          <Text style={[s.meio, s.bold]}>Meio</Text>
          <Text style={[s.quando, s.bold]}>Quando</Text>
        </View>
        {d.assinaturas.map((a, i) => (
          <View key={i} style={s.linha} wrap={false}>
            <Text style={s.n}>{i + 1}</Text>
            <Text style={s.nome}>{a.nome}</Text>
            <Text style={s.papel}>{a.papel ?? "—"}</Text>
            <Text style={s.base}>{a.base ?? "—"}</Text>
            <Text style={s.meio}>{a.meio}</Text>
            <Text style={s.quando}>{a.quando}</Text>
          </View>
        ))}
        <View style={s.rodape} fixed>
          <Text>Confira em {d.verificarUrl}</Text>
          <Text>Gerado em {d.geradoEm}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

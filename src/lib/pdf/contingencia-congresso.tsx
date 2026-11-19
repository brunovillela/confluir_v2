import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Lista de contingência: se a internet cair, a mesa credencia e a sala
 * registra presença no papel, e alguém lança depois. Uma seção por base, em
 * ordem alfabética, com espaço para assinatura e horário.
 */

export type LinhaContingencia = { nome: string; papel: string | null; cpf: string; situacao: string }

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: "#4b5563", marginTop: 2, marginBottom: 10 },
  base: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d1d5db", minHeight: 22, alignItems: "center" },
  cab: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingBottom: 3 },
  n: { width: 22 },
  nome: { flex: 1 },
  papel: { width: 80 },
  cpf: { width: 78 },
  hora: { width: 46 },
  ass: { width: 130 },
  bold: { fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
})

export function ContingenciaPDF({
  congresso,
  sessao,
  grupos,
  geradoEm,
}: {
  congresso: string
  sessao: string | null
  grupos: { base: string; linhas: LinhaContingencia[] }[]
  geradoEm: string
}) {
  let n = 0
  return (
    <Document title={`Lista de contingência — ${congresso}`}>
      <Page size="A4" style={s.page} wrap>
        <Text style={s.titulo}>{congresso}</Text>
        <Text style={s.sub}>
          Lista de contingência{sessao ? ` — ${sessao}` : " — credenciamento"}. Use se o sistema estiver fora do ar; lance
          depois no Confluir.
        </Text>
        {grupos.map((g) => (
          <View key={g.base} wrap>
            <Text style={s.base}>{g.base}</Text>
            <View style={s.cab} fixed>
              <Text style={[s.n, s.bold]}>Nº</Text>
              <Text style={[s.nome, s.bold]}>Nome</Text>
              <Text style={[s.papel, s.bold]}>Papel</Text>
              <Text style={[s.cpf, s.bold]}>CPF</Text>
              <Text style={[s.hora, s.bold]}>Hora</Text>
              <Text style={[s.ass, s.bold]}>Assinatura</Text>
            </View>
            {g.linhas.map((l) => {
              n++
              return (
                <View key={n} style={s.linha} wrap={false}>
                  <Text style={s.n}>{n}</Text>
                  <Text style={s.nome}>
                    {l.nome}
                    {l.situacao === "lista_espera" ? " (espera)" : ""}
                  </Text>
                  <Text style={s.papel}>{l.papel ?? "—"}</Text>
                  <Text style={s.cpf}>{l.cpf}</Text>
                  <Text style={s.hora}> </Text>
                  <Text style={s.ass}> </Text>
                </View>
              )
            })}
          </View>
        ))}
        <View style={s.rodape} fixed>
          <Text>Gerada em {geradoEm}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

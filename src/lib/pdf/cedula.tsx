import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

/**
 * Modelo de CÉDULA de votação (@react-pdf/renderer): logo do sindicato,
 * dados da votação (campanha/rodada/assembleia), perguntas e opções com
 * área de marcação. Renderizada no route handler
 * `/painel/representacao/assembleias/cedula/[id]`.
 */

export type DadosCedula = {
  organizacao: string | null
  campanha: string | null
  rodada: string | null
  assembleia: string | null
  periodo: string | null
  perguntas: {
    id: string
    pergunta: string | null
    opcoes: { id: string; texto: string | null }[]
  }[]
}

const CM = 28.35

const s = StyleSheet.create({
  page: {
    padding: CM,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  logoBox: { alignItems: "center", marginBottom: 8 },
  logo: { width: 150, objectFit: "contain" },
  org: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 2,
  },
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    letterSpacing: 2,
    marginTop: 6,
    marginBottom: 8,
  },
  meta: { textAlign: "center", fontSize: 10, color: "#374151", marginBottom: 1 },
  divisor: {
    borderTopWidth: 1,
    borderColor: "#111827",
    borderStyle: "dashed",
    marginVertical: 12,
  },
  pergunta: { marginBottom: 12 },
  perguntaTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 6,
  },
  opcao: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: "#9ca3af",
    borderRadius: 3,
    padding: 6,
  },
  quadrado: {
    width: 16,
    height: 16,
    borderWidth: 1.2,
    borderColor: "#111827",
    marginRight: 10,
  },
  opcaoTexto: { fontSize: 11 },
  instrucoes: {
    marginTop: 4,
    fontSize: 8.5,
    color: "#6b7280",
    lineHeight: 1.3,
  },
  rodape: {
    marginTop: 14,
    borderTopWidth: 1,
    borderColor: "#d1d5db",
    paddingTop: 6,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
})

export function CedulaPDF({
  dados,
  logoDataUri,
}: {
  dados: DadosCedula
  logoDataUri: string | null
}) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        {dados.organizacao ? <Text style={s.org}>{dados.organizacao}</Text> : null}
        <Text style={s.titulo}>CÉDULA DE VOTAÇÃO</Text>
        {dados.campanha ? (
          <Text style={s.meta}>Campanha: {dados.campanha}</Text>
        ) : null}
        {dados.rodada ? <Text style={s.meta}>Rodada: {dados.rodada}</Text> : null}
        {dados.assembleia ? (
          <Text style={s.meta}>Assembleia: {dados.assembleia}</Text>
        ) : null}
        {dados.periodo ? <Text style={s.meta}>{dados.periodo}</Text> : null}

        <View style={s.divisor} />

        {dados.perguntas.map((p, i) => (
          <View key={p.id} style={s.pergunta} wrap={false}>
            <Text style={s.perguntaTitulo}>
              {i + 1}. {p.pergunta ?? "Pergunta"}
            </Text>
            {p.opcoes.map((o) => (
              <View key={o.id} style={s.opcao}>
                <View style={s.quadrado} />
                <Text style={s.opcaoTexto}>{o.texto ?? "(opção)"}</Text>
              </View>
            ))}
            {p.opcoes.length === 0 ? (
              <Text style={s.opcaoTexto}>(sem opções cadastradas)</Text>
            ) : null}
          </View>
        ))}

        <Text style={s.instrucoes}>
          Marque com um X apenas UM quadrado por pergunta. Cédula sem marcação é
          contada como BRANCO; com mais de uma marcação, rasuras ou anotações é
          contada como NULO.
        </Text>

        <Text style={s.rodape}>
          Cédula gerada pelo Confluir — voto secreto.
        </Text>
      </Page>
    </Document>
  )
}

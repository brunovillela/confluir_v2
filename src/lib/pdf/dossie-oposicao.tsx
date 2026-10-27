import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Dossiê de uma oposição (onda 2, C7): tudo o que a entidade tem para se
 * defender em juízo — quem, quando, de onde, o texto exato aceito (com o
 * hash), as respostas, a carta e a conferência da assinatura, a decisão e a
 * trilha completa. Os textos chegam prontos (datas no fuso de São Paulo).
 *
 * Sem `lineHeight` no estilo da Page (armadilha do @react-pdf 4.5 em
 * documento longo): só nos textos corridos.
 */

export type DadosDossieOposicao = {
  organizacao: string | null
  cnpj: string | null
  emitidoEm: string
  emitidoPor: string | null
  campanha: string | null
  identificacao: [string, string | null][]
  ato: [string, string | null][]
  declaracao: string | null
  declaracaoHash: string | null
  respostas: { pergunta: string | null; resposta: string | null }[]
  carta: [string, string | null][]
  assinaturas: string[]
  avaliacao: [string, string | null][]
  trilha: { quando: string; evento: string; detalhe: string | null }[]
}

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM * 1.5,
    paddingBottom: CM * 1.8,
    paddingHorizontal: CM * 1.8,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  logoBox: { alignItems: "center", marginBottom: 4 },
  logo: { width: 110, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11.5 },
  cnpj: { textAlign: "center", fontSize: 8.5, color: "#4b5563" },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12.5, marginTop: 12 },
  subtitulo: { textAlign: "center", fontSize: 9, color: "#374151", marginBottom: 6 },
  secao: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    marginTop: 12,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.75,
    borderColor: "#9ca3af",
  },
  par: { flexDirection: "row", paddingVertical: 1.5 },
  rotulo: { width: 130, color: "#4b5563" },
  valor: { flex: 1 },
  caixa: { backgroundColor: "#f3f4f6", borderRadius: 3, padding: 8, marginTop: 4, lineHeight: 1.4 },
  mono: { fontFamily: "Courier", fontSize: 8 },
  item: { marginBottom: 4, lineHeight: 1.35 },
  pergunta: { color: "#4b5563" },
  evento: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2.5 },
  eQuando: { width: 88, color: "#4b5563" },
  eNome: { width: 110, fontFamily: "Helvetica-Bold" },
  eDetalhe: { flex: 1 },
  rodape: {
    position: "absolute",
    bottom: CM * 0.8,
    left: CM * 1.8,
    right: CM * 1.8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#6b7280",
  },
})

function Pares({ pares }: { pares: [string, string | null][] }) {
  return (
    <>
      {pares.map(([r, v], i) => (
        <View key={i} style={s.par} wrap={false}>
          <Text style={s.rotulo}>{r}</Text>
          <Text style={s.valor}>{v ?? "—"}</Text>
        </View>
      ))}
    </>
  )
}

export function DossieOposicaoPDF({ dados, logoDataUri }: { dados: DadosDossieOposicao; logoDataUri: string | null }) {
  const d = dados
  return (
    <Document title="Dossiê da oposição" author={d.organizacao ?? undefined}>
      <Page size="A4" style={s.page}>
        {logoDataUri && (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
            <Image src={logoDataUri} style={s.logo} />
          </View>
        )}
        <Text style={s.org}>{d.organizacao ?? ""}</Text>
        {d.cnpj && <Text style={s.cnpj}>CNPJ {d.cnpj}</Text>}
        <Text style={s.titulo}>DOSSIÊ DA OPOSIÇÃO À CONTRIBUIÇÃO ASSISTENCIAL</Text>
        <Text style={s.subtitulo}>{d.campanha ?? ""}</Text>

        <Text style={s.secao}>1. Identificação</Text>
        <Pares pares={d.identificacao} />

        <Text style={s.secao}>2. O ato da oposição</Text>
        <Pares pares={d.ato} />
        <Text style={{ marginTop: 6, color: "#4b5563" }}>Texto da declaração aceita:</Text>
        <Text style={s.caixa}>{d.declaracao ?? "(não registrado — oposição anterior à guarda do texto)"}</Text>
        {d.declaracaoHash && (
          <Text style={[s.mono, { marginTop: 3 }]}>SHA-256 do texto: {d.declaracaoHash}</Text>
        )}

        {d.respostas.length > 0 && (
          <>
            <Text style={s.secao}>3. Questionário</Text>
            {d.respostas.map((r, i) => (
              <View key={i} style={s.item} wrap={false}>
                <Text style={s.pergunta}>{r.pergunta ?? "Pergunta"}</Text>
                <Text>{r.resposta ?? "—"}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.secao}>{d.respostas.length > 0 ? "4" : "3"}. Carta assinada</Text>
        <Pares pares={d.carta} />
        {d.assinaturas.map((a, i) => (
          <Text key={i} style={[s.mono, { marginTop: 3 }]}>
            {a}
          </Text>
        ))}

        <Text style={s.secao}>{d.respostas.length > 0 ? "5" : "4"}. Avaliação da entidade</Text>
        <Pares pares={d.avaliacao} />

        <Text style={s.secao}>{d.respostas.length > 0 ? "6" : "5"}. Trilha de auditoria</Text>
        {d.trilha.length === 0 ? (
          <Text>Sem eventos registrados.</Text>
        ) : (
          d.trilha.map((e, i) => (
            <View key={i} style={s.evento} wrap={false}>
              <Text style={s.eQuando}>{e.quando}</Text>
              <Text style={s.eNome}>{e.evento}</Text>
              <Text style={s.eDetalhe}>{e.detalhe ?? ""}</Text>
            </View>
          ))
        )}

        <View style={s.rodape} fixed>
          <Text>
            Emitido em {d.emitidoEm}
            {d.emitidoPor ? ` por ${d.emitidoPor}` : ""}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

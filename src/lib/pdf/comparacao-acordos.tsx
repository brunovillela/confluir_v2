import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Relatório da comparação de acordos (para diretoria e assembleia): o resumo
 * em números e cada mudança com o que mudou e a avaliação para o trabalhador.
 * Os textos integrais ficam na planilha (num ACT grande passariam de 100 págs).
 */

const CM = 28.35

const s = StyleSheet.create({
  page: { paddingTop: CM, paddingHorizontal: CM * 1.2, paddingBottom: CM * 1.4, fontSize: 9, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.4 },
  logo: { width: 80, marginBottom: 6 },
  org: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 10 },
  sub: { fontSize: 9, color: "#374151", marginTop: 2 },
  grade: { flexDirection: "row", gap: 6, marginTop: 12 },
  cartao: { flex: 1, borderWidth: 0.5, borderColor: "#d1d5db", borderRadius: 3, padding: 6 },
  cartaoRotulo: { fontSize: 7, color: "#6b7280" },
  cartaoValor: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  item: { borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 6 },
  selos: { flexDirection: "row", gap: 6, fontSize: 7, marginBottom: 2 },
  selo: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, borderWidth: 0.5 },
  lados: { fontSize: 8, color: "#374151" },
  resumo: { marginTop: 2 },
  motivo: { fontSize: 8, color: "#6b7280", marginTop: 1 },
  rodape: { position: "absolute", bottom: CM * 0.6, left: CM * 1.2, right: CM * 1.2, fontSize: 7, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
})

const COR: Record<string, string> = { favoravel: "#15803d", desfavoravel: "#b91c1c", neutra: "#6b7280" }

export type ItemRelatorio = {
  situacao: string
  avaliacao: string | null
  avaliacaoChave: "favoravel" | "desfavoravel" | "neutra" | null
  tema: string | null
  a: string
  b: string
  resumo: string | null
  motivo: string | null
}

export function ComparacaoAcordosPDF({
  entidade,
  logo,
  acordoA,
  acordoB,
  numeros,
  itens,
  geradoEm,
}: {
  entidade: string | null
  logo: string | null
  acordoA: string
  acordoB: string
  numeros: { rotulo: string; valor: number; cor?: string }[]
  itens: ItemRelatorio[]
  geradoEm: string
}) {
  return (
    <Document title={`Comparação: ${acordoA} × ${acordoB}`}>
      <Page size="A4" style={s.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não aceita alt */}
        {logo ? <Image src={logo} style={s.logo} /> : null}
        {entidade ? <Text style={s.org}>{entidade}</Text> : null}
        <Text style={s.titulo}>Comparação de acordos coletivos</Text>
        <Text style={s.sub}>A (base): {acordoA}</Text>
        <Text style={s.sub}>B (comparado): {acordoB}</Text>

        <View style={s.grade}>
          {numeros.slice(0, 4).map((n) => (
            <View key={n.rotulo} style={s.cartao}>
              <Text style={s.cartaoRotulo}>{n.rotulo}</Text>
              <Text style={[s.cartaoValor, n.cor ? { color: n.cor } : {}]}>{n.valor}</Text>
            </View>
          ))}
        </View>
        <View style={s.grade}>
          {numeros.slice(4).map((n) => (
            <View key={n.rotulo} style={s.cartao}>
              <Text style={s.cartaoRotulo}>{n.rotulo}</Text>
              <Text style={[s.cartaoValor, n.cor ? { color: n.cor } : {}]}>{n.valor}</Text>
            </View>
          ))}
        </View>

        <Text style={s.secao}>O que mudou</Text>
        {itens.map((it, i) => (
          <View key={i} style={s.item} wrap={false}>
            <View style={s.selos}>
              <Text style={[s.selo, { borderColor: "#9ca3af" }]}>{it.situacao}</Text>
              {it.avaliacao ? (
                <Text style={[s.selo, { borderColor: COR[it.avaliacaoChave ?? "neutra"], color: COR[it.avaliacaoChave ?? "neutra"] }]}>
                  {it.avaliacao}
                </Text>
              ) : null}
              {it.tema ? <Text style={[s.selo, { borderColor: "#d1d5db" }]}>{it.tema}</Text> : null}
            </View>
            <Text style={s.lados}>A: {it.a}   →   B: {it.b}</Text>
            {it.resumo ? <Text style={s.resumo}>{it.resumo}</Text> : null}
            {it.motivo ? <Text style={s.motivo}>{it.motivo}</Text> : null}
          </View>
        ))}

        <View style={s.rodape} fixed>
          <Text>
            Gerado em {geradoEm}. Resumos e avaliações sugeridos por IA e revisáveis; o texto integral está na
            planilha.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

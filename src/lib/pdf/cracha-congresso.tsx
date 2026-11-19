import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Crachá de congresso: A6 (10,5 × 14,8 cm), cabe nos porta-crachás comuns.
 * Faixa colorida com o papel (a cor reconhece de longe quem vota), nome em
 * destaque, base e grupo, QR do crachá para a porta das sessões.
 * Em lote, quatro por folha A4, com marcas de corte.
 */

export type CrachaPdf = {
  nome: string
  papel: string | null
  cor: string | null
  base: string | null
  grupo: string | null
  via: number
  qrDataUri: string
}

const A6 = { w: 297.6, h: 419.5 }

const s = StyleSheet.create({
  cracha: { width: A6.w, height: A6.h, padding: 18, fontFamily: "Helvetica", color: "#111827", justifyContent: "space-between" },
  topo: { alignItems: "center" },
  entidade: { fontSize: 8, color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center" },
  congresso: { fontSize: 10.5, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 3 },
  meio: { alignItems: "center" },
  nome: { fontSize: 21, fontFamily: "Helvetica-Bold", textAlign: "center" },
  base: { fontSize: 11, marginTop: 6, textAlign: "center", color: "#374151" },
  grupo: { fontSize: 9.5, marginTop: 2, textAlign: "center", color: "#6b7280" },
  faixa: { paddingVertical: 7, borderRadius: 4, alignItems: "center" },
  faixaTexto: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 1 },
  rodape: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  qr: { width: 92, height: 92 },
  via: { fontSize: 7, color: "#9ca3af" },
  folha: { flexDirection: "row", flexWrap: "wrap" },
  celula: { width: A6.w, height: A6.h, borderWidth: 0.4, borderColor: "#d1d5db", borderStyle: "dashed" },
})

function Cracha({ c, entidade, congresso }: { c: CrachaPdf; entidade: string | null; congresso: string }) {
  return (
    <View style={s.cracha}>
      <View style={s.topo}>
        {entidade ? <Text style={s.entidade}>{entidade}</Text> : null}
        <Text style={s.congresso}>{congresso}</Text>
      </View>
      <View style={s.meio}>
        <Text style={s.nome}>{c.nome}</Text>
        {c.base ? <Text style={s.base}>{c.base}</Text> : null}
        {c.grupo ? <Text style={s.grupo}>{c.grupo}</Text> : null}
      </View>
      <View>
        <View style={[s.faixa, { backgroundColor: c.cor ?? "#374151" }]}>
          <Text style={s.faixaTexto}>{c.papel ?? "Participante"}</Text>
        </View>
        <View style={[s.rodape, { marginTop: 10 }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.qr} src={c.qrDataUri} />
          <Text style={s.via}>{c.via > 1 ? `${c.via}ª via` : ""}</Text>
        </View>
      </View>
    </View>
  )
}

export function CrachasPDF({
  crachas,
  entidade,
  congresso,
  emLote,
}: {
  crachas: CrachaPdf[]
  entidade: string | null
  congresso: string
  emLote: boolean
}) {
  if (!emLote) {
    return (
      <Document title={`Crachá — ${congresso}`}>
        {crachas.map((c, i) => (
          <Page key={i} size={[A6.w, A6.h]}>
            <Cracha c={c} entidade={entidade} congresso={congresso} />
          </Page>
        ))}
      </Document>
    )
  }
  const folhas: CrachaPdf[][] = []
  for (let i = 0; i < crachas.length; i += 4) folhas.push(crachas.slice(i, i + 4))
  return (
    <Document title={`Crachás — ${congresso}`}>
      {folhas.map((f, i) => (
        <Page key={i} size="A4">
          <View style={s.folha}>
            {f.map((c, j) => (
              <View key={j} style={s.celula}>
                <Cracha c={c} entidade={entidade} congresso={congresso} />
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  )
}

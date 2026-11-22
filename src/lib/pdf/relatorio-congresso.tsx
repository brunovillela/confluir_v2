import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Caderno de resoluções e relatório final do congresso. O caderno público
 * deixa de fora as resoluções reservadas; o relatório (interno) traz tudo,
 * com a marca de reservada, e os números do evento.
 */

export type ResolucaoPDF = { numero: number; titulo: string | null; texto: string; reservada: boolean; origem: string; situacao: string; responsavel: string | null; prazo: string | null }
export type SecaoTabela = { titulo: string; colunas: string[]; linhas: (string | number)[][] }

export type DadosRelatorioPDF = {
  tipo: "caderno" | "relatorio"
  entidade: string | null
  congresso: string
  periodo: string | null
  local: string | null
  geradoEm: string
  resumo: string[]
  eixos: { nome: string; resolucoes: ResolucaoPDF[] }[]
  tabelas: SecaoTabela[]
  eleitos: { chapa: string; nome: string; base: string | null; condicao: string }[]
  reservadasOmitidas: number
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 40, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  entidade: { fontSize: 9, color: "#4b5563" },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 6 },
  sub: { fontSize: 10, color: "#4b5563", marginTop: 3 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6, color: "#c2410c" },
  item: { marginBottom: 8 },
  num: { fontFamily: "Helvetica-Bold" },
  texto: { lineHeight: 1.35 },
  meta: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  reservada: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#b91c1c" },
  lista: { marginTop: 4 },
  li: { lineHeight: 1.35 },
  cab: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingBottom: 2, marginTop: 4 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d1d5db", paddingVertical: 2 },
  cel: { flex: 1, fontSize: 9 },
  celN: { width: 70, fontSize: 9, textAlign: "right" },
  rodape: { position: "absolute", bottom: 16, left: 40, right: 40, fontSize: 7, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
})

function Tabela({ t }: { t: SecaoTabela }) {
  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", marginTop: 6 }}>{t.titulo}</Text>
      <View style={s.cab}>
        {t.colunas.map((c, i) => (
          <Text key={c} style={i === 0 ? s.cel : s.celN}>
            {c}
          </Text>
        ))}
      </View>
      {t.linhas.map((l, i) => (
        <View key={i} style={s.linha}>
          {l.map((v, j) => (
            <Text key={j} style={j === 0 ? s.cel : s.celN}>
              {String(v)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

export function RelatorioCongressoPDF({ d }: { d: DadosRelatorioPDF }) {
  const caderno = d.tipo === "caderno"
  return (
    <Document title={`${caderno ? "Caderno de resoluções" : "Relatório final"} — ${d.congresso}`}>
      <Page size="A4" style={s.page}>
        {d.entidade && <Text style={s.entidade}>{d.entidade}</Text>}
        <Text style={s.titulo}>{caderno ? "Caderno de resoluções" : "Relatório final"}</Text>
        <Text style={s.sub}>
          {d.congresso}
          {d.periodo ? ` · ${d.periodo}` : ""}
          {d.local ? ` · ${d.local}` : ""}
        </Text>
        {!caderno && <Text style={[s.reservada, { marginTop: 4 }]}>Documento interno: contém resoluções reservadas.</Text>}

        {d.resumo.length > 0 && (
          <View style={s.lista}>
            <Text style={s.h2}>Em números</Text>
            {d.resumo.map((r) => (
              <Text key={r} style={s.li}>
                • {r}
              </Text>
            ))}
          </View>
        )}

        {!caderno && d.tabelas.map((t) => <Tabela key={t.titulo} t={t} />)}

        <Text style={s.h2}>Resoluções</Text>
        {d.eixos.length === 0 && <Text>Nenhuma resolução registrada.</Text>}
        {d.eixos.map((e) => (
          <View key={e.nome}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 8, marginBottom: 4 }}>{e.nome}</Text>
            {e.resolucoes.map((r) => (
              <View key={r.numero} style={s.item} wrap={false}>
                {r.reservada && <Text style={s.reservada}>RESERVADA — não divulgar</Text>}
                <Text style={s.texto}>
                  <Text style={s.num}>{r.numero}. </Text>
                  {r.titulo ? <Text style={s.num}>{r.titulo}. </Text> : null}
                  {r.texto}
                </Text>
                {!caderno && (
                  <Text style={s.meta}>
                    {r.origem} · {r.situacao}
                    {r.responsavel ? ` · responsável: ${r.responsavel}` : ""}
                    {r.prazo ? ` · prazo: ${r.prazo}` : ""}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
        {caderno && d.reservadasOmitidas > 0 && (
          <Text style={s.meta}>{d.reservadasOmitidas} resolução(ões) reservada(s) por decisão da plenária não constam deste caderno.</Text>
        )}

        {d.eleitos.length > 0 && (
          <View>
            <Text style={s.h2}>Delegação eleita para a etapa seguinte</Text>
            <View style={s.cab}>
              <Text style={s.cel}>Nome</Text>
              <Text style={s.celN}>Condição</Text>
              <Text style={[s.celN, { width: 110 }]}>Base</Text>
              <Text style={s.celN}>Chapa</Text>
            </View>
            {d.eleitos.map((e, i) => (
              <View key={i} style={s.linha} wrap={false}>
                <Text style={s.cel}>{e.nome}</Text>
                <Text style={s.celN}>{e.condicao}</Text>
                <Text style={[s.celN, { width: 110 }]}>{e.base ?? "—"}</Text>
                <Text style={s.celN}>{e.chapa}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.rodape} fixed>
          <Text>
            {d.congresso} · gerado em {d.geradoEm}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

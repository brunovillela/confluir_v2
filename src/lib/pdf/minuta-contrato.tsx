import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { CertificacaoPDF } from "@/lib/db/minuta-assinatura"

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
  certTitulo: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  certSub: { fontSize: 8, color: "#444444", marginBottom: 10 },
  certSecao: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  certBloco: { borderWidth: 0.5, borderColor: "#cccccc", borderRadius: 3, padding: 8, marginBottom: 8 },
  certLinha: { flexDirection: "row", fontSize: 8, marginBottom: 1.5 },
  certRotulo: { width: 110, color: "#555555" },
  certValor: { flex: 1 },
  mono: { fontFamily: "Courier", fontSize: 7.5 },
  trilha: { flexDirection: "row", fontSize: 7, color: "#333333", marginBottom: 1 },
  qr: { width: 64, height: 64 },
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
  certificacao = null,
}: {
  texto: string
  entidade: string | null
  subtitulo: string | null
  logo: string | null
  rodape: string
  /** true enquanto não finalizada: marca d'água "MINUTA". */
  minuta: boolean
  /** Assinaturas eletrônicas da rodada cujo hash é o do texto atual. */
  certificacao?: CertificacaoPDF | null
}) {
  const assinado = certificacao?.concluida === true
  const rodapeFinal = certificacao
    ? `${assinado ? "Assinado eletronicamente" : "Em assinatura eletrônica"} · SHA-256 ${certificacao.hash.slice(0, 16)}… · ${rodape}`
    : rodape
  const linhas = texto.split("\n")
  return (
    <Document title={rodape}>
      <Page size="A4" style={s.page}>
        {minuta && !assinado ? (
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
          <Text>{rodapeFinal}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      {certificacao ? (
        <Page size="A4" style={s.page}>
          <Text style={s.certTitulo}>Certificado de assinatura eletrônica</Text>
          <Text style={s.certSub}>
            {assinado
              ? "Documento assinado eletronicamente por todas as partes abaixo."
              : "Assinatura em andamento — o documento só produz efeito quando todos assinarem."}{" "}
            Cada assinatura foi confirmada por link individual e código de uso único enviados ao e-mail
            do assinante, com conferência do CPF digitado por ele e aceite expresso do conteúdo e da
            forma eletrônica (MP 2.200-2/2001, art. 10, § 2º). O resumo SHA-256 abaixo identifica o
            texto assinado: qualquer alteração o torna diferente.
          </Text>
          <View style={s.certLinha}>
            <Text style={s.certRotulo}>Documento</Text>
            <Text style={s.certValor}>{rodape}</Text>
          </View>
          <View style={s.certLinha}>
            <Text style={s.certRotulo}>SHA-256 do conteúdo</Text>
            <Text style={[s.certValor, s.mono]}>{certificacao.hash}</Text>
          </View>

          <Text style={s.certSecao}>Assinaturas</Text>
          {certificacao.assinantes.map((a, i) => (
            <View key={i} style={s.certBloco} wrap={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  {[
                    ["Papel", a.papel],
                    ["Nome declarado", a.nome],
                    ["CPF (conferido)", a.cpf],
                    ["E-mail", a.email],
                    ["Situação", a.situacao === "assinado" ? "Assinado" : a.situacao === "recusado" ? "Recusado" : "Pendente"],
                    ["Assinado em", a.assinadoEm ? `${a.assinadoEm} (horário de Brasília)` : "—"],
                    ["Endereço IP", a.ip ?? "—"],
                    ["Navegador", a.navegador ?? "—"],
                    ["Certificado", a.certificado],
                    ["Verificação", a.url || "—"],
                  ].map(([r, v]) => (
                    <View key={r} style={s.certLinha}>
                      <Text style={s.certRotulo}>{r}</Text>
                      <Text style={s.certValor}>{v}</Text>
                    </View>
                  ))}
                </View>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não aceita alt */}
                {a.qr ? <Image src={a.qr} style={s.qr} /> : null}
              </View>
              {a.trilha.length > 0 ? (
                <View style={{ marginTop: 4 }}>
                  {a.trilha.map((e, j) => (
                    <View key={j} style={s.trilha}>
                      <Text style={{ width: 120 }}>{e.quando}</Text>
                      <Text style={{ flex: 1 }}>{e.evento}</Text>
                      <Text style={{ width: 110 }}>{e.ip ?? ""}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          <View style={s.rodape} fixed>
            <Text>{rodapeFinal}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </View>
        </Page>
      ) : null}
    </Document>
  )
}

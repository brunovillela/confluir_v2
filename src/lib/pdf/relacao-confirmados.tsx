import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatarCnpjCpf, formatarTelefone } from "@/lib/formato"
import { caber } from "@/lib/pdf/medida-texto"

/**
 * Relação de confirmados de um evento (19/11/2026), para quem não acessa o
 * Confluir: portaria, hotel, buffet, credenciamento. Renderizada em
 * `/painel/eventos/[id]/confirmados/pdf`. Com `assinatura`, ganha a coluna
 * para colher a assinatura na porta. O desenho é o da relação de aptos.
 */

export type LinhaRelacaoConfirmados = {
  nome: string | null
  cpf: string | null
  telefone: string | null
  filiado: boolean
  convidado: boolean
}

const CM = 28.35
const LETRA = 9
const COL = { num: 28, cpf: 80, tel: 82, tipo: 62, assinatura: 150 }

const s = StyleSheet.create({
  conteudo: { lineHeight: 1.4 },
  page: { padding: CM * 1.5, paddingBottom: CM * 1.8, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 110, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 8 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 10, marginTop: 4, marginBottom: 10 },
  grade: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  tile: { width: "25%", paddingRight: 8, marginBottom: 6 },
  rotulo: { fontSize: 8.5, color: "#4b5563" },
  tileValor: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2.5, fontSize: LETRA },
  linhaAssinatura: { flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingTop: 10, paddingBottom: 3, fontSize: LETRA },
  cabecalho: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingVertical: 2.5, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  num: { width: COL.num, paddingRight: 4, textAlign: "right", color: "#6b7280" },
  nome: { flex: 1, paddingLeft: 2, paddingRight: 6 },
  cpf: { width: COL.cpf, paddingRight: 4 },
  tel: { width: COL.tel, paddingRight: 4 },
  tipo: { width: COL.tipo, paddingRight: 4 },
  assinatura: { width: COL.assinatura, borderBottomWidth: 0.5, borderColor: "#6b7280", marginLeft: 4 },
  assinaturaTitulo: { width: COL.assinatura, marginLeft: 4 },
  nota: { fontSize: 8.5, color: "#4b5563", marginTop: 6 },
  rodape: { position: "absolute", bottom: CM, left: CM * 1.5, right: CM * 1.5, fontSize: 8, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
})

function n(v: number): string {
  return v.toLocaleString("pt-BR")
}

function tipo(l: LinhaRelacaoConfirmados): string {
  if (l.convidado) return "Convidado"
  if (l.filiado) return "Filiado"
  return "—"
}

export function RelacaoConfirmadosPDF({
  entidade,
  logoDataUri,
  evento,
  quando,
  assinatura,
  linhas,
}: {
  entidade: string | null
  logoDataUri: string | null
  evento: string
  /** Data, horário e local, já em texto. */
  quando: string
  assinatura: boolean
  linhas: LinhaRelacaoConfirmados[]
}) {
  const gerado = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
  const filiados = linhas.filter((l) => l.filiado).length
  const convidados = linhas.filter((l) => l.convidado).length
  return (
    <Document title={`Confirmados — ${evento}`}>
      <Page size="A4" style={s.page}>
        <View style={s.conteudo}>
          {logoDataUri ? (
            <View style={s.logoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={s.logo} src={logoDataUri} />
            </View>
          ) : null}
          {entidade ? <Text style={s.org}>{entidade}</Text> : null}
          <Text style={s.titulo}>{assinatura ? "Lista de presença" : "Relação de confirmados"}</Text>
          <Text style={s.subtitulo}>{[evento, quando].filter(Boolean).join(" · ")}</Text>

          <View style={s.grade}>
            <View style={s.tile}>
              <Text style={s.rotulo}>Confirmados</Text>
              <Text style={s.tileValor}>{n(linhas.length)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.rotulo}>Filiados</Text>
              <Text style={s.tileValor}>{n(filiados)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.rotulo}>Convidados</Text>
              <Text style={s.tileValor}>{n(convidados)}</Text>
            </View>
          </View>

          <View style={s.cabecalho}>
            <Text style={s.num}>#</Text>
            <Text style={s.nome}>Nome</Text>
            <Text style={s.cpf}>CPF</Text>
            {assinatura ? null : <Text style={s.tel}>Telefone</Text>}
            <Text style={s.tipo}>Tipo</Text>
            {assinatura ? <Text style={s.assinaturaTitulo}>Assinatura</Text> : null}
          </View>
          {linhas.map((l, i) => (
            <View key={i} style={assinatura ? s.linhaAssinatura : s.linha} wrap={false}>
              <Text style={s.num}>{i + 1}</Text>
              {/* Nome quebra entre palavras, sem hifenizar. */}
              <Text style={s.nome} hyphenationCallback={(palavra) => [palavra]}>
                {l.nome ?? "—"}
              </Text>
              <Text style={s.cpf}>{l.cpf ? formatarCnpjCpf(l.cpf) : "—"}</Text>
              {assinatura ? null : <Text style={s.tel}>{caber(l.telefone ? formatarTelefone(l.telefone) : "—", COL.tel - 4, LETRA)}</Text>}
              <Text style={s.tipo}>{tipo(l)}</Text>
              {assinatura ? <View style={s.assinatura} /> : null}
            </View>
          ))}
          {linhas.length === 0 ? <Text style={s.nota}>Nenhuma inscrição confirmada ainda.</Text> : null}
        </View>

        <View style={s.rodape} fixed>
          <Text>Gerado pelo Confluir em {gerado}.</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

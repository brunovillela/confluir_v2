import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

import type { DadosAta } from "@/lib/db/votacao-mesarios"

/** Ata de um evento da urna (instalação/abertura/fechamento/encerramento/anomalia). */

const CM = 28.35

const TITULO: Record<string, string> = {
  instalacao: "ATA DE INSTALAÇÃO DA URNA",
  abertura: "ATA DE ABERTURA DOS TRABALHOS",
  fechamento: "ATA DE FECHAMENTO DO DIA",
  encerramento: "ATA DE ENCERRAMENTO DOS TRABALHOS",
  anomalia: "ATA DE REGISTRO DE ANOMALIA",
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function porExtenso(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}, às ${hora}`
}

const s = StyleSheet.create({
  page: { padding: CM, fontSize: 11, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.4 },
  logoBox: { alignItems: "center", marginBottom: 8 },
  logo: { width: 140, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12 },
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    marginTop: 14,
    marginBottom: 16,
  },
  linha: { marginBottom: 4 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  corpo: { marginTop: 12, marginBottom: 12, textAlign: "justify" },
  assinatura: { marginTop: 60, alignItems: "center" },
  linhaAssinatura: { borderTopWidth: 1, borderColor: "#111827", width: 260, marginBottom: 4 },
})

export function AtaPDF({
  dados,
  logoDataUri,
}: {
  dados: DadosAta
  logoDataUri: string | null
}) {
  const eleitorFrase =
    dados.tipo === "abertura" || dados.tipo === "instalacao"
      ? `Os trabalhos foram abertos na presença do primeiro eleitor, ${dados.primeiroEleitor ?? "—"}, que atestou que o lacre da boca da urna${dados.lacreBoca ? ` (nº ${dados.lacreBoca})` : ""} foi rompido e introduzido na boca da urna.`
      : null

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
        <Text style={s.titulo}>{TITULO[dados.tipo] ?? "ATA"}</Text>

        <Text style={s.linha}>
          <Text style={s.rotulo}>Urna: </Text>
          {dados.urna ?? "—"}
        </Text>
        {dados.assembleia ? (
          <Text style={s.linha}>
            <Text style={s.rotulo}>Assembleia: </Text>
            {dados.assembleia}
          </Text>
        ) : null}
        {dados.campanha ? (
          <Text style={s.linha}>
            <Text style={s.rotulo}>Campanha: </Text>
            {dados.campanha}
          </Text>
        ) : null}
        <Text style={s.linha}>
          <Text style={s.rotulo}>Data e hora: </Text>
          {porExtenso(dados.data)}
        </Text>

        <Text style={s.corpo}>
          {eleitorFrase}
          {eleitorFrase ? " " : ""}
          {dados.descricao ?? ""}
        </Text>

        <View style={s.assinatura}>
          <View style={s.linhaAssinatura} />
          <Text>Mesário responsável</Text>
        </View>
      </Page>
    </Document>
  )
}

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { DadosCarteirinha } from "@/lib/db/carteirinha"

/** Declaração de filiação (onda 4, F1): emitida pelo próprio filiado no portal. */

const CM = 28.35
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

function extenso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}
function cpfFormatado(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return "—"
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

const s = StyleSheet.create({
  page: { padding: CM * 2, fontSize: 11.5, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.6 },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 130, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12 },
  cnpj: { textAlign: "center", fontSize: 9, color: "#4b5563" },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 30, marginBottom: 24, letterSpacing: 1 },
  corpo: { textAlign: "justify", marginBottom: 14 },
  negrito: { fontFamily: "Helvetica-Bold" },
  data: { marginTop: 28, textAlign: "right" },
  verificacao: { marginTop: 40, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 0.5, borderColor: "#e5e7eb", paddingTop: 12 },
  qr: { width: 84, height: 84 },
  verTexto: { fontSize: 8.5, color: "#4b5563", flex: 1, lineHeight: 1.4 },
})

export function DeclaracaoFiliacaoPDF({
  dados,
  org,
  qrDataUri,
  emitidaEm,
}: {
  dados: DadosCarteirinha
  org: { nomeRazao: string | null; cnpjCpf: string | null; cidade: string | null; logoDataUri: string | null }
  qrDataUri: string | null
  emitidaEm: string
}) {
  const entidade = org.nomeRazao ?? dados.entidade
  return (
    <Document title={`Declaração de filiação — ${dados.nome}`}>
      <Page size="A4" style={s.page}>
        {org.logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={org.logoDataUri} />
          </View>
        ) : null}
        <Text style={s.org}>{entidade}</Text>
        {org.cnpjCpf ? <Text style={s.cnpj}>CNPJ {org.cnpjCpf}</Text> : null}

        <Text style={s.titulo}>DECLARAÇÃO DE FILIAÇÃO</Text>

        <Text style={s.corpo}>
          Declaramos, para os devidos fins, que <Text style={s.negrito}>{dados.nome}</Text>, inscrito(a) no CPF sob o nº{" "}
          <Text style={s.negrito}>{cpfFormatado(dados.cpf)}</Text>
          {dados.matricula ? (
            <>
              , matrícula sindical nº <Text style={s.negrito}>{dados.matricula}</Text>
            </>
          ) : null}
          , é filiado(a) a esta entidade{dados.desde ? ` desde ${extenso(dados.desde)}` : ""}, encontrando-se nesta data na condição{" "}
          <Text style={s.negrito}>“{dados.condicao ?? "—"}”</Text>
          {dados.fontes.length ? `, com vínculo em ${dados.fontes.join(", ")}` : ""}.
        </Text>
        <Text style={s.corpo}>
          Esta declaração foi emitida eletronicamente pelo(a) próprio(a) filiado(a) no portal da entidade e reflete a situação cadastral no
          momento da emissão. A autenticidade e a situação atual podem ser conferidas a qualquer tempo pelo código abaixo.
        </Text>

        <Text style={s.data}>
          {org.cidade ? `${org.cidade}, ` : ""}
          {extenso(emitidaEm)}
        </Text>

        <View style={s.verificacao}>
          {qrDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.qr} src={qrDataUri} />
          ) : null}
          <Text style={s.verTexto}>
            Verificação: {dados.urlVerificacao ?? "indisponível"}
            {"\n"}A página de verificação mostra a condição atual da filiação, sem outros dados pessoais.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

/**
 * Carta PERSONALIZADA de oposição à contribuição assistencial, gerada com os
 * dados do opositor. O trabalhador baixa, assina no gov.br e reenvia pela área
 * de oposição. Renderizada em /portal/oposicao/comprovante/[id]/carta.
 */

export type DadosCartaOposicao = {
  organizacao: string | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregador: string | null
  campanha: string | null
  detalhe: string | null
  declaracao: string | null
  protocolo: number | null
  data: string | null
}

const CM = 28.35

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function porExtenso(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function fmtCpf(cpf: string | null): string {
  if (!cpf) return "—"
  const s = cpf.replace(/\D/g, "")
  if (s.length !== 11) return cpf
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`
}

const s = StyleSheet.create({
  page: {
    paddingVertical: CM,
    paddingHorizontal: CM,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  logoBox: { alignItems: "center", marginBottom: 8 },
  logo: { width: 150, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12 },
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginTop: 18,
    marginBottom: 18,
  },
  corpo: { textAlign: "justify", marginBottom: 12 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  declaracao: {
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    padding: 10,
    marginVertical: 8,
    fontSize: 10,
  },
  protocolo: { marginTop: 10, fontSize: 10, color: "#374151" },
  local: { marginTop: 28 },
  assinatura: { marginTop: 56, alignItems: "center" },
  linhaAssinatura: {
    borderTopWidth: 1,
    borderColor: "#111827",
    width: 280,
    marginBottom: 4,
  },
  assinaturaNota: { fontSize: 9, color: "#6b7280", textAlign: "center" },
})

export function CartaOposicaoPDF({
  dados,
  logoDataUri,
}: {
  dados: DadosCartaOposicao
  logoDataUri: string | null
}) {
  const alvo = dados.detalhe || dados.campanha || "a contribuição assistencial"
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

        <Text style={s.titulo}>
          CARTA DE OPOSIÇÃO À CONTRIBUIÇÃO ASSISTENCIAL
        </Text>

        <Text style={s.corpo}>
          Eu, <Text style={s.rotulo}>{dados.nome ?? "—"}</Text>, inscrito(a) no
          CPF sob o nº <Text style={s.rotulo}>{fmtCpf(dados.cpf)}</Text>
          {dados.matricula ? `, matrícula ${dados.matricula}` : ""}, trabalhador(a)
          vinculado(a) à fonte pagadora{" "}
          <Text style={s.rotulo}>{dados.empregador ?? "—"}</Text>, venho, pela
          presente, manifestar de forma livre e expressa a minha{" "}
          <Text style={s.rotulo}>OPOSIÇÃO</Text> ao desconto de {alvo}
          {dados.campanha ? ` (${dados.campanha})` : ""}, nos termos da legislação
          vigente.
        </Text>

        {dados.declaracao ? (
          <Text style={s.declaracao}>{dados.declaracao}</Text>
        ) : null}

        <Text style={s.corpo}>
          Declaro estar ciente de que esta manifestação será encaminhada à
          entidade sindical e submetida à avaliação cabível.
        </Text>

        {dados.protocolo != null ? (
          <Text style={s.protocolo}>Protocolo: {dados.protocolo}</Text>
        ) : null}

        <Text style={s.local}>{porExtenso(dados.data)}.</Text>

        <View style={s.assinatura}>
          <View style={s.linhaAssinatura} />
          <Text style={s.assinaturaNota}>
            {dados.nome ?? "Assinatura do trabalhador"}
          </Text>
          <Text style={s.assinaturaNota}>
            Assine este documento eletronicamente no Assinador gov.br.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

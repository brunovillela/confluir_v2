import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Relação de oposições aceitas, por fonte pagadora (onda 2, C7): o
 * documento que a entidade manda ao RH para o desconto não ser feito. Sai
 * com a identificação da entidade, a campanha, a fonte e a lista numerada.
 * Os textos chegam prontos (datas no fuso de São Paulo, CPF com máscara).
 *
 * Sem `lineHeight` no estilo da Page: em documento longo o @react-pdf 4.5
 * quebra o contador de páginas (ver memória "armadilha-pdf-lineheight-page").
 */

export type LinhaRelacaoOposicao = {
  nome: string | null
  cpf: string | null
  matricula: string | null
  protocolo: number | null
  registradaEm: string | null
}

export type DadosRelacaoOposicao = {
  organizacao: string | null
  cnpj: string | null
  campanha: string | null
  detalhe: string | null
  prazo: string | null
  empregador: string
  empregadorCnpj: string | null
  emitidoEm: string
  emitidoPor: string | null
  linhas: LinhaRelacaoOposicao[]
}

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM * 1.5,
    paddingBottom: CM * 1.8,
    paddingHorizontal: CM * 1.6,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  logoBox: { alignItems: "center", marginBottom: 4 },
  logo: { width: 110, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11.5 },
  cnpj: { textAlign: "center", fontSize: 8.5, color: "#4b5563" },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12.5, marginTop: 14 },
  bloco: { marginTop: 10, marginBottom: 10 },
  par: { flexDirection: "row", paddingVertical: 1.5 },
  rotulo: { width: 110, color: "#4b5563" },
  valor: { flex: 1, fontFamily: "Helvetica-Bold" },
  texto: { marginBottom: 8 },
  cab: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 0.75,
    borderColor: "#9ca3af",
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
  },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 3 },
  cNum: { width: 28, paddingLeft: 3 },
  cNome: { flex: 1, paddingRight: 4 },
  cCpf: { width: 86 },
  cMat: { width: 70 },
  cProt: { width: 50 },
  cData: { width: 78 },
  total: { marginTop: 8, fontFamily: "Helvetica-Bold" },
  rodape: {
    position: "absolute",
    bottom: CM * 0.8,
    left: CM * 1.6,
    right: CM * 1.6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#6b7280",
  },
})

function Par({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <View style={s.par}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor ?? "—"}</Text>
    </View>
  )
}

export function RelacaoOposicaoPDF({ dados, logoDataUri }: { dados: DadosRelacaoOposicao; logoDataUri: string | null }) {
  const d = dados
  return (
    <Document title={`Relação de oposições — ${d.empregador}`} author={d.organizacao ?? undefined}>
      <Page size="A4" style={s.page}>
        {logoDataUri && (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
            <Image src={logoDataUri} style={s.logo} />
          </View>
        )}
        <Text style={s.org}>{d.organizacao ?? ""}</Text>
        {d.cnpj && <Text style={s.cnpj}>CNPJ {d.cnpj}</Text>}
        <Text style={s.titulo}>RELAÇÃO DE OPOSIÇÕES À CONTRIBUIÇÃO ASSISTENCIAL</Text>

        <View style={s.bloco}>
          <Par rotulo="Fonte pagadora" valor={d.empregador} />
          {d.empregadorCnpj && <Par rotulo="CNPJ" valor={d.empregadorCnpj} />}
          <Par rotulo="Campanha" valor={d.campanha} />
          {d.detalhe && <Par rotulo="Contribuição" valor={d.detalhe} />}
          {d.prazo && <Par rotulo="Prazo de oposição" valor={d.prazo} />}
        </View>

        <Text style={s.texto}>
          As pessoas abaixo registraram, no prazo, oposição à contribuição assistencial desta campanha, e a oposição
          foi aceita pela entidade. A contribuição não deve ser descontada da remuneração delas.
        </Text>

        <View style={s.cab} fixed>
          <Text style={s.cNum}>Nº</Text>
          <Text style={s.cNome}>Nome</Text>
          <Text style={s.cCpf}>CPF</Text>
          <Text style={s.cMat}>Matrícula</Text>
          <Text style={s.cProt}>Protocolo</Text>
          <Text style={s.cData}>Registrada em</Text>
        </View>
        {d.linhas.map((l, i) => (
          <View key={i} style={s.linha} wrap={false}>
            <Text style={s.cNum}>{i + 1}</Text>
            <Text style={s.cNome}>{l.nome ?? "—"}</Text>
            <Text style={s.cCpf}>{l.cpf ?? "—"}</Text>
            <Text style={s.cMat}>{l.matricula ?? "—"}</Text>
            <Text style={s.cProt}>{l.protocolo ?? "—"}</Text>
            <Text style={s.cData}>{l.registradaEm ?? "—"}</Text>
          </View>
        ))}
        <Text style={s.total}>Total: {d.linhas.length.toLocaleString("pt-BR")} oposição(ões).</Text>

        <View style={s.rodape} fixed>
          <Text>
            Emitida em {d.emitidoEm}
            {d.emitidoPor ? ` por ${d.emitidoPor}` : ""} · {d.organizacao ?? ""}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

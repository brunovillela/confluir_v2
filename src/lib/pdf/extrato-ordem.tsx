import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

/**
 * Extrato imprimível de uma ordem de pagamento (@react-pdf/renderer).
 * Logo do sindicato (tenant) no cabeçalho; as palavras "Nota fiscal" e
 * "Boleto" viram links clicáveis no PDF quando o arquivo existir.
 * Renderizado no route handler `/painel/financeiro/ordens/[id]/extrato`.
 */

// 1 cm ≈ 28.35 pt
const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM,
    paddingBottom: 72,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    paddingBottom: 10,
    marginBottom: 16,
  },
  logo: { width: 120, objectFit: "contain" },
  org: { flex: 1, marginLeft: 12 },
  orgNome: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  orgCnpj: { color: "#555555", fontSize: 8, marginTop: 2 },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 2 },
  subtitulo: { color: "#555555", fontSize: 9, marginBottom: 14 },
  secaoTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 12,
    marginBottom: 6,
    color: "#091747",
  },
  grade: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", marginBottom: 8, paddingRight: 8 },
  campoLargo: { width: "100%", marginBottom: 8 },
  rotulo: { color: "#777777", fontSize: 7.5, marginBottom: 1 },
  valor: { fontSize: 10 },
  link: { color: "#1d4ed8", textDecoration: "underline" },
  vazio: { color: "#999999" },
  rodape: {
    position: "absolute",
    bottom: CM,
    left: CM,
    right: CM,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    paddingTop: 6,
    fontSize: 7.5,
    color: "#555555",
    textAlign: "center",
  },
})

export type ExtratoOrdemProps = {
  org: {
    nomeRazao: string | null
    nomeFantasia: string | null
    cnpjCpf: string | null
  }
  logoDataUri: string | null
  geradoEm: string
  ordem: {
    codigo: string
    descricao: string
    tipo: string
    situacao: string
    favorecido: string
    valorCobrado: string
    valorPago: string
    vencimento: string
    dataPagamento: string
    formaPagamento: string
    pagador: string
    autorizacao: string
    autorizador: string
    centroDespesa: string | null
    centroReceita: string | null
    contrato: { rotulo: string; titulo: string; vigencia: string } | null
    projeto: { descricao: string; periodo: string; tipo: string } | null
    compraObservacao: string | null
    notaFiscalUrl: string | null
    boletoUrl: string | null
    comprovanteUrl: string | null
  }
}

function Campo({
  rotulo,
  valor,
  largo,
}: {
  rotulo: string
  valor: string
  largo?: boolean
}) {
  return (
    <View style={largo ? s.campoLargo : s.campo}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor || "—"}</Text>
    </View>
  )
}

function CampoArquivo({
  rotulo,
  url,
}: {
  rotulo: string
  url: string | null
}) {
  return (
    <View style={s.campo}>
      <Text style={s.rotulo}>Documento</Text>
      {url ? (
        <Link src={url} style={[s.valor, s.link]}>
          {rotulo}
        </Link>
      ) : (
        <Text style={[s.valor, s.vazio]}>{rotulo} — não anexado</Text>
      )}
    </View>
  )
}

export function ExtratoOrdemPDF({
  org,
  logoDataUri,
  geradoEm,
  ordem,
}: ExtratoOrdemProps) {
  const razao = org.nomeRazao ?? org.nomeFantasia ?? ""
  return (
    <Document title={`Extrato — ordem ${ordem.codigo}`} author={razao}>
      <Page size="A4" style={s.page}>
        <View style={s.cabecalho}>
          {logoDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={logoDataUri} />
          ) : null}
          <View style={s.org}>
            <Text style={s.orgNome}>{razao || "—"}</Text>
            {org.cnpjCpf ? (
              <Text style={s.orgCnpj}>CNPJ/CPF: {org.cnpjCpf}</Text>
            ) : null}
          </View>
        </View>

        <Text style={s.titulo}>Ordem de pagamento {ordem.codigo}</Text>
        <Text style={s.subtitulo}>
          {ordem.tipo} · {ordem.situacao}
        </Text>

        <Text style={s.secaoTitulo}>Despesa</Text>
        <View style={s.grade}>
          <Campo rotulo="Descrição" valor={ordem.descricao} largo />
          <Campo rotulo="Favorecido" valor={ordem.favorecido} />
          <Campo rotulo="Tipo" valor={ordem.tipo} />
          <Campo rotulo="Valor cobrado" valor={ordem.valorCobrado} />
          <Campo rotulo="Valor pago" valor={ordem.valorPago} />
          <CampoArquivo rotulo="Nota fiscal" url={ordem.notaFiscalUrl} />
          <CampoArquivo rotulo="Boleto" url={ordem.boletoUrl} />
          {ordem.compraObservacao ? (
            <Campo
              rotulo="Observação da compra"
              valor={ordem.compraObservacao}
              largo
            />
          ) : null}
        </View>

        <Text style={s.secaoTitulo}>Pagamento</Text>
        <View style={s.grade}>
          <Campo rotulo="Vencimento" valor={ordem.vencimento} />
          <Campo rotulo="Data do pagamento" valor={ordem.dataPagamento} />
          <Campo rotulo="Forma de pagamento" valor={ordem.formaPagamento} />
          <Campo rotulo="Pagador" valor={ordem.pagador} />
          <Campo rotulo="Autorização" valor={ordem.autorizacao} />
          <Campo rotulo="Autorizador" valor={ordem.autorizador} />
          <CampoArquivo
            rotulo="Comprovante de pagamento"
            url={ordem.comprovanteUrl}
          />
        </View>

        <Text style={s.secaoTitulo}>Classificação contábil</Text>
        <View style={s.grade}>
          <Campo
            rotulo="Centro de custo — despesa"
            valor={ordem.centroDespesa ?? "—"}
          />
          <Campo
            rotulo="Centro de custo — receita"
            valor={ordem.centroReceita ?? "—"}
          />
        </View>

        {ordem.contrato ? (
          <>
            <Text style={s.secaoTitulo}>
              Contrato vinculado — {ordem.contrato.rotulo}
            </Text>
            <View style={s.grade}>
              <Campo rotulo="Objeto" valor={ordem.contrato.titulo} largo />
              <Campo rotulo="Vigência" valor={ordem.contrato.vigencia} />
            </View>
          </>
        ) : null}

        {ordem.projeto ? (
          <>
            <Text style={s.secaoTitulo}>Projeto vinculado</Text>
            <View style={s.grade}>
              <Campo rotulo="Descrição" valor={ordem.projeto.descricao} largo />
              <Campo rotulo="Tipo" valor={ordem.projeto.tipo} />
              <Campo rotulo="Período" valor={ordem.projeto.periodo} />
            </View>
          </>
        ) : null}

        <Text style={s.rodape} fixed>
          {razao}
          {org.cnpjCpf ? ` — CNPJ/CPF ${org.cnpjCpf}` : ""} · Extrato gerado em{" "}
          {geradoEm}
        </Text>
      </Page>
    </Document>
  )
}

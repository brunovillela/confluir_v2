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
 * Extrato de AUDITORIA de uma ordem de pagamento (@react-pdf/renderer): tudo o
 * que permite auditar a ordem, interna ou externamente — procedência, despesa,
 * favorecido, classificação (crédito da despesa e débito), autorização,
 * recebimento, pagamento, documentos, auditoria automática e a trilha. O
 * código de verificação (SHA-256 dos dados essenciais) sai em toda página.
 * Renderizado no route handler `/painel/financeiro/ordens/[id]/extrato`.
 */

const CM = 28.35

const COR_STATUS: Record<string, string> = {
  ok: "#15803d",
  alerta: "#b45309",
  falha: "#b91c1c",
  pendente: "#1d4ed8",
  na: "#6b7280",
}
const ROTULO_STATUS: Record<string, string> = {
  ok: "OK",
  alerta: "ALERTA",
  falha: "FALHA",
  pendente: "PENDENTE",
  na: "N/A",
}

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM,
    paddingBottom: 64,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    paddingBottom: 8,
    marginBottom: 12,
  },
  logo: { width: 110, objectFit: "contain" },
  org: { flex: 1, marginLeft: 12 },
  orgNome: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  orgCnpj: { color: "#555555", fontSize: 8, marginTop: 2 },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  faixa: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    marginBottom: 6,
    fontSize: 8.5,
    color: "#374151",
  },
  faixaItem: { marginRight: 14 },
  selo: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  secaoTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 10,
    marginBottom: 5,
    paddingBottom: 2,
    color: "#091747",
    borderBottomWidth: 0.5,
    borderBottomColor: "#c7cbe0",
  },
  grade: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", marginBottom: 6, paddingRight: 8 },
  campoLargo: { width: "100%", marginBottom: 6 },
  rotulo: { color: "#6b7280", fontSize: 7, marginBottom: 1 },
  valor: { fontSize: 9 },
  link: { color: "#1d4ed8", textDecoration: "underline" },
  vazio: { color: "#9ca3af" },
  linhaTabela: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 3,
  },
  status: { width: 58, fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  aud: { flex: 1 },
  audRotulo: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  audDetalhe: { color: "#4b5563", fontSize: 8 },
  quando: { width: 96, fontSize: 8, color: "#374151" },
  rodape: {
    position: "absolute",
    bottom: CM * 0.8,
    left: CM,
    right: CM,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    paddingTop: 5,
    fontSize: 7,
    color: "#555555",
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

export type ExtratoOrdemProps = {
  org: { nomeRazao: string | null; nomeFantasia: string | null; cnpjCpf: string | null }
  logoDataUri: string | null
  geradoEm: string
  codigoVerificacao: string
  ordem: {
    codigo: string
    descricao: string
    tipo: string
    situacao: string
    valorCobrado: string
    vencimento: string
    formaPagamento: string
    pagoCom: string | null
    pixCodigo: string | null
    projeto: string | null
  }
  procedencia: {
    origem: string
    titulo: string | null
    linhas: { rotulo: string; valor: string }[]
    pessoas: { papel: string; nome: string }[]
  }
  favorecido: { nome: string; documento: string | null; tipo: string | null }
  classificacao: {
    despesa: string | null
    debito: string | null
    rateio: { conta: string; descricao: string | null; valor: string }[]
  }
  autorizacao: { texto: string; observacao: string | null; cancelamento: string | null }
  recebimento: string | null
  pagamento: {
    valorPago: string
    data: string
    pagador: string
    comprovanteUrl: string | null
    registrado: boolean
  }
  documentos: { rotulo: string; url: string | null }[]
  auditoria: {
    geral: string
    itens: { status: string; rotulo: string; detalhe: string }[]
  }
  historico: { quando: string; rotulo: string; usuario: string | null; descricao: string | null }[]
  /** Regras conferidas na criação (configuração do tenant). */
  verificacoes: { status: string; rotulo: string; detalhe: string }[]
}

function Campo({ rotulo, valor, largo }: { rotulo: string; valor: string | null; largo?: boolean }) {
  return (
    <View style={largo ? s.campoLargo : s.campo} wrap={false}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={valor ? s.valor : [s.valor, s.vazio]}>{valor || "—"}</Text>
    </View>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={s.secaoTitulo} minPresenceAhead={90}>
        {titulo}
      </Text>
      {children}
    </View>
  )
}

/**
 * Seção em lista: o título fica preso à PRIMEIRA linha (nunca sozinho no pé
 * da página); cada linha também não se parte entre páginas.
 */
function SecaoLista({
  titulo,
  linhas,
  vazio,
}: {
  titulo: string
  linhas: React.ReactNode[]
  vazio: string
}) {
  const [primeira, ...resto] = linhas
  return (
    <View>
      <View wrap={false}>
        <Text style={s.secaoTitulo}>{titulo}</Text>
        {primeira ?? <Text style={s.vazio}>{vazio}</Text>}
      </View>
      {resto.map((l, i) => (
        <View key={i} wrap={false}>
          {l}
        </View>
      ))}
    </View>
  )
}

export function ExtratoOrdemPDF(p: ExtratoOrdemProps) {
  const razao = p.org.nomeRazao ?? p.org.nomeFantasia ?? ""
  const corGeral = COR_STATUS[p.auditoria.geral] ?? "#111827"
  return (
    <Document title={`Extrato — ordem ${p.ordem.codigo}`} author={razao}>
      <Page size="A4" style={s.page}>
        <View style={s.cabecalho}>
          {p.logoDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={p.logoDataUri} />
          ) : null}
          <View style={s.org}>
            <Text style={s.orgNome}>{razao || "—"}</Text>
            {p.org.cnpjCpf ? <Text style={s.orgCnpj}>CNPJ/CPF: {p.org.cnpjCpf}</Text> : null}
          </View>
        </View>

        <Text style={s.titulo}>Ordem de pagamento {p.ordem.codigo}</Text>
        <View style={s.faixa}>
          <Text style={s.faixaItem}>Situação: {p.ordem.situacao}</Text>
          <Text style={s.faixaItem}>Origem: {p.procedencia.origem}</Text>
          <Text style={s.faixaItem}>Valor: {p.ordem.valorCobrado}</Text>
          <Text style={s.faixaItem}>Informações até {p.geradoEm}</Text>
        </View>
        <Text style={[s.selo, { color: corGeral, borderColor: corGeral }]}>
          Auditoria automática: {ROTULO_STATUS[p.auditoria.geral] ?? p.auditoria.geral}
        </Text>

        <Secao titulo="Procedência">
          <View style={s.grade}>
            <Campo rotulo="Origem" valor={p.procedencia.origem} />
            <Campo rotulo="Registro de origem" valor={p.procedencia.titulo} />
            {p.procedencia.linhas.map((l) => (
              <Campo key={l.rotulo} rotulo={l.rotulo} valor={l.valor} largo={l.valor.length > 60} />
            ))}
            {p.procedencia.pessoas.map((x) => (
              <Campo key={x.papel + x.nome} rotulo={x.papel} valor={x.nome} />
            ))}
          </View>
        </Secao>

        <Secao titulo="Despesa">
          <View style={s.grade}>
            <Campo rotulo="Descrição" valor={p.ordem.descricao} largo />
            <Campo rotulo="Tipo" valor={p.ordem.tipo} />
            <Campo rotulo="Valor da cobrança" valor={p.ordem.valorCobrado} />
            <Campo rotulo="Vencimento" valor={p.ordem.vencimento} />
            <Campo rotulo="Forma de pagamento" valor={p.ordem.formaPagamento} />
            {p.ordem.pagoCom ? <Campo rotulo="Pago com" valor={p.ordem.pagoCom} largo /> : null}
            {p.ordem.pixCodigo ? <Campo rotulo="Código/chave Pix" valor={p.ordem.pixCodigo} largo /> : null}
            {p.ordem.projeto ? <Campo rotulo="Projeto" valor={p.ordem.projeto} largo /> : null}
          </View>
        </Secao>

        <Secao titulo="Favorecido">
          <View style={s.grade}>
            <Campo rotulo="Nome" valor={p.favorecido.nome} />
            <Campo rotulo="CPF/CNPJ" valor={p.favorecido.documento} />
            <Campo rotulo="Natureza" valor={p.favorecido.tipo} />
          </View>
        </Secao>

        <Secao titulo="Classificação contábil">
          <View style={s.grade}>
            <Campo rotulo="Centro de custo da despesa (crédito)" valor={p.classificacao.despesa} />
            <Campo rotulo="Centro de custo do débito (de onde saiu)" valor={p.classificacao.debito} />
          </View>
          {p.classificacao.rateio.length > 0 ? (
            <View>
              <Text style={s.rotulo}>Rateio da despesa</Text>
              {p.classificacao.rateio.map((r, i) => (
                <View key={i} style={s.linhaTabela}>
                  <Text style={{ flex: 1 }}>
                    {r.conta}
                    {r.descricao ? ` — ${r.descricao}` : ""}
                  </Text>
                  <Text>{r.valor}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Secao>

        <Secao titulo="Autorização">
          <View style={s.grade}>
            <Campo rotulo="Resultado" valor={p.autorizacao.texto} largo />
            {p.autorizacao.observacao ? (
              <Campo rotulo="Observação do avaliador" valor={p.autorizacao.observacao} largo />
            ) : null}
            {p.autorizacao.cancelamento ? (
              <Campo rotulo="Cancelamento" valor={p.autorizacao.cancelamento} largo />
            ) : null}
          </View>
        </Secao>

        {p.recebimento ? (
          <Secao titulo="Recebimento">
            <Campo rotulo="Situação" valor={p.recebimento} largo />
          </Secao>
        ) : null}

        <Secao titulo="Pagamento">
          {p.pagamento.registrado ? (
            <View style={s.grade}>
              <Campo rotulo="Valor pago" valor={p.pagamento.valorPago} />
              <Campo rotulo="Data" valor={p.pagamento.data} />
              <Campo rotulo="Registrado por" valor={p.pagamento.pagador} />
              <Campo rotulo="Centro de custo do débito" valor={p.classificacao.debito} />
            </View>
          ) : (
            <Text style={s.vazio}>Pagamento ainda não registrado.</Text>
          )}
        </Secao>

        <Secao titulo="Documentos">
          <View style={s.grade}>
            {p.documentos.map((d) => (
              <View key={d.rotulo} style={s.campo} wrap={false}>
                <Text style={s.rotulo}>{d.rotulo}</Text>
                {d.url ? (
                  <Link src={d.url} style={[s.valor, s.link]}>
                    Abrir documento
                  </Link>
                ) : (
                  <Text style={[s.valor, s.vazio]}>Não anexado</Text>
                )}
              </View>
            ))}
          </View>
          <Text style={[s.rotulo, { marginTop: 2 }]}>
            Os links dos documentos valem por 1 hora a partir da geração do extrato.
          </Text>
        </Secao>

        {p.verificacoes.length > 0 ? (
          <SecaoLista
            titulo="Verificações na criação (regras do Financeiro)"
            vazio=""
            linhas={p.verificacoes.map((i) => (
              <View key={i.rotulo} style={s.linhaTabela}>
                <Text style={[s.status, { color: COR_STATUS[i.status] ?? "#111827" }]}>
                  {ROTULO_STATUS[i.status] ?? i.status}
                </Text>
                <View style={s.aud}>
                  <Text style={s.audRotulo}>{i.rotulo}</Text>
                  <Text style={s.audDetalhe}>{i.detalhe}</Text>
                </View>
              </View>
            ))}
          />
        ) : null}

        <SecaoLista
          titulo="Auditoria automática"
          vazio="Sem verificações."
          linhas={p.auditoria.itens.map((i) => (
            <View key={i.rotulo} style={s.linhaTabela}>
              <Text style={[s.status, { color: COR_STATUS[i.status] ?? "#111827" }]}>
                {ROTULO_STATUS[i.status] ?? i.status}
              </Text>
              <View style={s.aud}>
                <Text style={s.audRotulo}>{i.rotulo}</Text>
                <Text style={s.audDetalhe}>{i.detalhe}</Text>
              </View>
            </View>
          ))}
        />

        <SecaoLista
          titulo="Histórico da ordem"
          vazio="Sem eventos registrados."
          linhas={p.historico.map((h, i) => (
            <View key={i} style={s.linhaTabela}>
              <Text style={s.quando}>{h.quando}</Text>
              <View style={s.aud}>
                <Text style={s.audRotulo}>
                  {h.rotulo}
                  {h.usuario ? ` — ${h.usuario}` : ""}
                </Text>
                {h.descricao ? <Text style={s.audDetalhe}>{h.descricao}</Text> : null}
              </View>
            </View>
          ))}
        />

        <View style={s.rodape} fixed>
          <Text>
            {razao}
            {p.org.cnpjCpf ? ` — CNPJ/CPF ${p.org.cnpjCpf}` : ""} · gerado em {p.geradoEm}
          </Text>
          <Text>Código de verificação {p.codigoVerificacao}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

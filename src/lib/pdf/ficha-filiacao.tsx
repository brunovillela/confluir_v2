import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

import { formatarCpf } from "@/lib/cpf"
import { formatarData } from "@/lib/formato"
import type { SolicitacaoPublica } from "@/lib/db/filiacao-publica"

/**
 * Documento PDF da ficha de filiação preenchida (@react-pdf/renderer). Renderizado
 * server-side no route handler `/ficha/[token]/pdf`. O aspirante baixa, assina no
 * Assinador gov.br e sobe o PDF assinado. Cabeçalho/rodapé isolados para depois
 * reaproveitar no PDF dos ofícios.
 */

const NAVY = "#091747"
const LARANJA = "#FF5722"
const CINZA = "#6b7280"

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: LARANJA,
    paddingBottom: 12,
    marginBottom: 18,
  },
  logo: { width: 46, height: 46, objectFit: "contain" },
  orgNome: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY },
  orgSub: { fontSize: 9, color: CINZA, marginTop: 2 },
  titulo: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 2,
  },
  subtitulo: { fontSize: 9, color: CINZA, marginBottom: 16 },
  secao: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 3,
  },
  linha: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", marginBottom: 8, paddingRight: 10 },
  campoLargo: { width: "100%", marginBottom: 8 },
  rotulo: { fontSize: 8, color: CINZA, marginBottom: 2 },
  valor: { fontSize: 10 },
  aceite: { flexDirection: "row", marginBottom: 4, gap: 5 },
  aceiteMarca: { fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY },
  assinatura: {
    marginTop: 26,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  assinaturaNota: { fontSize: 9, color: CINZA },
  rodape: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 6,
    fontSize: 8,
    color: CINZA,
  },
})

export type OrgPdf = {
  nomeRazao: string | null
  nomeFantasia: string | null
  cnpjCpf: string | null
  /** Data URI (png/jpg) do logo já resolvido no route handler; null se ausente. */
  logoDataUri: string | null
}

function Campo({
  rotulo,
  valor,
  largo,
}: {
  rotulo: string
  valor: string | null
  largo?: boolean
}) {
  return (
    <View style={largo ? s.campoLargo : s.campo}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor && valor.trim() ? valor : "—"}</Text>
    </View>
  )
}

export function FichaFiliacaoPDF({
  dados,
  org,
  termos,
}: {
  dados: SolicitacaoPublica
  org: OrgPdf
  /** Textos legais aceitos (desconto e LGPD); null cai no texto genérico. */
  termos?: { desconto: string | null; lgpd: string | null }
}) {
  const orgNome = org.nomeFantasia ?? org.nomeRazao ?? "Sindicato"
  const endereco =
    [
      [dados.endereco_logradouro, dados.endereco_numero]
        .filter(Boolean)
        .join(", "),
      dados.endereco_complemento,
      dados.endereco_bairro,
      [dados.endereco_cidade, dados.endereco_estado].filter(Boolean).join("/"),
      dados.endereco_cep ? `CEP ${dados.endereco_cep}` : null,
    ]
      .filter(Boolean)
      .join(" — ") || null

  return (
    <Document
      title={`Ficha de filiação — ${dados.nome ?? ""}`}
      author={orgNome}
    >
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {org.logoDataUri ? (
            // O <Image> do @react-pdf/renderer não aceita alt (não é <img> DOM).
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={org.logoDataUri} />
          ) : null}
          <View>
            <Text style={s.orgNome}>{orgNome}</Text>
            {org.cnpjCpf ? (
              <Text style={s.orgSub}>CNPJ {org.cnpjCpf}</Text>
            ) : null}
          </View>
        </View>

        <Text style={s.titulo}>Ficha de Filiação Sindical</Text>
        <Text style={s.subtitulo}>
          {dados.protocolo ? `Protocolo nº ${dados.protocolo} · ` : ""}
          Emitida em {formatarData(dados.created_at)}
        </Text>

        <Text style={s.secao}>Dados pessoais</Text>
        <View style={s.linha}>
          <Campo rotulo="Nome completo" valor={dados.nome} largo />
          {dados.nome_social ? (
            <Campo rotulo="Nome social" valor={dados.nome_social} largo />
          ) : null}
          <Campo rotulo="CPF" valor={dados.cpf ? formatarCpf(dados.cpf) : null} />
          <Campo
            rotulo="Nascimento"
            valor={dados.nascimento ? formatarData(dados.nascimento) : null}
          />
          <Campo rotulo="Sexo" valor={dados.sexo} />
        </View>

        <Text style={s.secao}>Contato</Text>
        <View style={s.linha}>
          <Campo rotulo="E-mail" valor={dados.email} largo />
          <Campo
            rotulo="Telefone principal"
            valor={
              dados.telefone_1
                ? `${dados.telefone_1}${dados.telefone_1_whatsapp ? " (WhatsApp)" : ""}`
                : null
            }
          />
          <Campo rotulo="Telefone alternativo" valor={dados.telefone_2} />
        </View>

        <Text style={s.secao}>Endereço</Text>
        <View style={s.linha}>
          <Campo rotulo="Endereço" valor={endereco} largo />
        </View>

        <Text style={s.secao}>Vínculo empregatício</Text>
        <View style={s.linha}>
          <Campo rotulo="Empregador (fonte pagadora)" valor={dados.empregadorNome} largo />
          <Campo rotulo="Matrícula" valor={dados.matricula} />
          <Campo rotulo="Cargo" valor={dados.cargo} />
          <Campo rotulo="Lotação" valor={dados.lotacao} largo />
        </View>

        <Text style={s.secao}>Declarações</Text>
        <View style={s.aceite}>
          <Text style={s.aceiteMarca}>[X]</Text>
          <Text style={s.valor}>
            {termos?.desconto ??
              `Solicito minha filiação ao ${orgNome} e autorizo o desconto da mensalidade sindical em folha de pagamento.`}
          </Text>
        </View>
        <View style={s.aceite}>
          <Text style={s.aceiteMarca}>[X]</Text>
          <Text style={s.valor}>
            {termos?.lgpd ??
              "Autorizo o tratamento dos meus dados pessoais para os fins da filiação, conforme a Lei Geral de Proteção de Dados (LGPD)."}
          </Text>
        </View>

        <View style={s.assinatura}>
          <Text style={s.assinaturaNota}>
            Assinatura digital: assine este documento no Assinador do gov.br
            (assinador.iti.br) e envie o PDF assinado pelo link recebido no seu
            e-mail. A assinatura eletrônica avançada tem validade legal.
          </Text>
        </View>

        <View style={s.rodape} fixed>
          <Text>{orgNome}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

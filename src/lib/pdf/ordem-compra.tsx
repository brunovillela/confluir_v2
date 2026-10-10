import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { DadosOrdemCompra } from "@/lib/db/ordem-compra"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

/**
 * Ordem de compra (pedido ao fornecedor) — gerada por fornecimento do
 * processo de compra, para baixar ou enviar por e-mail ao fornecedor.
 */

const CM = 28.35

const s = StyleSheet.create({
  page: { paddingTop: CM, paddingHorizontal: CM * 1.2, paddingBottom: CM * 1.3, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingBottom: 10, marginBottom: 14 },
  marca: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 330 },
  logo: { width: 54, height: 54, objectFit: "contain" },
  org: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  orgSub: { fontSize: 8, color: "#4b5563", marginTop: 1.5 },
  caixaNumero: { alignItems: "flex-end" },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#091747" },
  numero: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  meta: { fontSize: 8, color: "#4b5563", marginTop: 2 },
  duas: { flexDirection: "row", gap: 12, marginBottom: 12 },
  bloco: { flex: 1, borderWidth: 0.6, borderColor: "#d1d5db", borderRadius: 3, padding: 8 },
  blocoTitulo: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#FF5722", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  linha: { marginBottom: 3 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  secao: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#FF5722", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4, marginBottom: 5 },
  tabela: { borderWidth: 0.6, borderColor: "#d1d5db", borderRadius: 3, marginBottom: 12 },
  tCab: { flexDirection: "row", backgroundColor: "#eef1f6", borderBottomWidth: 0.6, borderBottomColor: "#d1d5db" },
  tLinha: { flexDirection: "row" },
  cDesc: { flex: 1, padding: 6 },
  cQtd: { width: 70, padding: 6, textAlign: "right" },
  cValor: { width: 100, padding: 6, textAlign: "right" },
  forte: { fontFamily: "Helvetica-Bold" },
  total: { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 0.6, borderTopColor: "#d1d5db" },
  parcela: { flexDirection: "row", gap: 10, marginBottom: 2 },
  aviso: { marginTop: 10, fontSize: 8.5, color: "#374151", lineHeight: 1.4, textAlign: "justify" },
  assinatura: { marginTop: 34, alignItems: "center" },
  assinaturaLinha: { borderTopWidth: 0.8, borderTopColor: "#111827", width: 260, marginBottom: 3 },
  assinaturaNome: { fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: 16, left: CM * 1.2, right: CM * 1.2, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#6b7280" },
})

function brl(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function OrdemCompraPDF({ dados: d }: { dados: DadosOrdemCompra }) {
  const entrega = d.entrega.noAto
    ? "No ato da compra (retirada/entrega imediata)."
    : [
        d.entrega.local ? `Local: ${d.entrega.local}` : "Local: a combinar com a entidade",
        d.entrega.ate ? `prazo até ${formatarData(d.entrega.ate)}` : null,
        d.entrega.prevista ? `previsão informada pelo fornecedor: ${formatarData(d.entrega.prevista)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
  return (
    <Document title={`Ordem de compra nº ${d.numero}`} author={d.entidade.nome}>
      <Page size="A4" style={s.page}>
        <View style={s.topo}>
          <View style={s.marca}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não aceita alt */}
            {d.entidade.logo ? <Image src={d.entidade.logo} style={s.logo} /> : null}
            <View>
              <Text style={s.org}>{d.entidade.nome}</Text>
              {d.entidade.cnpj ? <Text style={s.orgSub}>CNPJ {formatarCnpjCpf(d.entidade.cnpj)}</Text> : null}
              {d.entidade.endereco ? <Text style={s.orgSub}>{d.entidade.endereco}</Text> : null}
              {d.entidade.telefones || d.entidade.email ? (
                <Text style={s.orgSub}>{[d.entidade.telefones, d.entidade.email].filter(Boolean).join(" · ")}</Text>
              ) : null}
            </View>
          </View>
          <View style={s.caixaNumero}>
            <Text style={s.titulo}>ORDEM DE COMPRA</Text>
            <Text style={s.numero}>Nº {d.numero}</Text>
            <Text style={s.meta}>Emitida em {formatarData(d.emitidaEm)}</Text>
            {d.processoCodigo ? <Text style={s.meta}>Processo {d.processoCodigo}</Text> : null}
          </View>
        </View>

        <View style={s.duas}>
          <View style={s.bloco}>
            <Text style={s.blocoTitulo}>Fornecedor</Text>
            <Text style={[s.linha, s.forte]}>{d.fornecedor.nome}</Text>
            {d.fornecedor.razao ? <Text style={s.linha}>{d.fornecedor.razao}</Text> : null}
            <Text style={s.linha}>
              <Text style={s.rotulo}>{(d.fornecedor.documento ?? "").replace(/\D/g, "").length === 11 ? "CPF: " : "CNPJ: "}</Text>
              {d.fornecedor.documento ? formatarCnpjCpf(d.fornecedor.documento) : "—"}
            </Text>
            {d.fornecedor.endereco ? <Text style={s.linha}>{d.fornecedor.endereco}</Text> : null}
            {d.fornecedor.email ? <Text style={s.linha}>{d.fornecedor.email}</Text> : null}
          </View>
          <View style={s.bloco}>
            <Text style={s.blocoTitulo}>Faturar para</Text>
            <Text style={[s.linha, s.forte]}>{d.entidade.nome}</Text>
            <Text style={s.linha}>
              <Text style={s.rotulo}>CNPJ: </Text>
              {d.entidade.cnpj ? formatarCnpjCpf(d.entidade.cnpj) : "—"}
            </Text>
            {d.entidade.endereco ? <Text style={s.linha}>{d.entidade.endereco}</Text> : null}
            {d.departamento ? (
              <Text style={s.linha}>
                <Text style={s.rotulo}>Departamento solicitante: </Text>
                {d.departamento}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={s.secao}>{d.tipo === "Prestação de serviço" ? "Serviço contratado" : "Itens"}</Text>
        <View style={s.tabela}>
          <View style={s.tCab}>
            <Text style={[s.cDesc, s.forte]}>Descrição</Text>
            <Text style={[s.cQtd, s.forte]}>Quantidade</Text>
            <Text style={[s.cValor, s.forte]}>Valor</Text>
          </View>
          <View style={s.tLinha}>
            <Text style={s.cDesc}>{d.descricao ?? "—"}</Text>
            <Text style={s.cQtd}>{d.quantidade ?? "—"}</Text>
            <Text style={s.cValor}>{brl(d.valor)}</Text>
          </View>
          <View style={s.total}>
            <Text style={[s.cDesc, s.forte, { textAlign: "right" }]}>Total da ordem de compra</Text>
            <Text style={[s.cValor, s.forte]}>{brl(d.valor)}</Text>
          </View>
        </View>

        <View style={s.duas}>
          <View style={s.bloco}>
            <Text style={s.blocoTitulo}>Pagamento</Text>
            <Text style={s.linha}>
              <Text style={s.rotulo}>Forma: </Text>
              {d.formaPagamento ?? "a combinar"}
            </Text>
            {d.pagamentos.length > 0 ? (
              <>
                <Text style={[s.linha, s.rotulo]}>Parcelas</Text>
                {d.pagamentos.map((p, i) => (
                  <View key={i} style={s.parcela}>
                    <Text>{i + 1}.</Text>
                    <Text>{brl(p.valor)}</Text>
                    <Text>{p.vencimento ? `vence ${formatarData(p.vencimento)}` : "vencimento a combinar"}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {d.proposta ? (
              <Text style={s.linha}>
                Conforme proposta{d.proposta.data ? ` de ${formatarData(d.proposta.data)}` : ""}
                {d.proposta.valor != null ? ` (${brl(d.proposta.valor)})` : ""}.
              </Text>
            ) : null}
          </View>
          <View style={s.bloco}>
            <Text style={s.blocoTitulo}>Entrega</Text>
            <Text style={s.linha}>{entrega}</Text>
          </View>
        </View>

        <Text style={s.aviso}>
          A nota fiscal (ou o documento fiscal equivalente) deve ser emitida em nome de {d.entidade.nome}
          {d.entidade.cnpj ? `, CNPJ ${formatarCnpjCpf(d.entidade.cnpj)},` : ""} citando o número desta ordem de
          compra (nº {d.numero}), e acompanhar a entrega. O pagamento segue as condições acima, após o recebimento e a
          conferência do que foi pedido. Divergências de quantidade, especificação, valor ou prazo devem ser tratadas
          com a entidade antes da entrega.
        </Text>

        <View style={s.assinatura}>
          <View style={s.assinaturaLinha} />
          <Text style={s.assinaturaNome}>{d.comprador ?? "Setor de compras"}</Text>
          <Text style={s.orgSub}>
            {d.entidade.nome}
            {d.dataCompra ? ` · compra em ${formatarData(d.dataCompra)}` : ""}
          </Text>
        </View>

        <View style={s.rodape} fixed>
          <Text>
            Ordem de compra nº {d.numero} · {d.entidade.nome} · emitida pelo Confluir
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

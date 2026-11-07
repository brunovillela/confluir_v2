import "server-only"

import { ROTULO_TIPO_REUNIAO } from "@/lib/atas-constantes"
import type { DeliberacaoComAta } from "@/lib/db/deliberacoes"
import { ROTULO_SIGILO_DELIBERACAO, ROTULO_SITUACAO_DELIBERACAO } from "@/lib/deliberacoes-constantes"
import { dataXlsx, type ColunaXlsx } from "@/lib/xlsx"

/** Colunas das deliberações na planilha (tela Deliberações e aba da planilha de atas). */
export const COLUNAS_DELIBERACOES: ColunaXlsx<DeliberacaoComAta>[] = [
  { titulo: "Data da reunião", valor: (d) => dataXlsx(d.ata.data), largura: 14 },
  { titulo: "Ata nº", valor: (d) => d.ata.numero, largura: 10 },
  { titulo: "Reunião", valor: (d) => d.ata.titulo, largura: 36 },
  { titulo: "Tipo", valor: (d) => (d.ata.tipo === "outra" && d.ata.orgao ? d.ata.orgao : ROTULO_TIPO_REUNIAO[d.ata.tipo]) },
  { titulo: "Nº na ata", valor: (d) => d.ordem, largura: 10 },
  { titulo: "Assunto", valor: (d) => d.assunto, largura: 40 },
  { titulo: "Teor", valor: (d) => d.texto, largura: 60 },
  { titulo: "Votação", valor: (d) => d.votacao, largura: 28 },
  { titulo: "Responsável", valor: (d) => d.responsavelNome ?? d.responsavel, largura: 26 },
  { titulo: "Prazo", valor: (d) => dataXlsx(d.prazo), largura: 12 },
  { titulo: "Situação", valor: (d) => ROTULO_SITUACAO_DELIBERACAO[d.situacao], largura: 14 },
  { titulo: "Sigilo", valor: (d) => ROTULO_SIGILO_DELIBERACAO[d.sigilo], largura: 12 },
]

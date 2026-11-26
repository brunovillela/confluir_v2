/**
 * De onde veio o dado que acerta a ficha na fila "Divergências das votações"
 * (26/11/2026). A entidade não pede documento (inviabilizaria a filiação):
 * vale a fonte mais forte que houver, registrada no prontuário.
 */
export const FONTES_DIVERGENCIA = [
  {
    chave: "lista_empresa",
    rotulo: "Lista da empresa + declarado pelo eleitor",
    ajuda: "O nome declarado confere com o da lista da empresa (só para o nome: a lista não traz nascimento).",
  },
  {
    chave: "contato_cadastro",
    rotulo: "Confirmado com o filiado pelo telefone ou e-mail que já estavam no cadastro",
    ajuda: "Contato pelo canal antigo da ficha, não pelo que acabou de ser informado.",
  },
  { chave: "presencial", rotulo: "Atendimento presencial", ajuda: "O filiado confirmou na entidade." },
  {
    chave: "empresa_relacao",
    rotulo: "Relação de desconto ou contracheque da empresa",
    ajuda: "O dado aparece em documento emitido pela empresa.",
  },
  {
    chave: "autodeclarado",
    rotulo: "Só a declaração do eleitor na votação",
    ajuda: "Declarado por quem entrou pelo e-mail da lista da empresa. É a fonte mais fraca.",
  },
] as const

export type FonteDivergencia = (typeof FONTES_DIVERGENCIA)[number]["chave"]

export function rotuloFonte(chave: string | null | undefined): string | null {
  return FONTES_DIVERGENCIA.find((f) => f.chave === chave)?.rotulo ?? null
}

/**
 * Eventos — tipos e listas que o CLIENTE também precisa.
 *
 * Existe porque `lib/db/eventos*.ts` é `server-only`: um componente cliente que
 * importe de lá, ainda que só o tipo, quebra o build. Mesmo motivo dos outros
 * `*-constantes.ts` do projeto.
 */

export type ModoFoto = "nenhuma" | "visual" | "biometrica"

export type ConfigEventos = {
  modo_foto: ModoFoto
  retencao_foto_dias: number
  controle_acesso_nome: string | null
  controle_acesso_exclusao_manual: boolean
}

/**
 * O modo da foto é a decisão mais pesada do módulo: é ele que define o REGIME
 * LEGAL do que se coleta. Por isso cada opção carrega a explicação junto — a
 * tela não deve obrigar quem decide a saber a lei de cor.
 */
export const MODOS_FOTO: {
  valor: ModoFoto
  rotulo: string
  regime: string
}[] = [
  {
    valor: "nenhuma",
    rotulo: "Não pedir foto",
    regime: "Nenhum dado de imagem é coletado.",
  },
  {
    valor: "visual",
    rotulo: "Foto para conferência na portaria",
    regime:
      "A recepção compara com o olho humano. É dado pessoal comum — não há reconhecimento facial.",
  },
  {
    valor: "biometrica",
    rotulo: "Foto para reconhecimento facial (catraca)",
    regime:
      "A imagem alimenta identificação automática. É DADO PESSOAL SENSÍVEL (LGPD art. 5º, II e art. 11) e exige consentimento específico e destacado.",
  },
]

export type CampoExtra = {
  id: string
  rotulo: string
  tipo: string
  opcoes: string[]
  ajuda: string | null
  obrigatorio: boolean
  ordem: number
  ativo: boolean
  respostas: number
}

export const TIPOS_CAMPO: { valor: string; rotulo: string }[] = [
  { valor: "texto", rotulo: "Texto" },
  { valor: "numero", rotulo: "Número" },
  { valor: "data", rotulo: "Data" },
  { valor: "selecao", rotulo: "Escolha entre opções" },
  { valor: "sim_nao", rotulo: "Sim ou não" },
]

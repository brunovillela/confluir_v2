import { GuardaParte, ParteIndisponivel } from "@/components/portal/guarda-parte"
import { configDaParte } from "@/lib/db/portal-partes"
import { mensagemDaSituacao } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Desligar a Saúde tira do titular o acesso direto aos próprios registros, e
 * a cópia dos dados do portal (LGPD) não cobre saúde: a página indisponível
 * diz por onde pedir (art. 18).
 */
const CAMINHO_DOS_DADOS =
  "Os seus registros de saúde continuam guardados: para pedir uma cópia, fale com o sindicato."

/**
 * Saúde conforme Filiados › Área do associado: desabilitada, "indisponível"
 * com o caminho para pedir os dados; suspensa, a faixa no topo (GuardaParte).
 *
 * Layout e página renderizam em paralelo: a página confere de novo e, com a
 * parte desabilitada, não consulta nada de saúde. Aqui só se lê a
 * configuração — nenhum dado do associado.
 */
export default async function SaudeLayout({ children }: { children: React.ReactNode }) {
  const [vis, cfg] = await Promise.all([
    requireVisualizacaoPortal(),
    configDaParte("saude").catch(() => null),
  ])
  if (cfg?.estado === "desabilitada") {
    return (
      <ParteIndisponivel
        parte="saude"
        mensagem={`${mensagemDaSituacao("saude", cfg)} ${CAMINHO_DOS_DADOS}`}
        preview={vis.preview}
      />
    )
  }
  return <GuardaParte parte="saude">{children}</GuardaParte>
}

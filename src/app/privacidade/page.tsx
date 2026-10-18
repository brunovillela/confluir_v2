import type { Metadata } from "next"
import Link from "next/link"

import { Marca } from "@/components/marca"
import { enderecoDaSede, listarSedes, obterOrganizacao } from "@/lib/db/organizacao"
import { formatarCnpjCpf } from "@/lib/formato"

/**
 * Política de privacidade da entidade (Onda B6, docs/plano-documentacao.md).
 *
 * Pública, por subdomínio: cada entidade é controladora dos seus dados e tem a
 * própria política, com nome, CNPJ, endereço e encarregado vindos do cadastro
 * da organização (Institucional › Organização). O texto resume, em linguagem
 * do titular, o ROPA (docs/lgpd/ropa.md), os suboperadores
 * (docs/lgpd/suboperadores.md), a retenção (docs/lgpd/retencao.md) e os
 * direitos (docs/lgpd/direitos-titular.md). Mudou um desses documentos de
 * forma que o titular perceba? Atualize aqui e a data no cadastro.
 */

export const metadata: Metadata = {
  title: "Política de privacidade",
}

// Data da versão deste texto-modelo; a entidade registra a sua revisão no cadastro.
const VERSAO_MODELO = "2026-10-18"

function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

export default async function PrivacidadePage() {
  const [org, sedes] = await Promise.all([obterOrganizacao(), listarSedes()])
  const entidade = org?.nomeFantasia || org?.nomeRazao || "a entidade"
  const razao = org?.nomeRazao || entidade
  const cnpj = org?.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null
  const endereco = sedes.sedes.map(enderecoDaSede).find(Boolean) ?? null
  const contato = org?.encarregadoEmail || org?.emailContato || null
  const atualizada = org?.politicaAtualizadaEm || VERSAO_MODELO

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Política de privacidade</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {entidade} · atualizada em {dataBR(atualizada)}
        </p>
      </div>

      <article className="[&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:my-1 [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
        <p>
          Esta política explica como <strong>{razao}</strong>
          {cnpj ? <> (CNPJ {cnpj})</> : null}
          {endereco ? <>, com sede em {endereco},</> : null} trata os dados pessoais de filiados,
          trabalhadores da base, funcionários, dirigentes, fornecedores e demais pessoas que se
          relacionam com a entidade, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018,
          LGPD).
        </p>

        <h2>1. Quem é responsável</h2>
        <ul>
          <li>
            <strong>Controladora:</strong> {razao}. Ela decide por que e como os seus dados são usados.
          </li>
          <li>
            <strong>Encarregado (DPO):</strong>{" "}
            {org?.encarregadoNome ? (
              <>
                {org.encarregadoNome}
                {org.encarregadoEmail ? (
                  <>
                    {" "}
                    · <a href={`mailto:${org.encarregadoEmail}`}>{org.encarregadoEmail}</a>
                  </>
                ) : null}
              </>
            ) : contato ? (
              <>
                pelo e-mail <a href={`mailto:${contato}`}>{contato}</a>
              </>
            ) : (
              <>procure a secretaria da entidade</>
            )}
            .
          </li>
          <li>
            <strong>Operador:</strong> o sistema Confluir, que guarda e processa os dados em nome da
            entidade, seguindo as instruções dela e um contrato de proteção de dados.
          </li>
        </ul>

        <h2>2. Dado sindical é dado sensível</h2>
        <p>
          A filiação a sindicato é <strong>dado pessoal sensível</strong> pela LGPD (art. 5º, II), assim
          como os dados de saúde. Por isso eles têm proteção reforçada: acesso só por quem precisa,
          registro de quem alterou, separação entre entidades e, no caso da saúde, cifragem dos
          relatórios clínicos.
        </p>

        <h2>3. Que dados tratamos e para quê</h2>
        <ul>
          <li>
            <strong>Filiação:</strong> identificação, contato, endereço, empregador, cargo, lotação e
            matrícula, para admitir, manter e representar o filiado, e dados bancários para reembolsos.
          </li>
          <li>
            <strong>Contribuições:</strong> valores descontados ou pagos, para conciliar as relações dos
            empregadores, cobrar e prestar contas.
          </li>
          <li>
            <strong>Assembleias e votações:</strong> lista de aptos, contato para enviar o link e o
            comprovante, e o registro de quem participou. <strong>O voto é secreto:</strong> fica
            guardado sem nenhuma ligação com quem votou.
          </li>
          <li>
            <strong>Oposição à contribuição assistencial:</strong> o pedido e a resposta, para cumprir o
            direito de oposição e informar o empregador.
          </li>
          <li>
            <strong>Saúde do trabalhador:</strong> comunicações de acidente de trabalho (CAT) e
            atendimentos de saúde, para acompanhar acidentes e prestar assistência.
          </li>
          <li>
            <strong>Benefícios e serviços:</strong> hospedagem em hotéis conveniados, cessão de espaços,
            eventos, jurídico e atendimento pelo portal.
          </li>
          <li>
            <strong>Comunicação:</strong> e-mail, telefone e preferências, para enviar comunicados e
            avisos. Você pode deixar de receber os comunicados no portal.
          </li>
          <li>
            <strong>Funcionários, dirigentes, fornecedores e condutores:</strong> o necessário para as
            relações de trabalho, de mandato, de contrato e de uso de veículos.
          </li>
          <li>
            <strong>Acesso ao sistema:</strong> conta, registros de acesso e trilha de auditoria, para a
            sua segurança e para cumprir a lei.
          </li>
        </ul>

        <h2>4. Bases legais</h2>
        <p>
          Tratamos dados para cumprir obrigações legais e estatutárias (como as da CLT, da Lei
          8.213/91 e das normas de saúde e segurança), para executar a relação associativa e os
          contratos, para exercer direitos em processos, para proteger a saúde, por legítimo
          interesse (como comunicados da entidade, com opção de saída) e com o seu consentimento
          quando ele é a base, como no termo de filiação e no uso de imagem em eventos. O
          consentimento pode ser revogado a qualquer momento.
        </p>

        <h2>5. Com quem compartilhamos</h2>
        <ul>
          <li>
            <strong>Empregadores e fontes pagadoras:</strong> para o desconto em folha autorizado, a
            oposição e ofícios de representação.
          </li>
          <li>
            <strong>Órgãos públicos:</strong> INSS, Receita Federal, Justiça e outros, quando a lei exige.
          </li>
          <li>
            <strong>Bancos, contabilidade, hotéis conveniados e advogados contratados:</strong> só o
            necessário para cada serviço.
          </li>
          <li>
            <strong>Fornecedores de tecnologia (suboperadores):</strong> banco de dados (Supabase, com os
            dados guardados no Brasil), hospedagem (Vercel), envio de e-mail (Brevo/Resend), registro de
            erros (Sentry), verificação anti-robô (Cloudflare), avisos pelo Telegram e notificações do
            navegador, e recursos de inteligência artificial (OpenAI) usados para ler documentos e
            redigir textos, sem que o fornecedor guarde o conteúdo para treinar modelos.
          </li>
        </ul>
        <p>
          Alguns desses fornecedores ficam fora do Brasil. Nesses casos a transferência é protegida por
          cláusulas contratuais de proteção de dados, como prevê a LGPD (art. 33). <strong>Não vendemos
          dados.</strong>
        </p>

        <h2>6. Por quanto tempo guardamos</h2>
        <p>
          Guardamos os dados enquanto existir a finalidade e pelos prazos que a lei exige. Depois eles
          são eliminados ou anonimizados. Exemplos: cadastro de ex-filiado, 5 anos após a desfiliação;
          documentos contábeis, 10 anos; acervo de saúde ocupacional, 20 anos (NR-07); contatos dados só
          para receber o link de votação, 90 dias após a apuração; registros de acesso, 6 meses (Marco
          Civil). Dados eliminados podem permanecer por pouco tempo nas cópias de segurança, até elas
          expirarem.
        </p>

        <h2>7. Seus direitos</h2>
        <p>Você pode, a qualquer momento:</p>
        <ul>
          <li>confirmar se tratamos seus dados e acessá-los;</li>
          <li>corrigir dados incompletos ou desatualizados;</li>
          <li>pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários;</li>
          <li>receber seus dados em formato aberto (portabilidade);</li>
          <li>saber com quem compartilhamos;</li>
          <li>revogar o consentimento e saber o que acontece se não consentir;</li>
          <li>pedir a revisão de decisões tomadas só por regras automáticas;</li>
          <li>reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</li>
        </ul>
        <p>
          <strong>Como pedir:</strong> filiados pelo portal, em <Link href="/portal/lgpd">Privacidade e
          dados</Link> (onde dá para baixar todos os seus dados); participantes de eventos em{" "}
          <Link href="/meus-dados">Meus dados</Link>; e qualquer pessoa pela secretaria
          {contato ? (
            <>
              {" "}
              ou pelo e-mail <a href={`mailto:${contato}`}>{contato}</a>
            </>
          ) : null}
          . Confirmamos a sua identidade antes de atender e respondemos em até 15 dias. Alguns dados
          precisam ser mantidos por obrigação legal mesmo após um pedido de eliminação; nesse caso
          informamos o motivo.
        </p>

        <h2>8. Segurança</h2>
        <p>
          Os dados de cada entidade são separados dos de outras entidades em todas as tabelas. O acesso
          exige login, com segundo fator para funções sensíveis; as alterações em dados importantes ficam
          registradas; relatórios clínicos são cifrados; e as exportações de listas ficam registradas.
          Se acontecer um incidente que possa trazer risco a você, avisaremos você e a ANPD.
        </p>

        <h2>9. Cookies</h2>
        <p>
          Usamos apenas cookies necessários para o funcionamento: manter você conectado, lembrar o acesso
          a uma votação e proteger os formulários contra robôs. Não usamos cookies de publicidade nem de
          rastreamento.
        </p>

        <h2>10. Crianças e adolescentes</h2>
        <p>
          Dados de dependentes menores de idade são tratados apenas no melhor interesse deles, para
          benefícios e obrigações trabalhistas, e informados pelo responsável.
        </p>

        <h2>11. Mudanças nesta política</h2>
        <p>
          Esta política pode ser atualizada. A data no topo mostra a versão em vigor, e mudanças
          relevantes serão avisadas pelos canais da entidade.
        </p>
      </article>
    </main>
  )
}

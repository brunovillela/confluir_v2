import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { NAV_PORTAL } from "@/components/portal/navegacao-portal"
import { servicosOcultosDoPortal } from "@/lib/db/sindicato-portal"

/**
 * Atalhos do Início (A55): o padrão de hub do sistema — `CartaoArea` dentro
 * de `GRADE_AREAS` (DESIGN.md), em vez de uma grade própria. Primeiro o que o
 * associado paga para ter (contribuição, carteirinha, hospedagem, convênios,
 * saúde), depois o resto: dez cartões, duas linhas cheias de cinco na tela
 * larga. Notícias tem o cartão próprio no fim da página (com "Ver todas");
 * Avisos, Privacidade e Ajuda ficam só no menu.
 *
 * O nome e o ícone vêm do menu (navegacao-portal.ts) — os dois não divergem
 * mais; aqui só a ordem e a descrição.
 */
const SERVICOS: { href: string; descricao: string }[] = [
  { href: "/portal/contribuicao", descricao: "O que foi descontado mês a mês e se está tudo em dia" },
  { href: "/portal/carteirinha", descricao: "Carteirinha digital com QR e a declaração de filiação" },
  { href: "/portal/hospedagem", descricao: "Cupons de hospedagem subsidiada nos hotéis parceiros" },
  { href: "/portal/convenios", descricao: "Descontos e serviços negociados pelo sindicato" },
  { href: "/portal/saude", descricao: "Seus atendimentos no serviço de saúde do sindicato" },
  { href: "/portal/cadastro", descricao: "Confira seus dados e atualize telefones, e-mails e endereço" },
  { href: "/portal/eventos", descricao: "Inscrições abertas, suas inscrições e a agenda de atividades" },
  { href: "/portal/votacao", descricao: "Assembleias abertas e o histórico das suas participações" },
  { href: "/portal/atendimento", descricao: "Abra uma solicitação e acompanhe a resposta" },
  { href: "/portal/sindicato", descricao: "Canais oficiais, endereço e quem compõe a diretoria" },
]

/**
 * A grade. Sem `ocultos`, mostra todos — é o que aparece enquanto a consulta
 * do que a entidade oferece corre (na dúvida, o item aparece, como no menu).
 */
export function ServicosInicio({ ocultos = [] }: { ocultos?: string[] }) {
  // Item que saiu do menu sai da grade também: o menu é a fonte do nome e do ícone.
  const itens = SERVICOS.filter((s) => !ocultos.includes(s.href)).flatMap((s) => {
    const nav = NAV_PORTAL.find((n) => n.href === s.href)
    return nav ? [{ ...s, titulo: nav.titulo, icone: nav.icone }] : []
  })
  return (
    <section aria-labelledby="inicio-servicos" className="grid gap-3">
      <h2 id="inicio-servicos" className="text-lg font-semibold">
        Serviços
      </h2>
      <div className={GRADE_AREAS}>
        {itens.map((s) => (
          <CartaoArea key={s.href} titulo={s.titulo} descricao={s.descricao} href={s.href} icone={s.icone} />
        ))}
      </div>
    </section>
  )
}

/**
 * A grade com o que a entidade de fato oferece: sem hotel ativo ou convênio
 * vigente, Hospedagem e Convênios saem — a mesma regra do menu (A57).
 */
export async function ServicosDaEntidade() {
  const ocultos = await servicosOcultosDoPortal()
  return <ServicosInicio ocultos={ocultos} />
}

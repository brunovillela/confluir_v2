import type { Metadata } from "next"
import {
  Cake,
  Link2,
  Mail,
  MonitorPlay,
  Newspaper,
  PenLine,
  QrCode,
  Sparkles,
} from "lucide-react"

import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Comunicação — Confluir" }

export default async function ComunicacaoPage() {
  const sessao = await requirePermissao("noticias", ["comunicacao_etiquetas", "comunicacao_mensagens"])
  const noticias = podeAcessar(sessao.permissoes, "noticias")
  const etiquetas = podeAcessar(sessao.permissoes, "comunicacao_etiquetas", ["filiacao_gestao"])
  const mensagens = podeAcessar(sessao.permissoes, "comunicacao_mensagens")

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comunicação</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Notícias do sindicato, resumo de notícias por IA, QR Codes, slides
          para as TVs, a página de links para as redes sociais, as etiquetas
          para enviar publicações pelos Correios e as mensagens aos filiados.
        </p>
      </div>

      <div className={GRADE_AREAS}>
        {noticias && (
          <>
            <CartaoArea
              titulo="Notícias"
              descricao="Publique manchetes exibidas no painel e no portal do filiado"
              href="/painel/comunicacao/noticias"
              icone={Newspaper}
            />
            <CartaoArea
              titulo="Resumo de notícias"
              descricao="A IA lê os sites indicados e gera um resumo para o painel"
              href="/painel/comunicacao/resumo"
              icone={Sparkles}
            />
            <CartaoArea
              titulo="Assistente de redação"
              descricao="A IA escreve o texto seguindo a política editorial da entidade, o objetivo e o canal onde ele será publicado"
              href="/painel/comunicacao/textos"
              icone={PenLine}
            />
            <CartaoArea
              titulo="QR Codes"
              descricao="Emita QR Codes dinâmicos e baixe a imagem em vários tamanhos para peças digitais e impressas"
              href="/painel/comunicacao/qrcodes"
              icone={QrCode}
            />
            <CartaoArea
              titulo="Slides para TV"
              descricao="Conjuntos de slides na horizontal ou na vertical, com logo e faixa de notícias, num link público para as televisões"
              href="/painel/comunicacao/slides"
              icone={MonitorPlay}
            />
            <CartaoArea
              titulo="Página de links"
              descricao="O link na bio do Instagram: uma página pública com os canais e conteúdos da entidade"
              href="/painel/comunicacao/links"
              icone={Link2}
            />
          </>
        )}
        {mensagens && (
          <CartaoArea
            titulo="Aniversariantes"
            descricao="Parabéns por e-mail no dia do aniversário, automático, e a lista do dia com o botão para mandar pelo WhatsApp"
            href="/painel/comunicacao/aniversariantes"
            icone={Cake}
          />
        )}
        {mensagens && (
          <CartaoArea
            titulo="Mala direta"
            descricao="Mensagens por e-mail a um recorte de filiados, com teste, agendamento e o texto para o WhatsApp; quem se descadastrou não recebe"
            href="/painel/comunicacao/mensagens"
            icone={Mail}
          />
        )}
        {etiquetas && (
          <CartaoArea
            titulo="Etiquetas para os Correios"
            descricao="Etiquetas Pimaco com o endereço dos filiados de qualquer condição sindical, para enviar publicações impressas"
            href="/painel/comunicacao/etiquetas"
            icone={Mail}
          />
        )}
      </div>
    </>
  )
}

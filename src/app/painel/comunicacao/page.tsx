import type { Metadata } from "next"
import {
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
  const sessao = await requirePermissao("noticias", ["comunicacao_etiquetas"])
  const noticias = podeAcessar(sessao.permissoes, "noticias")
  const etiquetas = podeAcessar(sessao.permissoes, "comunicacao_etiquetas", ["filiacao_gestao"])

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comunicação</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Notícias do sindicato, resumo de notícias por IA, QR Codes, slides
          para as TVs, a página de links para as redes sociais e as etiquetas
          para enviar publicações pelos Correios.
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

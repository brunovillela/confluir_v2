import QRCode from "qrcode"

import { requirePermissao } from "@/lib/auth"
import { dadosDoAviso } from "@/lib/db/votacao-aviso"
import { kitDivulgacao } from "@/lib/db/votacao-divulgacao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { escaparHtml } from "@/lib/email-layout"

export const runtime = "nodejs"

/**
 * Cartaz A4 do pré-cadastro (fase 2 do plano de 21/10/2026): QR code do link
 * geral, janela da votação e os três passos. Página solta (sem a moldura do
 * painel) para imprimir ou salvar em PDF pelo navegador — portaria, mural,
 * refeitório da plataforma.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  await requirePermissao("assembleias")
  const { id } = await params
  const [kit, { dados }, entidade] = await Promise.all([kitDivulgacao(id), dadosDoAviso(id), nomeEntidade()])
  if (!kit || !dados) return new Response("Rodada sem votação pela internet por vir ou aberta.", { status: 404 })
  const qr = await QRCode.toString(kit.link, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
  const e = (t: string) => escaparHtml(t)
  const antes = kit.momento === "antes"

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cartaz — ${e(dados.rodadaNome)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Poppins, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #091747; background: #fff; }
  .folha { max-width: 182mm; margin: 0 auto; padding: 8mm 0; display: grid; gap: 7mm; text-align: center; }
  .entidade { font-size: 14pt; letter-spacing: 1px; text-transform: uppercase; color: #72767E; }
  h1 { margin: 0; font-size: 34pt; line-height: 1.1; }
  .tema { font-size: 16pt; color: #41454D; }
  .janela { border: 3px solid #FF5722; border-radius: 14px; padding: 5mm; font-size: 15pt; }
  .janela strong { color: #D73E02; }
  .qr svg { width: 92mm; height: 92mm; }
  .link { font-size: 15pt; font-weight: 600; word-break: break-all; }
  ol { text-align: left; margin: 0 auto; max-width: 150mm; font-size: 14pt; line-height: 1.5; padding-left: 8mm; }
  .rodape { font-size: 10.5pt; color: #72767E; }
  .imprimir { position: fixed; top: 12px; right: 12px; padding: 10px 18px; border: 0; border-radius: 8px; background: #D73E02; color: #fff; font-size: 14px; cursor: pointer; }
  @media print { .imprimir { display: none; } }
</style>
</head>
<body>
<button class="imprimir" onclick="window.print()">Imprimir / salvar PDF</button>
<main class="folha">
  <div class="entidade">${e(entidade)}</div>
  <h1>${antes ? "Cadastre-se para votar" : "Votação aberta"}</h1>
  <div class="tema">${e([dados.campanhaTema, dados.rodadaNome].filter(Boolean).join(" — "))}</div>
  ${
    kit.abre || kit.fecha
      ? `<div class="janela">Votação pela internet${kit.abre ? ` de <strong>${e(kit.abre)}</strong>` : ""}${kit.fecha ? ` até <strong>${e(kit.fecha)}</strong>` : ""}<br><span style="font-size:11pt;color:#72767E">horário de Brasília</span></div>`
      : ""
  }
  <div class="qr">${qr}</div>
  <div class="link">${e(kit.link.replace(/^https?:\/\//, ""))}</div>
  <ol>
    <li>Aponte a câmera do celular para o código acima.</li>
    <li>Escolha <strong>Telegram</strong> (mais fácil, sem código) ou um <strong>e-mail pessoal</strong> — o da empresa costuma bloquear.</li>
    <li>${antes ? "Confirme nome, CPF, nascimento e o e-mail da empresa. Na abertura, o seu link de voto chega por lá." : "Confirme os seus dados e vote. O código por e-mail pode cair no Lixo eletrônico."}</li>
  </ol>
  <div class="rodape">O voto é secreto: o sistema registra que você votou, nunca em quem votou. Ninguém do sindicato pede o seu código.</div>
</main>
</body>
</html>`
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

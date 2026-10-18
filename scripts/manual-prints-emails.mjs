/**
 * Prints dos E-MAILS do manual (não são telas do sistema): monta o HTML com os
 * mesmos modelos que o app envia (lib/email-*.ts + a moldura de
 * lib/email-layout.ts), com dados da demonstração, e fotografa no Chromium.
 *
 * Uso: node scripts/manual-prints-emails.mjs
 * (não precisa do servidor nem de login; o logo vem de public/).
 */
import { mkdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { createJiti } from "jiti"
import { chromium } from "playwright"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") } })
const { layoutEmail } = await jiti.import(path.join(raiz, "src/lib/email-layout.ts"))
const { montarEmailAvisoAptos, assuntoAvisoAptos } = await jiti.import(path.join(raiz, "src/lib/email-aviso-aptos.ts"))
const { montarEmailComprovante, assuntoComprovante } = await jiti.import(path.join(raiz, "src/lib/email-comprovante-voto.ts"))

const ENTIDADE = "Sindicato Demonstração"
// Embutido: a página montada em memória não carrega arquivo local.
const LOGO = `data:image/png;base64,${readFileSync(path.join(raiz, "public/logo-confluir-completa-dark.png")).toString("base64")}`
const SITE = "https://demo.confluir.online"

const moldura = (assunto, corpo) =>
  layoutEmail({
    corpo: corpo.replaceAll("{ENTIDADE}", ENTIDADE),
    logoUrl: LOGO,
    preheader: assunto,
    titulo: assunto,
    rodape: `Enviado pelo Confluir em nome de ${ENTIDADE}. Para falar com a entidade, responda a este e-mail.`,
  })

const aviso = {
  rodadaNome: "Rodada de outubro",
  campanhaTema: "Reajuste salarial 2026 — Petro Fictícia",
  inicio: "2026-10-20",
  termino: "2026-10-22",
  assembleias: [
    { nome: "Assembleia online", modalidade: "online", data_inicio: "2026-10-20", data_termino: "2026-10-22" },
    { nome: "Assembleia presencial na sede", modalidade: "urna", data_inicio: "2026-10-21", data_termino: "2026-10-21" },
  ],
  link: `${SITE}/votar`,
  assembleiaOnlineId: "ea000000-0000-4000-8000-000000000004",
  temOnline: true,
  temPresencial: true,
}

const EMAILS = [
  {
    arquivo: "fluxos-publicos/aviso-email.png",
    assunto: assuntoAvisoAptos(aviso),
    corpo: montarEmailAvisoAptos(aviso, {
      nome: "Paulo Henrique Lima",
      email: "paulo.lima@petroficticia.com.br",
      porta: "email",
      linkPessoal: `${SITE}/votar/ea000000-0000-4000-8000-000000000004/entrar?t=demo`,
      linkNaoSouEu: `${SITE}/votar/ea000000-0000-4000-8000-000000000004/nao-sou-eu?t=demo`,
    }),
  },
  {
    arquivo: "representacao/aviso-email.png",
    assunto: assuntoAvisoAptos(aviso),
    corpo: montarEmailAvisoAptos(aviso, { nome: "Paulo Henrique Lima", email: "paulo.lima@petroficticia.com.br", porta: "email" }),
  },
  {
    arquivo: "fluxos-publicos/comprovante-email.png",
    assunto: assuntoComprovante({ assembleia: "Assembleia online" }),
    corpo: montarEmailComprovante({
      assembleia: {
        assembleia: "Assembleia online",
        rodada: "Rodada de outubro",
        campanhaTema: "Reajuste salarial 2026 — Petro Fictícia",
        modalidade: "online",
        inicio: "2026-10-20",
        termino: "2026-10-22",
        horaInicio: null,
        horaTermino: null,
      },
      comprovante: {
        codigo: "VT-7Q2M-K9XA",
        hash: "3f1c9a7e52b04d8e6a1f0c2b9d7e4a6c8b5f3e1d0a9c7b6e5f4d3c2b1a0f9e8d",
        quando: "2026-10-20T14:32:10-03:00",
      },
      canal: "online",
      nome: "PAULO HENRIQUE LIMA",
      urlConferencia: `${SITE}/comprovante/VT-7Q2M-K9XA`,
    }),
  },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 })
for (const e of EMAILS) {
  mkdirSync(path.join(raiz, "public/ajuda", path.dirname(e.arquivo)), { recursive: true })
  await page.setContent(moldura(e.assunto, e.corpo), { waitUntil: "load" })
  await page.screenshot({ path: path.join(raiz, "public/ajuda", e.arquivo), fullPage: true })
  console.log("salvo:", e.arquivo)
}
await browser.close()

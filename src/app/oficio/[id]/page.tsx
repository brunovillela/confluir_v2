import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { dadosImpressao } from "@/lib/db/oficios"
import { formatarCnpjCpf } from "@/lib/formato"
import { limparFormatacaoBubble } from "@/lib/oficios-constantes"

import { BotaoImprimir } from "./botao-imprimir"

export const metadata: Metadata = { title: "Ofício — impressão" }

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function dataPorExtenso(iso: string | null): string {
  const base = iso ?? new Date().toISOString().slice(0, 10)
  const [a, m, d] = base.split("-").map(Number)
  return `${d} de ${MESES[(m ?? 1) - 1]} de ${a}`
}

const CSS = `
  .oficio-fundo { background: #f3f4f6; min-height: 100vh; padding: 24px 12px; }
  .oficio-barra { max-width: 21cm; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 8px; }
  .oficio-baixar {
    display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px;
    border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #111;
    font-size: 14px; text-decoration: none;
  }
  .oficio-baixar:hover { background: #f8fafc; }
  .oficio-folha {
    max-width: 21cm; margin: 0 auto; background: #fff; color: #111;
    padding: 2.5cm 2.5cm; box-shadow: 0 1px 8px rgba(0,0,0,.15);
    font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5;
    display: flex; flex-direction: column; min-height: 27cm;
  }
  .oficio-logo { display: block; max-height: 90px; margin: 0 auto 18px; object-fit: contain; }
  .oficio-meta { margin-bottom: 4px; }
  .oficio-corpo { white-space: pre-wrap; margin: 18px 0; }
  .oficio-lista { margin: 6px 0 18px; padding-left: 4px; }
  .oficio-lista li { list-style: none; padding: 1px 0; }
  .oficio-assinatura { margin-top: 48px; text-align: center; }
  .oficio-assinatura .nome { font-weight: 600; }
  .oficio-rodape {
    margin-top: auto; padding-top: 18px; border-top: 1px solid #ddd;
    text-align: center; font-size: 8pt; color: #444; line-height: 1.35;
  }
  .oficio-sedes { display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; margin-top: 4px; }
  @media print {
    .oficio-fundo { background: #fff; padding: 0; }
    .oficio-barra, .oficio-sem-impressao { display: none !important; }
    .oficio-folha { box-shadow: none; margin: 0; max-width: none; padding: 1.8cm 2cm; min-height: auto; }
    @page { size: A4; margin: 0; }
  }
`

export default async function ImpressaoOficioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_oficios")
  const { id } = await params

  const dados = await dadosImpressao(id)
  if (!dados) notFound()
  const { oficio, cidade, organizacao, sedes } = dados

  const numero =
    oficio.numero != null ? `${oficio.numero} / ${oficio.ano}` : "— (rascunho)"
  const destinatario = oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—"

  return (
    <div className="oficio-fundo">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="oficio-barra oficio-sem-impressao">
        <a
          href={`/oficio/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="oficio-baixar"
        >
          Baixar PDF
        </a>
        <BotaoImprimir />
      </div>

      <div className="oficio-folha">
        {organizacao.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={organizacao.logoUrl} alt="" className="oficio-logo" />
        )}

        <p className="oficio-meta">
          {cidade ? `${cidade}, ` : ""}
          {dataPorExtenso(oficio.data)}.
        </p>
        <p className="oficio-meta">Número: {numero}</p>
        <p className="oficio-meta">
          De: {organizacao.nomeFantasia ?? organizacao.nomeRazao ?? "—"}
        </p>
        <p className="oficio-meta">Para: {destinatario}</p>
        {oficio.aosCuidados && (
          <p className="oficio-meta">Aos cuidados: {oficio.aosCuidados}</p>
        )}
        <p className="oficio-meta">Assunto: {oficio.assunto ?? "—"}</p>

        <p style={{ marginTop: "24px" }}>{oficio.saudacao ?? "Prezados,"}</p>

        {oficio.corpo && (
          <p className="oficio-corpo">{limparFormatacaoBubble(oficio.corpo)}</p>
        )}

        {oficio.filiados.length > 0 && (
          <ul className="oficio-lista">
            {oficio.filiados.map((f) => (
              <li key={f.id}>
                {f.nome ?? "—"}
                {f.matricula ? ` (matrícula ${f.matricula})` : ""}
              </li>
            ))}
          </ul>
        )}

        <p>{oficio.fecho ?? "Cordialmente,"}</p>

        <div className="oficio-assinatura">
          <p className="nome">{oficio.assinanteNome ?? "________________________"}</p>
          {oficio.assinanteCargo && <p>{oficio.assinanteCargo}</p>}
        </div>

        <div className="oficio-rodape">
          <p>
            {organizacao.nomeRazao ?? ""}
            {organizacao.cnpjCpf ? ` — CNPJ: ${formatarCnpjCpf(organizacao.cnpjCpf)}` : ""}
          </p>
          <div className="oficio-sedes">
            {sedes.map((s, i) => (
              <div key={i}>
                {s.nome && <strong>{s.nome}</strong>}
                {s.linha1 && <div>{s.linha1}{s.cep ? ` — CEP ${s.cep}` : ""}</div>}
                {s.telefones && <div>Telefones: {s.telefones}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

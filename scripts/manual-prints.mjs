// Captura os prints do manual (/painel/ajuda) a partir do TENANT DE
// DEMONSTRAÇÃO, salvando PNGs em public/ajuda/<area>/.
//
// Login SEM SENHA: gera um magic link pelo service role (admin.generateLink)
// e abre /auth/confirm — o handler cria a sessão por cookie. Nenhuma senha é
// digitada.
//
// PRÉ-REQUISITOS:
//   1. Seed do tenant demo rodado (supabase/demo-seed-*.sql) e login
//      demo@confluir.local criado no Supabase Auth.
//   2. Dev server da demo no ar na porta 3222:
//      $env:NEXT_PUBLIC_EMP_PROPRIETARIA_ID='11111111-1111-4111-8111-111111111111'; npm run dev -- -p 3222
//   3. Playwright instalado: npm i -D playwright && npx playwright install chromium
//
// USO:  node scripts/manual-prints.mjs
// Edite SHOTS abaixo para cada módulo (rota → arquivo em public/ajuda/<area>/).

import { readFileSync, mkdirSync } from "node:fs"
import { chromium } from "playwright"

const BASE = "http://localhost:3222"
// PRINT_EMAIL troca o login (ex.: a funcionária da demo, para os prints do Meu perfil).
const EMAIL = process.env.PRINT_EMAIL ?? "demo@confluir.local"

// [rota, arquivo relativo a public/ajuda/] — edite por módulo a cada rodada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- usados nos blocos comentados
const EV_DEMO = "e0e0e0e0-0000-4000-8000-000000000001"
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- usados nos blocos comentados
const DIA_DEMO = "e0e0e0e0-0000-4000-8000-000000000011"

const SWITCH_DIRETA = 'css=button[aria-label="Alternar entre via Aquisição e aquisição direta"]'
// Cupom fictício para a leitura pela IA (PAPELARIA ESTRELA DO NORTE, CNPJ de
// exemplo). Passe o caminho em CUPOM_TESTE; sem ele, o print da leitura é pulado.
const CUPOM = process.env.CUPOM_TESTE ?? ""
// Fatura de cartão-combustível de exemplo (PDF) para a leitura com IA.
const FATURA = process.env.FATURA_TESTE ?? ""

// Token do link de assinatura do RPA nº 1 montado para os prints (rodada 19).
const ATA_TESTE = process.env.ATA_TESTE ?? ""
const TOKEN_RPA = process.env.TOKEN_RPA ?? ""

// SHOT_UNICO='["/rota", "pasta/arquivo.png", {opções}]' refaz só um print, sem
// mexer nas rodadas (ex.: um print antigo que ficou com defeito).
// LOTE=<arquivo.json>: uma lista [rota, arquivo, opções] montada fora do
// script (ex.: refazer todos os prints de um módulo). Com SEGUIR=1, um print
// que falha é registrado e o lote continua; ESPERA_MS encurta a espera.
const ESPERA_MS = Number(process.env.ESPERA_MS ?? 180000)
const SHOTS = process.env.SHOT_UNICO
  ? [JSON.parse(process.env.SHOT_UNICO)]
  : process.env.LOTE
  ? JSON.parse(readFileSync(process.env.LOTE, "utf8"))
  : process.env.RPA_FASE === "2"
  ? [
      // Rodada 19, fase 2: o link depois que o recibo assinado foi anexado.
      [`/assinar/${TOKEN_RPA}`, "compras/rpa-link-entregue.png", { anon: true, esperar: "Não é preciso assinar", altura: 640 }],
    ]
  : process.env.RODADA === "perfil"
  ? [
      // Rodada de 17/10 (23): Meu perfil com os indicadores — rodar com
      // PRINT_EMAIL=ana.demo@confluir.local (a Ana precisa estar vinculada ao
      // login e ter linha em permissoes; na demo isso é ligado só para o print).
      ["/painel/perfil/ponto", "pessoal/perfil-ponto.png", { esperar: "Saldo de horas extras", altura: 760 }],
      ["/painel/perfil/ferias", "pessoal/perfil-ferias.png", { esperar: "Saldo a gozar", altura: 900 }],
      ["/painel/perfil/carreira", "pessoal/perfil-carreira.png", { esperar: "Anuênio atual", altura: 900 }],
      // Rodada de 17/10 (27): o Meu perfil das outras áreas do Pessoal.
      ["/painel/perfil/contracheques", "pessoal/perfil-contracheques.png", { esperar: "Último liberado", altura: 900 }],
      ["/painel/perfil/informes", "pessoal/perfil-informes.png", { esperar: "Informes disponíveis", altura: 900 }],
      ["/painel/perfil/diarias", "pessoal/perfil-diarias.png", { esperar: "Valor recebido", altura: 1000 }],
      ["/painel/perfil/reembolsos", "pessoal/perfil-reembolsos.png", { esperar: "A receber no contracheque", altura: 1000 }],
      ["/painel/perfil/faltas", "pessoal/perfil-faltas.png", { esperar: "Minhas faltas justificadas", altura: 1000 }],
      ["/painel/perfil/ausencias", "pessoal/perfil-ausencias.png", { esperar: "Dias de afastamento", altura: 900 }],
      ["/painel/perfil/asos", "pessoal/perfil-asos.png", { esperar: "Último exame", altura: 900 }],
      ["/painel/perfil/treinamentos", "pessoal/perfil-treinamentos.png", { esperar: "Certificados vencidos", altura: 900 }],
    ]
  : process.env.RODADA === "niveis23"
  ? (() => {
      // Rodada de 17/10 (26): nível 2 (a funcionária na área) e nível 3 (o
      // registro) de cada área do Pessoal, todos da Ana (seed da demo). A falta
      // de 06/10 é criada só para o print e apagada depois.
      const ANA = "33333333-3333-4333-8333-000000000001"
      const o = { esperar: "Ana Beatriz Nogueira", altura: 1100 }
      const p = "/painel/pessoal"
      return [
        [`${p}/contracheques/funcionario/${ANA}`, "pessoal/contracheques-funcionario.png", o],
        [`${p}/contracheques/funcionario/${ANA}/899dfe88-fbaf-4ce3-8a84-9bca1c2d0a9b`, "pessoal/contracheques-registro.png", o],
        [`${p}/ponto/funcionario/${ANA}`, "pessoal/ponto-funcionario.png", { esperar: "Saldo HE", fullPage: true }],
        [`${p}/ferias/66666666-6666-4666-8666-000000000001`, "pessoal/ferias-registro.png", o],
        [`${p}/niveis/5a300000-0000-4000-8000-000000000001?de=carreira`, "pessoal/niveis-registro.png", o],
        [`${p}/anuenios/5a500000-0000-4000-8000-000000000001?de=carreira`, "pessoal/anuenios-registro.png", o],
        [`${p}/informes/funcionario/${ANA}`, "pessoal/informes-funcionario.png", o],
        [`${p}/informes/funcionario/${ANA}/5e200000-0000-4000-8000-000000000001`, "pessoal/informes-registro.png", { ...o, altura: 900 }],
        [`${p}/diarias/funcionario/${ANA}`, "pessoal/diarias-funcionario.png", o],
        [`${p}/diarias/5b200000-0000-4000-8000-000000000001`, "pessoal/diarias-registro.png", o],
        [`${p}/reembolsos/funcionario/${ANA}`, "pessoal/reembolsos-funcionario.png", o],
        [`${p}/reembolsos/5c200000-0000-4000-8000-000000000001`, "pessoal/reembolsos-registro.png", o],
        [`${p}/faltas/funcionario/${ANA}`, "pessoal/faltas-funcionario.png", o],
        [`${p}/faltas/c47009d8-de16-47f8-bcc8-0b33be4cf064`, "pessoal/faltas-registro.png", o],
        [`${p}/atestados/funcionario/${ANA}`, "pessoal/atestados-funcionario.png", o],
        [`${p}/atestados/5f200000-0000-4000-8000-000000000001`, "pessoal/atestados-registro.png", { ...o, altura: 900 }],
        [`${p}/aso/funcionario/${ANA}`, "pessoal/aso-funcionario.png", o],
        [`${p}/aso/5f300000-0000-4000-8000-000000000001`, "pessoal/aso-registro.png", { ...o, altura: 900 }],
        [`${p}/treinamentos/funcionario/${ANA}`, "pessoal/treinamentos-funcionario.png", o],
        [`${p}/treinamentos/5d100000-0000-4000-8000-000000000001?pessoa=${ANA}`, "pessoal/treinamentos-registro.png", o],
        [`${p}/atribuicoes/funcionario/${ANA}`, "pessoal/sst-funcionario.png", o],
      ]
    })()
  : process.env.RODADA === "semrota"
  ? [
      // Rodada de 17/10 (28): prints que estavam nos artigos sem rota no
      // script. Os que dependem de algo além do login do operador ficam
      // marcados — rodar só com o que a nota pede (os demais saem direto).
      ["/painel/ferramentas/oficios", "ferramentas/oficios-lista.png", { esperar: "Você vê os ofícios de todos os departamentos", altura: 1000 }],
      ["/painel/institucional/linhas", "institucional/linhas.png", { esperar: "Adicionar linha", altura: 1000 }],
      ["/painel/institucional/linhas/11e00000-0000-4000-8000-000000000001", "institucional/linha.png", { esperar: "Editar linha", altura: 800 }],
      ["/painel/institucional/organizacao/departamentos/de100000-0000-4000-8000-000000000001", "institucional/departamento.png", { esperar: "Editar departamento", altura: 900 }],
      ["/painel/institucional/diretoria/instancias", "institucional/diretoria-instancias.png", { esperar: "Nova instância", altura: 1000 }],
      ["/painel/institucional/diretoria/diarias", "institucional/diretoria-diarias.png", { esperar: "Lançar diária", altura: 1100 }],
      ["/painel/institucional/diretoria/diarias", "institucional/diretoria-lancar-diaria.png", { esperar: "Lançar diária", abrir: ["Lançar diária"], fullPage: true }],
      ["/painel/institucional/diretoria/fe600000-0000-4000-8000-000000000001/liberacoes", "institucional/liberacoes-lote.png", { esperar: "Registrar liberação", abrir: ["Registrar liberação", "Várias liberações"], fullPage: true }],
      ["/painel/institucional/usuarios/c06b8d80-f07c-4cfd-9205-6ef59e334ccb", "institucional/conta-funcao.png", { esperar: "Quem ocupa o posto", fullPage: true }],
      ["/painel/institucional/usuarios/c06b8d80-f07c-4cfd-9205-6ef59e334ccb", "institucional/conta-funcao-cadastrar-pessoa.png", { esperar: "Quem ocupa o posto", passos: [{ clicar: "css=button:has-text(\"Cadastrar pessoa\") >> nth=0" }, { aguardar: "Cadastrar quem vai ocupar o posto" }], scrollTo: "Registrar quem entra no posto", altura: 1000 }],
      ["/painel/hospedagem/hoteis/40010000-0000-4000-8000-000000000001", "hospedagem/hotel-ficha.png", { esperar: "Visualizar", fullPage: true }],
      // Abre a visualização do hotel (cookie) e vai às contas; a visualização
      // só lê — o botão Cadastrar conta fica cinza.
      ["/painel/hospedagem/hoteis/40010000-0000-4000-8000-000000000001", "hospedagem/ver-como-hotel-botao.png", { esperar: "Visualizar", passos: [{ clicar: "Visualizar área" }, { pausa: 2500 }, { ir: "/hotel/contas" }, { aguardar: "Cadastrar conta" }], fullPage: true }],
      ["/painel/espacos/termo", "espacos/termo.png", { esperar: "marcadores", fullPage: true }],
      ["/espaco/auditorio-plateia", "espacos/publico.png", { anon: true, esperar: "Auditório", fullPage: true }],
      ["/painel/pessoal/diarias/tipos", "pessoal/diarias-tipos.png", { esperar: "Vale para", altura: 1000 }],
      ["/painel/pessoal/diarias/contas", "pessoal/diarias-contas.png", { esperar: "Tipos de despesa extra", fullPage: true }],
      ["/painel/pessoal/33333333-3333-4333-8333-000000000001", "pessoal/funcionarios-vinculo-edicao.png", { esperar: "Áreas", passos: [{ clicar: 'css=button[aria-label="Editar vínculo"]' }, { aguardar: "Salvar vínculo" }], scrollTo: "Salvar vínculo", altura: 1000 }],
      ["/painel/representacao/votacoes/rodadas/ea000000-0000-4000-8000-000000000003?aba=aptos", "representacao/aptos-importar.png", { esperar: "Importar aptos", abrir: ["Importar aptos (CSV)"], scrollTo: "Importar aptos", altura: 1000 }],
      ["/painel/representacao/votacoes/rodadas/ea000000-0000-4000-8000-000000000003?aba=divulgacao", "representacao/aviso-aptos.png", { esperar: "Aviso por e-mail", scrollTo: "Aviso por e-mail", altura: 900 }],
      // As que pediam cenário, outro login ou arquivo foram para as rodadas
      // "cenarios", "fiscal" e "diretora"; os e-mails, para scripts/manual-prints-emails.mjs.
    ]
  : process.env.RODADA === "cenarios"
  ? [
      // Rodada de 18/10 (29): telas que pedem uma situação na demo. ANTES:
      //   node scripts/manual-prints-cenarios.mjs montar
      // e DEPOIS (sempre): node scripts/manual-prints-cenarios.mjs desfazer
      // A ata precisa de ATA_TESTE=<pdf de uma ata fictícia> e de crédito na IA.
      // Cenários de 17/10 (a preventiva primeiro: o V-001 precisa estar na garagem).
      ["/painel/veiculos/4e000000-0000-4000-8000-000000000001", "veiculos/veiculo-preventiva.png", { esperar: "Manutenção preventiva se aproximando" }],
      ["/painel/veiculos/abastecimentos?veiculo=sem", "veiculos/abastecimento-editar.png", { esperar: "Incluir abastecimentos", passos: [{ clicar: "08/09/2026" }, { aguardar: "Dados do lançamento" }, { selecionar: ["#veiculo_id", "ABC1D23 — Fiat Cronos"] }, { pausa: 800 }], fullPage: true }],
      ["/painel/veiculos/condutores/4d000000-0000-4000-8000-000000000001", "veiculos/condutor.png", { esperar: "Veículos mais usados", passos: [{ clicar: "css=details summary" }] }],
      ["/painel/saude/cat/duplicidades", "saude/cat-duplicidades.png", { esperar: "Duplicidades", altura: 1100 }],
      // Os três do estorno, NESTA ordem: o segundo registra o estorno de verdade.
      ["/painel/financeiro/ordens/e5700000-0000-4000-8000-000000000001", "financeiro/estorno-registrar.png", { esperar: "Detalhes do pagamento", passos: [{ clicar: "Registrar estorno" }, { preencher: ["#motivo_estorno", "Chave Pix de destino inexistente — devolvido pelo banco"] }], scrollTo: "Detalhes do pagamento", altura: 1000 }],
      ["/painel/financeiro/ordens/e5700000-0000-4000-8000-000000000001", "financeiro/estorno-ordem.png", { esperar: "Detalhes do pagamento", passos: [{ clicar: "Registrar estorno" }, { preencher: ["#motivo_estorno", "Chave Pix de destino inexistente — devolvido pelo banco"] }, { clicar: 'css=form button[type="submit"]:has-text("Registrar estorno")' }, { aguardar: "Estorno registrado" }], altura: 900 }],
      ["/painel/estornos", "financeiro/estorno-corrigir.png", { esperar: "Meus estornos", passos: [{ clicar: "2026.0928.1015.7710" }, { aguardar: "Conferir e reencaminhar" }, { pausa: 2500 }], fullPage: true }],
      // Cenários de 18/10.
      ["/assinar/9514fe89-13b7-4e77-9e7b-cf722d4473bf","espacos/assinatura.png",{"anon":true,"esperar":"assin","fullPage":true}],
      ["/comprovante/VT-7Q2M-K9XA","representacao/comprovante-publico.png",{"anon":true,"esperar":"VT-7Q2M-K9XA","fullPage":true}],
      ["/painel/saude/cat/nova","saude/cat-verificar-numero.png",{"esperar":"Cadastro individual","passos":[{"preencher":["#numero-cat","2019.000.111-1/03"]},{"clicar":"css=button:has-text(\"Verificar\") >> nth=0"},{"aguardar":"Atualização de uma CAT"},{"pausa":1000}],"scrollTo":"Cadastro individual","altura":1100}],
      ["/painel/institucional/diretoria/diarias/remessas/06de932e-d050-4618-bc39-5c791a375566","pessoal/diarias-remessa-preparacao.png",{"esperar":"Em preparação","fullPage":true}],
      ["/painel/pessoal/diarias/5b200000-0000-4000-8000-000000000002","pessoal/diarias-despesa-depois.png",{"esperar":"Despesas depois da viagem","scrollTo":"Despesas depois da viagem","altura":1000}],
      ["/painel/veiculos/agendamentos","veiculos/reserva-terceiro.png",{"esperar":"Reservar para outra pessoa","passos":[{"clicar":"css=summary:has-text(\"Reservar para outra pessoa\")"},{"aguardar":"Para quem é a reserva"},{"selecionar":["#terceiro-condutor","Mariana Souza Ribeiro"]},{"preencher":["form:has(#terceiro-condutor) [name=\"motivo\"]","Reunião no Conselho Municipal de Saúde"]},{"preencher":["form:has(#terceiro-condutor) [name=\"destino\"]","Niterói"]},{"preencher":["form:has(#terceiro-condutor) [name=\"data_retirada\"]","2026-10-25"]},{"preencher":["form:has(#terceiro-condutor) [name=\"data_retorno\"]","2026-10-25"]},{"selecionar":["#terceiro-veiculo","ABC1D23 — Fiat Cronos (Sede)"]}],"scrollTo":"Reservar para outra pessoa","altura":1000}],
      ["/painel/institucional/atas/novo","institucional/ata-ia.png",{"esperar":"Ao escolher o arquivo","passos":[{"anexar":["#documento",ATA_TESTE]},{"aguardar":"A IA preencheu"},{"pausa":1000}],"fullPage":true}],
      ["/painel/representacao/votacoes/rodadas/ea000000-0000-4000-8000-000000000003?aba=aptos&busca=Paulo","fluxos-publicos/votacao-primeiro-acesso.png",{"esperar":"Paulo Henrique Lima","passos":[{"clicar":"css=button[aria-label=\"Visualizar área do eleitor\"] >> nth=0"},{"aguardar":"nascimento"},{"pausa":1000}],"altura":900}],
    ]
  : process.env.RODADA === "cenarios-saida"
  ? [
      // Depois de "manual-prints-cenarios.mjs saida": V-001 fora há 2 h com 10.000 km.
      ["/painel/veiculos/4e000000-0000-4000-8000-000000000001/movimentacao", "veiculos/devolucao-km-anormal.png", { esperar: "Registrar devolução", preencher: [["#hodometro", "10.500"]], altura: 760 }],
    ]
  : process.env.RODADA === "fiscal"
  ? [
      // Com PRINT_EMAIL=fiscal@confluir.local (perfil Conselho Fiscal, só leitura).
      ["/painel","institucional/conselho-fiscal-painel.png",{"esperar":"Conselho Fiscal","altura":900}],
      ["/painel/financeiro/ordens/eec00000-0000-4000-8000-000000000002","institucional/conselho-fiscal-ordem.png",{"esperar":"Detalhes","fullPage":true}],
      ["/painel/patrimonio/itens","institucional/conselho-fiscal-patrimonio.png",{"esperar":"Itens patrimoniais","altura":900}],
    ]
  : process.env.RODADA === "diretora"
  ? [
      // Com PRINT_EMAIL=mariana.demo@exemplo.com — o cenário liga o login dela.
      ["/painel/perfil","introducao/meu-perfil-diretor.png",{"esperar":"Minha diretoria","fullPage":true}],
    ]
  : process.env.RODADA === "areas"
  ? [
      // Rodada de 17/10 (25): as outras áreas do Pessoal no padrão de 3 níveis
      // (nível 1 = indicadores, fila e aba Funcionários) e as abas que os artigos descrevem.
      ["/painel/pessoal/contracheques", "pessoal/contracheques-area.png", { esperar: "Valor líquido no ano", altura: 1000 }],
      ["/painel/pessoal/contracheques/44444444-4444-4444-8444-000000000001", "pessoal/contracheques-remessa.png", { esperar: "Adicionar contracheque", passos: [{ pausa: 2000 }, { ir: "/painel/pessoal/contracheques/44444444-4444-4444-8444-000000000001" }, { aguardar: "Liberar todos" }, { pausa: 1000 }], altura: 1100 }],
      ["/painel/pessoal/ponto?aba=remessas", "pessoal/ponto-remessas.png", { esperar: "Meses sem remessa", altura: 1000 }],
      ["/painel/pessoal/informes", "pessoal/informes-area.png", { esperar: "Anos-base", altura: 900 }],
      ["/painel/pessoal/informes?aba=remessas", "pessoal/informes.png", { esperar: "Anos-base", altura: 900 }],
      ["/painel/pessoal/niveis", "pessoal/niveis-area.png", { esperar: "Salário básico (soma)", altura: 1000 }],
      ["/painel/pessoal/niveis?aba=lancamentos", "pessoal/niveis.png", { esperar: "Salário básico (soma)", altura: 1000 }],
      ["/painel/pessoal/anuenios", "pessoal/anuenios-area.png", { esperar: "Ativos com anuênio", altura: 1000 }],
      ["/painel/pessoal/anuenios?aba=lancamentos", "pessoal/anuenios.png", { esperar: "Ativos com anuênio", altura: 1000 }],
      ["/painel/pessoal/diarias", "pessoal/diarias-area.png", { esperar: "Funcionários", altura: 1000 }],
      ["/painel/pessoal/diarias?aba=solicitacoes", "pessoal/diarias.png", { esperar: "Funcionários", altura: 1000 }],
      ["/painel/pessoal/reembolsos", "pessoal/reembolsos-area.png", { esperar: "Aprovados a pagar", altura: 1000 }],
      ["/painel/pessoal/reembolsos?aba=solicitacoes", "pessoal/reembolsos.png", { esperar: "Aprovados a pagar", altura: 1000 }],
      ["/painel/pessoal/faltas", "pessoal/faltas-area.png", { esperar: "No limite do ano", altura: 1000 }],
      ["/painel/pessoal/atestados", "pessoal/atestados-area.png", { esperar: "Acima de 15 dias", altura: 1000 }],
      ["/painel/pessoal/atestados?aba=atestados", "pessoal/atestados.png", { esperar: "Acima de 15 dias", altura: 1000 }],
      // Recarrega para o aviso "Novidades no Confluir" (1ª visita) não cobrir a tabela.
      ["/painel/pessoal/atestados?aba=ausencias", "pessoal/atestados-ausencias.png", { esperar: "Registrar ausência", passos: [{ pausa: 2000 }, { ir: "/painel/pessoal/atestados?aba=ausencias" }, { aguardar: "Registrar ausência" }, { pausa: 1500 }], altura: 1000 }],
      ["/painel/pessoal/aso", "pessoal/aso-area.png", { esperar: "Vencem em 90 dias", altura: 1000 }],
      ["/painel/pessoal/aso?aba=registros", "pessoal/aso.png", { esperar: "Vencem em 90 dias", altura: 1000 }],
      ["/painel/pessoal/treinamentos", "pessoal/treinamentos-area.png", { esperar: "Exigidos pendentes", altura: 1000 }],
      ["/painel/pessoal/treinamentos?aba=catalogo", "pessoal/treinamentos.png", { esperar: "Exigidos pendentes", altura: 1000 }],
      ["/painel/pessoal/atribuicoes/funcionarios", "pessoal/sst-funcionarios.png", { esperar: "SST por funcionário", altura: 1000 }],
    ]
  : process.env.RODADA === "ferias"
  ? [
      // Rodada de 17/10 (24): Férias no padrão de 3 níveis e os dias autorizados.
      ["/painel/pessoal/ferias", "pessoal/ferias-area.png", { esperar: "Distribuição por mês", altura: 1100 }],
      ["/painel/pessoal/ferias/funcionario/33333333-3333-4333-8333-000000000001", "pessoal/ferias-funcionario.png", { esperar: "Dias autorizados", altura: 1000 }],
    ]
  : process.env.RODADA === "associado"
  ? [
      // Rodada de 18/10 (30): Filiados › Área do associado. Fica representativo
      // com uma parte suspensa e outra desabilitada no tenant demo (desfazer
      // depois). Capturado, trocar no artigo filiados/area-do-associado.mdx o
      // <Print alt=… /> sem src por <Print src="filiados/area-do-associado.png" …/>.
      ["/painel/filiados/area-do-associado", "filiados/area-do-associado.png", { esperar: "Situação das partes", fullPage: true }],
    ]
  : [
  // Rodada de 17/10 (22): padrão de 3 níveis do Pessoal (área → funcionário → registro) e a ficha com o painel Áreas.
  ["/painel/pessoal/ponto", "pessoal/padrao-area.png", { esperar: "Meses sem remessa", altura: 1000 }],
  ["/painel/pessoal/carreira/funcionario/33333333-3333-4333-8333-000000000001", "pessoal/padrao-funcionario.png", { esperar: "Próxima progressão", altura: 1100 }],
  ["/painel/pessoal/ponto/funcionario/33333333-3333-4333-8333-000000000002/e69d0926-6d0b-44b4-863b-ca6a610763be?de=remessa", "pessoal/padrao-registro.png", { esperar: "Marcações dia a dia", altura: 1100 }],
  ["/painel/pessoal/33333333-3333-4333-8333-000000000001", "pessoal/funcionarios-ficha.png", { esperar: "Áreas", altura: 1300 }],
  ]

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- rodada anterior
const SHOTS_RODADA_21 = [
  // Rodada de 16/10 (21): indicadores e resenha do ponto. Remessa demo de
  // março/2026 com espelhos FICTÍCIOS (gerados por script, layout Secullum) e
  // resenhas já geradas da remessa e do Administrativo.
  ["/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001?aba=indicadores", "pessoal/ponto-indicadores.png", { esperar: "Funcionários em atenção", altura: 1300 }],
  ["/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001?aba=indicadores", "pessoal/ponto-resenha.png", { esperar: "Riscos trabalhistas", scrollTo: "Resenha da IA", altura: 1200 }],
  // Rodada de 21/10: remessa com indicadores e o registro em HH:MM (dados da
  // demo como estão: março sem remessa anterior, saldos zerados).
  ["/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001", "pessoal/ponto-remessa.png", { esperar: "Horas pagas no mês", passos: [{ pausa: 2000 }, { ir: "/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001" }, { aguardar: "Liberar todos" }, { pausa: 1000 }], altura: 1250 }],
  ["/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001?editar=d7c7e57f-4ec9-4ea7-970f-7e40d7d77e31", "pessoal/ponto-registro-form.png", { esperar: "Saldo remanescente", passos: [{ pausa: 2000 }, { ir: "/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001?editar=d7c7e57f-4ec9-4ea7-970f-7e40d7d77e31" }, { aguardar: "Apurar pelas batidas" }, { pausa: 1000 }], altura: 900 }],
  // Pede remessas temporárias Abril/2026 (aberta) e Maio/2026 (finalizada) com registro da Ana, apagadas depois; o print para no diálogo (nada é salvo).
  // ["/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001?editar=d7c7e57f-4ec9-4ea7-970f-7e40d7d77e31", "pessoal/ponto-recalcular-posteriores.png", { esperar: "Saldo remanescente", passos: [{ pausa: 2000 }, { ir: "/painel/pessoal/ponto/55555555-5555-4555-8555-000000000001?editar=d7c7e57f-4ec9-4ea7-970f-7e40d7d77e31" }, { aguardar: "Apurar pelas batidas" }, { preencher: ["#horas_realizadas_70", "10:00"] }, { clicar: 'css=button[type=submit]:has-text("Salvar registro")' }, { aguardar: "Recalcular as remessas posteriores?" }, { pausa: 700 }], altura: 900 }],
  // Pede uma remessa temporária "Folha — Outubro/2026" (55555555-…-0000000000c1), uma folha FICTÍCIA de 4 páginas (pdf-lib, a 3ª com o líquido errado) importada e 3 aplicados com a geração de ordens desligada só no teste; tudo apagado depois.
  // ["/painel/pessoal/contracheques/55555555-5555-4555-8555-0000000000c1/importar/<importação>", "pessoal/contracheques-importacao.png", { esperar: "Funcionários da folha", passos: [{ pausa: 2000 }, { ir: "<a mesma rota>" }, { aguardar: "Funcionários da folha" }, { pausa: 1200 }], fullPage: true }],
  // O grupo fica no fim da página: tirar fullPage e recortar as últimas 1440 px (sem a barra lateral, left 540).
  // Os dois abaixo pedem a remessa temporária 55555555-…-0000000000a7 (Julho/2026) e um cartão
  // ponto FICTÍCIO com funcionários da demo (gerado com pdf-lib), apagados depois; nunca o relatório real.
  // ["/painel/pessoal/ponto/55555555-5555-4555-8555-0000000000a7/importar/<importação>", "pessoal/ponto-importacao.png", { esperar: "Funcionários do relatório", passos: [{ clicar: 'css=button:has-text("Dias") >> nth=0' }, { pausa: 1000 }], fullPage: true }],
  // ["/painel/pessoal/ponto/55555555-5555-4555-8555-0000000000a7?novo=1", "pessoal/ponto-registro-apurar.png", { esperar: "Apurar pelas batidas", passos: [{ selecionar: ["#funcionario_id", "Ana Beatriz Nogueira"] }, { anexar: ["#arquivo", "<cartão de uma página>"] }, { clicar: "Apurar pelas batidas" }, { aguardar: "Realizadas preenchidas" }, { pausa: 600 }], scrollTo: "Adicionar registro de ponto", altura: 900 }],
  ["/painel/pessoal/ponto?regras=1", "pessoal/ponto-faixas.png", { esperar: "Salvar regras", fullPage: true }],
  // Pede duas isenções temporárias na demo (uma vigente, uma encerrada), apagadas depois.
  ["/painel/pessoal/ponto?aba=isencoes&nova=1", "pessoal/ponto-isencoes.png", { esperar: "Nova isenção de registro de ponto", scrollTo: "Quem está isento no mês inteiro", altura: 950 }],
  // Pede uma remessa temporária de abril sem registros, Igor isento no mês inteiro e Helena de 01 a 15/04.
  ["/painel/pessoal/ponto/55555555-5555-4555-8555-0000000000a4", "pessoal/ponto-remessa-isentos.png", { esperar: "Isentos de registro de ponto nesta competência", passos: [{ clicar: 'css=summary:has-text("Funcionários ativos sem registro")' }, { clicar: 'css=summary:has-text("Isentos de registro de ponto")' }, { pausa: 800 }], scrollTo: "Liberados ao funcionário", altura: 1000 }],
  ]

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- rodada anterior
const SHOTS_RODADA_20 = [
  // Rodada de 16/10 (20): movimento da folha para a contabilidade. Na demo,
  // Outubro/2026 ficou enviada e recebida (dados "TESTE MOVIMENTO") e uma
  // falta de 14/10 lançada depois do envio caiu em Novembro como retroativa.
  ["/painel/pessoal", "pessoal/painel-visao-geral.png", { esperar: "Movimento da folha", fullPage: true }],
  ["/painel/pessoal/contabilidade", "pessoal/movimento-folha-lista.png", { esperar: "Competências enviadas", altura: 720 }],
  ["/painel/pessoal/contabilidade/2026-10", "pessoal/movimento-folha-competencia.png", { esperar: "Alterações contratuais", altura: 1000 }],
  ["/painel/pessoal/contabilidade/2026-11", "pessoal/movimento-folha-retroativo.png", { esperar: "Retroativo", altura: 600 }],
  ]

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- rodadas anteriores, guardadas para refazer
const SHOTS_ANTIGOS = [
  /*
  // Rodada de 09/10 (19): RPA — entrada no contrato e na compra, gestão na
  // área própria, assinatura pelo link (estado montado por script: link
  // pendente no RPA nº 1 da demo, sem e-mail; desfeito depois).
  ["/painel/compras/rpa", "compras/rpa-lista.png", { esperar: "Prestador e contrato", altura: 760 }],
  ["/painel/compras/rpa/d6b033ca-666e-4ac8-9907-61b142f54251", "compras/rpa.png", { esperar: "Pelo link no e-mail", scrollTo: "Recibo assinado", altura: 860 }],
  ["/painel/compras/contratos/c1100000-0000-4000-8000-000000000010", "compras/rpa-anexar.png", { esperar: "Anexar RPA assinado", scrollTo: "RPA — pagamento a autônomo", altura: 760, passos: [{ clicar: "css=button:has-text(\"Anexar RPA assinado\")" }, { aguardar: "RPA nº 1 assinado" }] }],
  ["/painel/compras/contratos/c1100000-0000-4000-8000-000000000010", "compras/contrato-hierarquia.png", { esperar: "RPA — pagamento a autônomo", scrollTo: "Dados do contrato", altura: 1100 }],
  // O Chromium headless não exibe PDF embutido: o print foca o passo a passo.
  // Aviso de férias (28/10): pede gozo autorizado da Ana + envelope documento_assinaturas
  // pendente (TOKEN_FERIAS), desfeitos depois; o passo pdfComoImagem desenha o PDF.
  // [`/assinar/${TOKEN_FERIAS}`, "pessoal/ferias-aviso-assinar.png", { anon: true, esperar: "Receba o código", passos: [{ pdfComoImagem: true }, { pausa: 800 }], fullPage: true }],
  [`/assinar/${TOKEN_RPA}`, "compras/rpa-assinar.png", { anon: true, esperar: "Receba o código", ocultarCartao: "Confira o serviço", altura: 920 }],
  */

  // Rodada de 09/10 (18): agenda do portal, que desde 10/09 é a seção "Agenda
  // de atividades" da página Eventos e agenda. As 3 atividades da demo
  // (40210000-…-0001..0003) foram levadas para out/nov de 2026.
  ["/portal/eventos", "portal/agenda.png", { esperar: "Assembleia geral extraordinária", fullPage: true }],

  /* Rodada de 09/10 (17): saúde dos cadastros configurável + categorias de
  // fonte. Na bancada demo a Refinaria Modelo (0 filiados) fica na categoria
  // "Órgão público"; durante o print o regime de trabalho do Empregador vira
  // apontamento (config restaurada depois, fora do script).
  ["/painel/filiados", "filiados/lista.png", { fullPage: true, esperar: "possível duplicidade para conferir" }],
  ["/painel/filiados/cadastros-pendentes", "filiados/cadastros-pendentes.png", { esperar: "Com apontamento", fullPage: true }],
  ["/painel/filiados/saude-cadastros/configuracao", "filiados/saude-config.png", { esperar: "Vínculo em aberto", fullPage: true }],
  ["/painel/representacao/empregadores/categorias", "representacao/categorias.png", { esperar: "Nova categoria", altura: 820 }],
  ["/painel/representacao/empregadores/f0f0f0f0-0000-4000-8000-000000000003/editar", "representacao/fonte-categoria.png", { esperar: "Gerenciar categorias", altura: 620 }],
  */

  /* Rodada de 08/10 (16): avaliação das diárias pela REMESSA. Remessa aberta
  // do diretor José (2 diárias + jantar, e7b3bacc…) — os prints de devolução
  // DEVOLVEM a remessa de verdade; a do Carlos (6b7fddf3…) já foi aprovada,
  // com devolução e reenvio no histórico.
  ["/painel/institucional/diretoria/diarias/remessas", "institucional/diretoria-remessas.png", { esperar: "Em avaliação", altura: 1000 }],
  ["/painel/institucional/diretoria/diarias/d2197cc8-78ff-4a73-b0f1-a8f463efdb06", "institucional/diretoria-diaria.png", { esperar: "Dados da solicitação", fullPage: true }],
  ["/painel/institucional/diretoria/diarias/remessas/e7b3bacc-a686-4233-86d0-b98709f888cc", "pessoal/diarias-remessa.png", { esperar: "Avaliação da remessa", fullPage: true }],
  ["/painel/institucional/diretoria/diarias/remessas/e7b3bacc-a686-4233-86d0-b98709f888cc", "pessoal/diarias-remessa-devolver.png", { esperar: "Avaliação da remessa", passos: [{ clicar: "Devolver com observação" }, { preencher: ["#observacao", "Falta o relatório da reunião de 21/10."] }, { clicar: 'css=input[type="checkbox"] >> nth=1' }, { preencher: ['input[name="pendencia_3a50e5d8-5c93-4eab-8ca9-f0eb7210f395"]', "Anexar a ata ou o relatório da reunião"] }], scrollTo: "Avaliação da remessa", altura: 1000 }],
  ["/painel/institucional/diretoria/diarias/remessas/e7b3bacc-a686-4233-86d0-b98709f888cc", "pessoal/diarias-remessa-devolvida.png", { esperar: "Avaliação da remessa", passos: [{ clicar: "Devolver com observação" }, { preencher: ["#observacao", "Falta o relatório da reunião de 21/10."] }, { clicar: 'css=input[type="checkbox"] >> nth=1' }, { preencher: ['input[name="pendencia_3a50e5d8-5c93-4eab-8ca9-f0eb7210f395"]', "Anexar a ata ou o relatório da reunião"] }, { clicar: 'css=button[type="submit"]:has-text("Devolver a remessa")' }, { clicar: 'css=[role="alertdialog"] button:has-text("Devolver")' }, { aguardar: "Reenviar para avaliação" }, { pausa: 1500 }], fullPage: true }],
  ["/painel/institucional/diretoria/diarias/remessas/6b7fddf3-1846-4db4-9e9e-f5445889180f", "pessoal/diarias-remessa-aprovada.png", { esperar: "Histórico da avaliação", scrollTo: "Avaliação da remessa", altura: 900 }],
  ["/painel/pessoal/diarias/contas", "pessoal/diarias-autorizacao.png", { esperar: "Autorização das ordens das remessas", altura: 820 }],
  */

  /* Rodada de 30/09 (15): Painel analítico da Saúde (estilo Power BI). O demo
  // recebe CATs fictícias (bubble_id "demo-painel-saude-*") só para o print.
  ["/painel/saude/indicadores", "saude/painel-analitico.png", { esperar: "CATs por ano", fullPage: true }],
  ["/painel/saude/indicadores", "saude/painel-analitico-filtro.png", { esperar: "CATs por ano", passos: [{ clicar: 'css=button:has-text("Trajeto") >> nth=0' }, { pausa: 400 }, { clicar: 'css=button[title^="2024:"]' }, { aguardar: "CATs por mês" }, { pausa: 600 }], altura: 1500 }],
  */

  /*  // Rodada de 30/09 (14): abastecimentos — a prévia da leitura pela IA (placa
  // fora da frota entra sem veículo), o resultado, a lista e a edição de um
  // lançamento sem veículo. Precisa de FATURA_TESTE (PDF); os lançamentos são
  // apagados pelo teste.
  ...(FATURA
    ? [["/painel/veiculos/abastecimentos/novo", "veiculos/abastecimentos-ia-previa.png", { esperar: "Ler relatório com IA", passos: [{ anexar: ["#arquivo-abastecimento-ia", FATURA] }, { clicar: 'css=button[type="submit"]:has-text("Ler relatório com IA")' }, { aguardar: "A IA leu" }], scrollTo: "Ler relatório com IA", altura: 1100 }],
       ["/painel/veiculos/abastecimentos/novo", "veiculos/abastecimentos-ia-lancados.png", { esperar: "Ler relatório com IA", passos: [{ anexar: ["#arquivo-abastecimento-ia", FATURA] }, { clicar: 'css=button[type="submit"]:has-text("Ler relatório com IA")' }, { aguardar: "A IA leu" }, { clicar: "Confirmar e lançar" }, { aguardar: "lançados" }], altura: 700 }],
       ["/painel/veiculos/abastecimentos", "veiculos/abastecimentos-lista.png", { esperar: "Incluir abastecimentos", altura: 900 }],
       ["/painel/veiculos/abastecimentos?veiculo=sem", "veiculos/abastecimento-editar.png", { esperar: "Incluir abastecimentos", passos: [{ clicar: "08/09/2026" }, { aguardar: "Dados do lançamento" }, { selecionar: ["#veiculo_id", "ABC1D23 — Fiat Cronos"] }, { pausa: 800 }], fullPage: true }]]
    : []),
  */

  /* Rodada de 30/09 (13): estorno de pagamento — o comunicado na ordem paga, a
  // ordem estornada, a lista do Financeiro e a correção por quem lançou.
  // Ordem de exemplo semeada e apagada pelo teste (e5700000-…-0001).
  ["/painel/financeiro/ordens/e5700000-0000-4000-8000-000000000001", "financeiro/estorno-registrar.png", { esperar: "Detalhes do pagamento", passos: [{ clicar: "Registrar estorno" }, { preencher: ["#motivo_estorno", "Chave Pix de destino inexistente — devolvido pelo banco"] }], scrollTo: "Detalhes do pagamento", altura: 1000 }],
  ["/painel/financeiro/ordens/e5700000-0000-4000-8000-000000000001", "financeiro/estorno-ordem.png", { esperar: "Detalhes do pagamento", passos: [{ clicar: "Registrar estorno" }, { preencher: ["#motivo_estorno", "Chave Pix de destino inexistente — devolvido pelo banco"] }, { clicar: 'css=form button[type="submit"]:has-text("Registrar estorno")' }, { aguardar: "Estorno registrado" }], altura: 900 }],
  ["/painel/financeiro/estornos", "financeiro/estornos-lista.png", { esperar: "Prazo para registrar", altura: 760 }],
  ["/painel/estornos", "financeiro/estorno-corrigir.png", { esperar: "Meus estornos", passos: [{ clicar: "2026.0928.1015.7710" }, { aguardar: "Conferir e reencaminhar" }, { pausa: 2500 }], fullPage: true }],
  */

  /* Rodada de 30/09 (12): Fornecedores — painel com indicadores, lista com
  // ordenação/paginação/alertas e a ficha com indicadores e o aviso do cadastro.
  ["/painel/compras/fornecedores", "compras/fornecedores-painel.png", { esperar: "Maiores fornecedores", fullPage: true }],
  ["/painel/compras/fornecedores/lista?ordem=problemas&dir=desc", "compras/fornecedores-lista.png", { esperar: "Cadastro", altura: 1000 }],
  ["/painel/compras/fornecedores/f0f0f0f0-0000-4000-8000-000000000004", "compras/fornecedor.png", { esperar: "Pago em 12 meses", altura: 1100 }],
  */

  /* Rodada de 30/09 (11): Auditoria das ordens — regras de Compras, a ordem com
  // as verificações na criação e a fila de avaliação com os alertas. A ordem de
  // exemplo (compra direta de R$ 15.000) é criada e apagada pelo teste.
  ["/painel/financeiro/auditoria?origem=compras", "financeiro/auditoria-regras.png", { esperar: "Auditoria das ordens", fullPage: true }],
  ["/painel/financeiro/ordens/eb6f7eb6-33c5-4532-9a59-9469eede24e3", "financeiro/ordem-verificacoes.png", { esperar: "Verificações da auditoria", scrollTo: "Verificações da auditoria", altura: 1000 }],
  ["/painel/compras/avaliacoes", "compras/avaliacoes.png", { esperar: "Na sua alçada", altura: 1100 }],
  */

  /* Rodada de 30/09 (10): rito do Financeiro — ordem com procedência e
  // auditoria (RPA nº 1 do demo) e a fila de avaliação de todas as origens.
  // ["/painel/financeiro/ordens/6d9b771a-a900-4fa9-8f87-0b5632755778", "financeiro/ordem-detalhe.png", { esperar: "Auditoria automática", altura: 1500 }],
  ["/painel/compras/avaliacoes", "compras/avaliacoes.png", { esperar: "Na sua alçada", altura: 1100 }],
  */

  /* Rodada de 29/09 (9): Nova compra — entrega no ato, modos da compra direta,
  // leitura da nota pela IA e formas de pagamento; Financeiro → Cartões (os dois
  // cartões fictícios do demo ficam cadastrados).
  ["/painel/compras/nova", "compras/nova.png", { esperar: "Entrega no ato da compra", altura: 1000 }],
  ["/painel/compras/nova", "compras/nova-direta-modo.png", { esperar: "Entrega no ato da compra", passos: [{ clicar: SWITCH_DIRETA }, { aguardar: "Como preencher?" }], altura: 760 }],
  ...(CUPOM
    ? [["/painel/compras/nova", "compras/nova-semi.png", {
        esperar: "Entrega no ato da compra",
        passos: [{ clicar: SWITCH_DIRETA }, { clicar: 'css=button[aria-pressed]:has-text("Semiautomático")' }, { anexar: ["#nota_fiscal_semi", CUPOM] }, { clicar: "Ler com IA" }, { aguardar: "lido. Confira" }],
        scrollTo: "Nota fiscal, cupom ou documento equivalente",
        altura: 1500,
      }]]
    : []),
  ["/painel/compras/nova", "compras/nova-pagamento.png", {
    esperar: "Entrega no ato da compra",
    passos: [
      { clicar: SWITCH_DIRETA },
      { clicar: 'css=button[aria-pressed]:has-text("Manual")' },
      { preencher: ['input[placeholder="Busque por nome fantasia, razão social ou CNPJ/CPF"]', "Tech Supri"] },
      { clicar: "Tech Suprimentos" },
      { selecionar: ["#forma_pagamento", "Pix"] },
      { aguardar: "Chave Pix do fornecedor" },
      { pausa: 2500 },
      { selecionar: ["#dados_bancarios_id", "Informar outra chave…"] },
    ],
    fullPage: true,
  }],
  ["/painel/financeiro/cartoes", "financeiro/cartoes.png", { esperar: "Cartão da Tesouraria", altura: 900 }],
  */

  /* Rodada de 29/09 (8): página do empregador com abas, reuniões e setoriais.
  ["/painel/representacao/empregadores/f0f0f0f0-0000-4000-8000-000000000001", "representacao/empregador.png", { esperar: "Filiados ativos", altura: 900 }],
  ["/painel/representacao/empregadores/f0f0f0f0-0000-4000-8000-000000000001/reunioes/nova?tipo=empregador", "representacao/reuniao-nova.png", { esperar: "Ata em PDF", fullPage: true }],

  */

  /* Rodada de 29/09 (7): hierarquia Contrato › Minuta › RPA — seed:
  // scripts/seed-prints-rpa.mjs (contrato de autônomo) + um RPA emitido pela tela.
  ["/painel/compras/contratos/c1100000-0000-4000-8000-000000000010", "compras/contrato-hierarquia.png", { esperar: "RPA — pagamento a autônomo", scrollTo: "Dados do contrato", altura: 1100 }],
  ["/painel/compras/contratos/rpa/d6b033ca-666e-4ac8-9907-61b142f54251", "compras/rpa.png", { esperar: "Contrato e pagamento", scrollTo: "Contrato e pagamento", altura: 900 }],
  */

  /* Rodada de 29/09 (6): a comparação de acordos, com a IA (OpenAI) de volta —
  // Petrobras 2020-2022 × 2023-2025 da semente scripts/seed-prints-acordos.mjs.
  ["/painel/representacao/acordos/comparacoes/fc3722f5-e3ac-494e-aefc-2ae0a3a495f6", "representacao/comparacao.png", { esperar: "Favoráveis ao trabalhador" }],
  ["/painel/representacao/acordos/comparacoes/fc3722f5-e3ac-494e-aefc-2ae0a3a495f6", "representacao/comparacao-diferenca.png", { esperar: "Favoráveis ao trabalhador", abrir: ["Ver a diferença no texto"], scrollTo: "O que mudou", altura: 1000 }],
  */

  /* Rodada de 29/09 (5): Ofícios — tipo antes do formulário e editor com formatação.
  ["/painel/ferramentas/oficios/novo", "ferramentas/oficio-novo.png", { esperar: "Tipo de ofício", altura: 640 }],
  ["/painel/ferramentas/oficios/fe800000-0000-4000-8000-000000000001", "ferramentas/oficios.png", { esperar: "Tipo de ofício", fullPage: true }],
  */

  /* Rodada de 29/09 (4): Condutores — seed temporária: scripts/seed-prints-condutor.mjs
  // (rodar --limpar depois dos prints; a demo não guarda esses dados).
  ["/painel/veiculos/condutores", "veiculos/condutores.png", { esperar: "Eduardo Prado Martins", altura: 720 }],
  ["/painel/veiculos/condutores/4d000000-0000-4000-8000-000000000001", "veiculos/condutor.png", { esperar: "Veículos mais usados", abrir: ["Histórico de CNH"] }],
  ["/painel/veiculos/condutores/4d000000-0000-4000-8000-000000000001", "veiculos/condutor-listas.png", { esperar: "Veículos mais usados", scrollTo: "Só devoluções com km fora do normal", altura: 900 }],
  */

  /* Rodada de 29/09 (3): forma de recebimento e regra da fonte pagadora.
  ["/painel/filiados/receitas/e0e0e0e0-0000-4000-8000-000300000006/f0f0f0f0-0000-4000-8000-000000000001", "filiados/receita-fonte.png", { esperar: "Enviar relação de pagamentos", abrir: ["Enviar relação de pagamentos"], scrollTo: "Enviar relação de pagamentos", altura: 900 }],
  ["/painel/institucional/organizacao", "institucional/regras-filiacao.png", { esperar: "Regras de filiação", scrollTo: "Regras de filiação", altura: 420 }],
  */

  /* Rodada de 29/09 (2): Minutas de contrato — usa a minuta assinada da Gráfica
  // Modelo e as 2 cláusulas fixas que ficaram na demo depois do E2E de 27–28/09.
  ["/painel/compras/contratos", "compras/contratos-subareas.png", { esperar: "Minutas", altura: 720 }],
  ["/painel/compras/contratos/minutas/nova", "compras/minuta-nova.png", { abrir: ["Prestação de serviços por prazo determinado"], fullPage: true }],
  // Minuta em revisão: seed scripts/seed-prints-minutas.mjs (texto original da IA, com [PREENCHER]).
  ["/painel/compras/contratos/minutas/6d100000-0000-4000-8000-000000000001", "compras/minuta.png", { esperar: "Cláusulas fixas" }],
  ["/painel/compras/contratos/minutas/86f92e2f-5137-43b6-b152-8fee213e3717", "compras/minuta-assinatura.png", { esperar: "Assinatura eletrônica", scrollTo: "Assinatura eletrônica", altura: 760 }],
  ["/painel/compras/contratos/minutas/configuracao", "compras/minutas-configuracao.png", { esperar: "Configuração das minutas" }],
  */

  /* Rodada de 29/09: Acordos coletivos e Negociações sindicais — seed:
  // scripts/seed-prints-acordos.mjs, depois extrair as cláusulas pela tela.
  // Sem créditos da IA nesta rodada: o print da comparação fica para depois.
  ["/painel/representacao/acordos", "representacao/acordos-lista.png", { esperar: "ACT Petrobras 2023-2025", altura: 760 }],
  ["/painel/representacao/acordos/ac100000-0000-4000-8000-000000000005", "representacao/acordo-clausulas.png", { esperar: "cláusula(s)" }],
  ["/painel/representacao/acordos/comparacoes?a=ac100000-0000-4000-8000-000000000001&b=ac100000-0000-4000-8000-000000000002", "representacao/comparar-nova.png", { esperar: "Nova comparação", altura: 640 }],
  ["/painel/representacao/acordos/temas?termo=hora%20extra&a=ac100000-0000-4000-8000-000000000002&a=ac100000-0000-4000-8000-000000000003&a=ac100000-0000-4000-8000-000000000004", "representacao/acordos-tema.png", { esperar: "assunto(s)", scrollTo: "Todos os assuntos" }],
  ["/painel/representacao/negociacoes", "representacao/negociacoes-lista.png", { esperar: "ACT dos funcionários 2025/2027", altura: 560 }],
  ["/painel/representacao/negociacoes/ac200000-0000-4000-8000-000000000001", "representacao/negociacao.png", { esperar: "Linha do tempo", fullPage: true }],
  ["/painel/representacao/negociacoes/ac200000-0000-4000-8000-000000000001/quadro", "representacao/negociacao-quadro.png", { esperar: "Quadro comparativo" }],
  */

  /* Rodada de 25/09: Viagens (passagens e hospedagens) — seed:
  // scripts/seed-prints-viagens.mjs (depois: --limpar tira o demo da diretoria).
  ["/painel/institucional/viagens", "viagens/lista.png", { fullPage: true, esperar: "Ana Paula Mendes" }],
  ["/painel/institucional/viagens", "viagens/lancar.png", { abrir: ["Lançar viagem", "Convidado(a)"], fullPage: true }],
  // Clicar nos botões rola a página; volta ao topo antes do print inteiro.
  ["/painel/perfil/viagens?novo=1", "viagens/solicitar.png", { abrir: ["Acrescentar passagem", "Acrescentar hospedagem"], scrollTo: "Minhas viagens", fullPage: true }],
  ["/painel/perfil/viagens", "viagens/minhas.png", { esperar: "Plenária estadual" }],
  ["/painel/perfil/viagens/7a100000-0000-4000-8000-000000000005", "viagens/minha-viagem.png", { fullPage: true, esperar: "Reservado" }],
  ["/painel/institucional/viagens/7a100000-0000-4000-8000-000000000002", "viagens/atendimento.png", { fullPage: true, abrir: ["Registrar reserva"] }],
  ["/painel/institucional/viagens/faturas/nova", "viagens/fatura-nova.png", { fullPage: true, preencher: [["input[role=combobox]", "Tech"]], apos: ["Tech Suprimentos", "css=input[name^=item_]"] }],
  ["/painel/institucional/viagens/faturas/7a300000-0000-4000-8000-000000000001", "viagens/fatura.png", { fullPage: true, esperar: "Rateio da ordem" }],
  ["/painel/pessoal/diarias/contas?quadro=convidado", "viagens/contas-convidados.png", { altura: 760 }],
  */

  /* Rodada de 24/09: "Assembleias" virou "Votações" (já capturado).
  ["/painel/espacos/9e000000-0000-4000-8000-000000000001", "espacos/detalhe.png", { fullPage: true, esperar: "Quando pode ser cedido" }],
  ["/painel/espacos/pedidos/9e000000-0000-4000-8000-0000000000a1", "espacos/pedido.png", { fullPage: true, esperar: "Assinatura do termo" }],
  ['/painel/representacao', 'representacao/painel.png'],
  ['/painel/representacao/votacoes', 'representacao/votacoes-lista.png', { esperar: 'Votações' }],
  ['/painel/representacao/votacoes/campanhas/aa000000-0000-4000-8000-000000000001', 'representacao/campanha.png', { fullPage: true }],
  */

  /* Rodada de 20/09 (3): área do hotel dividida em abas.
  ['/hotel/inicio', 'hotel/inicio.png', { fullPage: true }],
  ['/hotel/cupons', 'hotel/cupons.png', { fullPage: true }],
  ['/hotel/reservas', 'hotel/reservas.png', { fullPage: true }],
  */

  /* Rodada de 18/09: todos os prints de Filiados (já capturados).
  ['/painel/filiados', 'filiados/lista.png', { fullPage: true, esperar: 'Saúde dos cadastros' }],
  ['/painel/filiados/77777777-7777-4777-8777-000000000001', 'filiados/perfil.png', { fullPage: true }],
  ['/painel/filiados/cadastros-pendentes', 'filiados/cadastros-pendentes.png'],
  ['/painel/filiados/relatorios', 'filiados/relatorios.png'],
  */

  // Rodada de 17/09 (fim da tarde): ficha do integrante (já capturado).
  /*
  [
    "/painel/institucional/diretoria/fe600000-0000-4000-8000-000000000001/fe700000-0000-4000-8000-000000000002",
    "institucional/ficha-integrante.png",
    { fullPage: true, esperar: "Da filiação" },
  ],
  */

  // Rodada de 17/09 (tarde): devolução com km fora do normal. Pede uma saída
  // aberta há ~2 h no V-001 (criada e apagada pelo script de apoio da rodada).
  /*
  [
    "/painel/veiculos/4e000000-0000-4000-8000-000000000001/movimentacao",
    "veiculos/devolucao-km-anormal.png",
    { esperar: "Registrar devolução", preencher: [["#hodometro", "10.500"]], altura: 760 },
  ],
  */

  // Rodada de 17/09: Veículos com as preventivas da demo (V-001 se
  // aproximando, V-002 em dia e em uso, V-003 vencida), sedes cadastradas e a
  // tela de Manutenções.
  /*
  ["/painel/veiculos", "veiculos/painel.png", { fullPage: true, esperar: "Preventiva vencida" }],
  ["/painel/veiculos/agendamentos", "veiculos/agendamentos.png", { fullPage: true }],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000002", "veiculos/veiculo.png", { fullPage: true, esperar: "Próxima preventiva" }],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000001", "veiculos/veiculo-preventiva.png", { esperar: "Manutenção preventiva se aproximando" }],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000002/historico", "veiculos/historico.png"],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000001/movimentacao", "veiculos/movimentacao.png", { esperar: "Registrar saída" }],
  ["/painel/veiculos/manutencoes", "veiculos/manutencoes.png", { fullPage: true }],
  ["/painel/veiculos/infracoes/41000000-0000-4000-8000-000000000001", "veiculos/infracao.png"],
  */

  // Rodada de 16/09 (tarde): Usuários e permissões — Nova pessoa, Quadro da
  // entidade (demo: Rodrigo Alves Prado, da fonte, classificado como
  // prestador) e a página da pessoa com perfis e ajustes finos.
  /*
  ["/painel/institucional/usuarios", "institucional/usuarios-nova-pessoa.png", { abrir: ["Conceder acesso a uma pessoa", "Nova pessoa"] }],
  ["/painel/institucional/usuarios/quadro", "institucional/quadro.png", { esperar: "Sugestão:" }],
  ["/painel/institucional/usuarios/44d991c1-a5b7-431f-9957-b061ee0a9449", "institucional/usuarios.png", { scrollTo: "Ajustes finos" }],
  */

  // Rodada de 17/09: tela de Filiados com o aviso de possíveis duplicidades
  // no cartão de saúde (demo: Marina Couto Ferreira em dois cadastros).
  /*
  ["/painel/filiados", "filiados/lista.png", { fullPage: true, esperar: "possível duplicidade para conferir" }],
  */

  // Rodada de 15/09: tela de Filiados com o medidor de saúde dos cadastros.
  /*
  ["/painel/filiados", "filiados/lista.png", { fullPage: true }],
  ["/painel/filiados/cadastros-pendentes", "filiados/cadastros-pendentes.png", { fullPage: true }],
  */

  // Rodada de 10/09: relatórios, cadastros pendentes, nova filiação, página do
  // veículo (visão geral, histórico, saída), portal eventos e departamentos.
  /*
  ["/painel/filiados/77777777-7777-4777-8777-000000000001", "filiados/perfil.png", { fullPage: true }],
  ["/painel/filiados/cadastros-pendentes", "filiados/cadastros-pendentes.png", { fullPage: true }],
  ["/painel/filiados/relatorios", "filiados/relatorios.png"],
  ["/painel/filiados/relatorios/personalizado?condicao=Ativo", "filiados/relatorio-personalizado.png", { fullPage: true }],
  ["/painel/filiados/relatorios/carencia", "filiados/relatorio-carencia.png"],
  ["/painel/filiados/novo?modo=massa", "filiados/importar.png"],
  ["/painel/filiados/direitos", "filiados/direitos.png", { fullPage: true }],
  ["/painel/veiculos", "veiculos/painel.png", { fullPage: true }],
  ["/painel/veiculos/agendamentos", "veiculos/agendamentos.png", { fullPage: true }],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000002", "veiculos/veiculo.png", { fullPage: true }],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000002/historico", "veiculos/historico.png"],
  ["/painel/veiculos/4e000000-0000-4000-8000-000000000001/movimentacao", "veiculos/movimentacao.png"],
  ["/portal/eventos", "portal/eventos.png", { fullPage: true }],
  ["/portal/inicio", "portal/inicio.png", { fullPage: true }],
  ["/painel/institucional/organizacao", "institucional/organizacao.png", { scrollTo: "Departamentos", fullPage: true }],
  */

  // Rodadas anteriores (mantidas como referência).
  /*
  [
    "/painel/filiados/convenios/e0e0e0e0-0000-4000-8000-000600000001",
    "filiados/convenio-editar.png",
    { fullPage: true },
  ],
  ["/painel/filiados/reembolsos", "filiados/reembolsos.png", { fullPage: true }],
  [
    "/painel/filiados/reembolsos/novo?filiado=77777777-7777-4777-8777-000000000005",
    "filiados/reembolso-novo.png",
  ],
  */

  // Telas da virada da Filiação: convênios, reembolsos e outros contatos
  // (seed: scripts/seed-prints-eventos-direitos.mjs, seção 7). Já capturado.
  // ["/painel/filiados/convenios", "filiados/convenios.png", { fullPage: true }],
  // ["/portal/convenios", "portal/convenios.png", { fullPage: true }],
  /*
  [
    "/painel/filiados/77777777-7777-4777-8777-000000000005",
    "filiados/perfil-outros-contatos.png",
    { scrollTo: "Outros contatos" },
  ],
  [
    "/painel/filiados/77777777-7777-4777-8777-000000000005",
    "filiados/perfil-reembolsos.png",
    { scrollTo: "O que a entidade reembolsou" },
  ],
  */

  // Eventos e telas novas de Filiados — já capturado em 07/09
  // (seed: scripts/seed-prints-eventos-direitos.mjs).
  /*
  ["/painel/eventos", "eventos/painel.png"],
  [`/painel/eventos/${EV_DEMO}`, "eventos/evento.png", { fullPage: true }],
  [`/painel/eventos/${EV_DEMO}/convidados`, "eventos/convidados.png", { fullPage: true }],
  [
    `/painel/eventos/${EV_DEMO}/convidados`,
    "eventos/convidados-planilha.png",
    { abrir: "Importar planilha", fullPage: true },
  ],
  [`/painel/eventos/${EV_DEMO}/campos`, "eventos/campos.png", { fullPage: true }],
  ["/painel/eventos/configuracao", "eventos/configuracao.png", { fullPage: true }],
  ["/painel/eventos/lgpd", "eventos/lgpd.png", { fullPage: true }],
  [
    `/recepcao?evento=${EV_DEMO}&dia=${DIA_DEMO}`,
    "eventos/recepcao.png",
    { mobile: true, buscar: { campo: "Nome ou CPF", texto: "Marina" } },
  ],
  ["/painel/filiados/direitos", "filiados/direitos.png", { fullPage: true }],
  ["/painel/filiados/inadimplentes", "filiados/inadimplentes.png", { fullPage: true }],
  ["/painel/filiados/fichas-pendentes", "filiados/fichas-pendentes.png", { fullPage: true }],
  [
    "/painel/filiados/77777777-7777-4777-8777-000000000005",
    "filiados/vinculo-reconstruido.png",
    { scrollTo: "Histórico de filiação" },
  ],
  ["/portal/eventos", "portal/eventos.png", { fullPage: true }],
  ["/evento/encontro-de-formacao-sindical", "fluxos-publicos/evento.png", { anon: true, fullPage: true }],
  ["/meus-dados", "fluxos-publicos/meus-dados.png", { anon: true, altura: 720 }],
  */

  // Já capturados nas rodadas anteriores.
  ["/painel/compras/comprador", "compras/comprador.png"],
  // ["/painel/filiados/acompanhamento", "filiados/acompanhamento.png", { fullPage: true }],
  // ["/painel/filiados/77777777-7777-4777-8777-000000000003", "filiados/acompanhamento-cadastro.png"],

  // Patrimônio (já capturado — seed: scripts/seed-patrimonio-demo.mjs).
  // ["/painel/patrimonio", "patrimonio/painel.png"],
  // ["/painel/patrimonio/itens", "patrimonio/itens.png"],
  // ["/painel/patrimonio/recintos", "patrimonio/recintos.png"],
  // ["/painel/patrimonio/notas", "patrimonio/notas.png"],

  // Perfis de acesso / RBAC (já capturado — seed: demo-seed-perfis.sql).
  // ["/painel/institucional/usuarios/perfis", "institucional/perfis.png"],
  // ["/painel/institucional/usuarios/perfis/a0510000-0000-4000-8000-000000000001", "institucional/perfil-detalhe.png", { fullPage: true }],

  // Custeio Institucional (já capturado — seed: demo-seed-custeio.sql).
  // ["/painel/institucional/custeios", "institucional/custeios.png"],
  // ["/painel/institucional/custeios/c0570000-0000-4000-8000-000000000001", "institucional/custeio-detalhe.png", { fullPage: true }],
  // ["/painel/institucional/custeios/finalidades", "institucional/custeio-finalidades.png"],

  // Filiados — áreas extras (já capturado — seed: demo-seed-filiados-extra.sql).
  // ["/painel/filiados/receitas", "filiados/receitas.png"],
  // ["/painel/filiados/receitas/60100000-0000-4000-8000-000000000001", "filiados/receita-remessa.png", { fullPage: true }],
  // ["/painel/filiados/prontuarios", "filiados/prontuarios.png"],
  // ["/painel/filiados/importar", "filiados/importar.png"],

  // Pessoal — áreas extras (já capturado — seed: demo-seed-pessoal-extra.sql)
  // ["/painel/pessoal/niveis", "pessoal/niveis.png"],
  // ["/painel/pessoal/anuenios", "pessoal/anuenios.png"],
  // ["/painel/pessoal/diarias", "pessoal/diarias.png"],
  // ["/painel/pessoal/atestados", "pessoal/atestados.png"],
  // ["/painel/pessoal/aso", "pessoal/aso.png"],
  // ["/painel/pessoal/treinamentos", "pessoal/treinamentos.png"],
  // ["/painel/pessoal/reembolsos", "pessoal/reembolsos.png"],
  // ["/painel/pessoal/informes", "pessoal/informes.png"],

  // Fluxos públicos (já capturado — seed: demo-seed-publicos.sql)
  // ["/filiar", "fluxos-publicos/filiar.png", { anon: true, fullPage: true }],
  // ["/ficha/a4a4a4a4-0000-4000-8000-000000000001", "fluxos-publicos/ficha.png", { anon: true, fullPage: true }],
  // ["/portal/oposicao", "fluxos-publicos/oposicao.png", { anon: true }],
  // ["/votar/ac000000-0000-4000-8000-000000000001", "fluxos-publicos/votacao.png", { anon: true }],

  // Área do hotel (já capturado — seed: demo-seed-hotel.sql)
  // ["/hotel/inicio", "hotel/inicio.png", { fullPage: true }],
  // ["/hotel/reservas/40310000-0000-4000-8000-000000000001", "hotel/reserva.png", { fullPage: true }],
  // ["/hotel/faturamento", "hotel/faturamento.png", { fullPage: true }],
  // ["/hotel/contas", "hotel/contas.png"],
  // ["/hotel/acordo", "hotel/acordo.png", { fullPage: true }],

  // Portal do associado (já capturado — seed: demo-seed-portal.sql)
  // ["/portal/inicio", "portal/inicio.png"],
  // ["/portal/cadastro", "portal/cadastro.png", { fullPage: true }],
  // ["/portal/hospedagem", "portal/hospedagem.png", { fullPage: true }],
  // ["/portal/saude", "portal/saude.png"],
  // ["/portal/noticias", "portal/noticias.png"],
  // ["/portal/agenda", "portal/agenda.png"],
  // ["/portal/oposicao", "portal/oposicao.png"],
  // ["/portal/lgpd", "portal/lgpd.png", { fullPage: true }],

  // Introdução — alternador de interfaces (já capturado)
  // ["/painel", "introducao/alternador.png", { openMenu: true }],

  // Saúde (seed: demo-seed-saude.sql) — já capturado
  // ["/painel/saude", "saude/painel.png"],
  // ["/painel/saude/cat", "saude/cat.png"],
  // ["/painel/saude/cipa/ad800000-0000-4000-8000-000000000001", "saude/cipa.png", { fullPage: true }],
  // ["/painel/saude/atendimentos/ad400000-0000-4000-8000-000000000001", "saude/atendimentos.png", { fullPage: true }],

  // Comunicação (já capturado — seed: demo-seed-comunicacao.sql)
  // ["/painel/comunicacao", "noticias/painel.png"],
  // ["/painel/comunicacao/noticias", "noticias/noticias.png"],
  // ["/painel/comunicacao/resumo", "noticias/resumo-ia.png"],

  // Jurídico (já capturado — seed: demo-seed-juridico.sql)
  // ["/painel/juridico", "juridico/painel.png"],
  // ["/painel/juridico/homologacoes", "juridico/homologacoes.png"],
  // ["/painel/juridico/processos/a8200000-0000-4000-8000-000000000001", "juridico/processos.png"],
  // ["/painel/juridico/reembolsos", "juridico/reembolsos.png"],

  // Institucional (já capturado — seed: demo-seed-institucional.sql)
  // ["/painel/institucional", "institucional/painel.png"],
  // ["/painel/institucional/diretoria/fe600000-0000-4000-8000-000000000001", "institucional/diretoria.png", { fullPage: true }],
  // ["/painel/institucional/usuarios/44d991c1-a5b7-431f-9957-b061ee0a9449", "institucional/usuarios.png"],
  // ["/painel/institucional/ajudas", "institucional/ajudas.png"],

  // Ferramentas (já capturado — seed: demo-seed-ferramentas.sql)
  // ["/painel/ferramentas", "ferramentas/painel.png"],
  // ["/painel/ferramentas/demandas", "ferramentas/projetos.png"],
  // ["/painel/ferramentas/documentos", "ferramentas/documentos.png"],
  // ["/painel/ferramentas/oficios/fe800000-0000-4000-8000-000000000001", "ferramentas/oficios.png"],

  // Hospedagem (já capturado — seed: demo-seed-hospedagem.sql)
  // ["/painel/hospedagem", "hospedagem/painel.png"],
  // ["/painel/hospedagem/servicos/40030000-0000-4000-8000-000000000001", "hospedagem/reserva.png"],
  // ["/painel/hospedagem/hoteis/40010000-0000-4000-8000-000000000001", "hospedagem/faturamento.png", { scrollTo: "Faturas em aberto" }],

  // Veículos (já capturado — seed: demo-seed-veiculos.sql)
  // ["/painel/veiculos", "veiculos/painel.png"],
  // ["/painel/veiculos/agendamentos", "veiculos/agendamentos.png"],
  // ["/painel/veiculos/infracoes/41000000-0000-4000-8000-000000000001", "veiculos/infracao.png"],

  // Compras (já capturado — seed: demo-seed-compras.sql)
  // ["/painel/compras", "compras/painel.png"],
  ["/painel/compras/nova", "compras/nova.png"],
  ["/painel/compras/contratos/c1100000-0000-4000-8000-000000000001", "compras/contrato.png"],
  ["/painel/compras/fornecedores/f0f0f0f0-0000-4000-8000-000000000004", "compras/fornecedor.png"],

  // Representação (já capturado — seed: demo-seed-representacao.sql)
  // ["/painel/representacao", "representacao/painel.png"],
  // ["/painel/representacao/assembleias/campanhas/aa000000-0000-4000-8000-000000000001", "representacao/campanha.png"],
  // ["/painel/representacao/oposicao/ba000000-0000-4000-8000-000000000001", "representacao/oposicao-fila.png"],
  // ["/painel/representacao/empregadores/f0f0f0f0-0000-4000-8000-000000000003", "representacao/empregador.png"],

  // Financeiro (já capturado — seed: demo-seed-financeiro.sql)
  // ["/painel/financeiro", "financeiro/painel.png"],
  // ["/painel/financeiro/ordens/ee000000-0000-4000-8000-000000000001", "financeiro/ordem-detalhe.png"],
  // ["/painel/financeiro/caixas/ca100000-0000-4000-8000-000000000001", "financeiro/caixa-detalhe.png"],
  // ["/painel/financeiro/centros-custo", "financeiro/centros-custo.png"],

  // Filiados (já capturado — seed: demo-seed-filiados.sql)
  // ["/painel/filiados/lista", "filiados/lista.png"],
  // ["/painel/filiados/77777777-7777-4777-8777-000000000001", "filiados/perfil.png"],
  // ["/painel/filiados/solicitacoes/88888888-8888-4888-8888-000000000001", "filiados/solicitacao-avaliacao.png"],

  // Pessoal (já capturado — seed: demo-seed-pessoal.sql)
  // ["/painel/pessoal", "pessoal/painel-visao-geral.png"],
  // ["/painel/pessoal/funcionarios", "pessoal/funcionarios-lista.png"],
  // ["/painel/pessoal/33333333-3333-4333-8333-000000000001", "pessoal/funcionarios-ficha.png"],
  // ["/painel/pessoal/contracheques/44444444-4444-4444-8444-000000000001", "pessoal/contracheques-remessa.png"],
  // ["/painel/pessoal/ponto", "pessoal/ponto-remessas.png"],
  // ["/painel/pessoal/ferias/novo?funcionario=33333333-3333-4333-8333-000000000001&inicio=2025-03-01", "pessoal/ferias-periodo-form.png", { esperar: "Ao informar o início do aquisitivo", altura: 560 }],
  // Pede um período temporário (Débora, concessivo até hoje + 60 dias) para a cor amarela; apagado depois.
  // ["/painel/pessoal/ferias?aba=periodos", "pessoal/ferias-periodos.png", { esperar: "Em concessivo", scrollTo: "Distribuição por mês", altura: 1000 }],
]

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
})
if (error) {
  console.error("generateLink falhou:", error.message)
  process.exit(1)
}
const tokenHash = data.properties.hashed_token

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()

await page.goto(
  `${BASE}/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=/painel`,
  // "load", não "networkidle": o painel mantém pedidos abertos e a rede não para.
  { waitUntil: "load", timeout: 120000 }
)
if (page.url().includes("/login")) {
  console.error("Login falhou — confira o usuário no Supabase Auth e o seed.")
  process.exit(1)
}

// Contexto de CELULAR com a mesma sessão, para telas pensadas para a mão
// (a recepção de evento é operada de pé, no corredor).
let pageMobile = null
async function mobilePage() {
  if (!pageMobile) {
    const ctxMobile = await browser.newContext({
      viewport: { width: 414, height: 896 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      storageState: await ctx.storageState(),
    })
    pageMobile = await ctxMobile.newPage()
  }
  return pageMobile
}

// Contexto SEM sessão (cookies próprios), para telas públicas anônimas.
let pageAnon = null
async function anonPage() {
  if (!pageAnon) {
    const ctxAnon = await browser.newContext({
      viewport: { width: 1440, height: 1024 },
      deviceScaleFactor: 2,
    })
    pageAnon = await ctxAnon.newPage()
  }
  return pageAnon
}

const falhas = []
for (const [route, file, opts] of SHOTS) {
  try {
  const dir = `public/ajuda/${file.split("/").slice(0, -1).join("/")}`
  mkdirSync(dir, { recursive: true })
  const p = opts?.anon
    ? await anonPage()
    : opts?.mobile
      ? await mobilePage()
      : page
  // `load` + buffer é mais robusto que networkidle (páginas SSR pesadas ou
  // compilação a frio no dev podem não atingir networkidle em 30s).
  await p.goto(BASE + route, { waitUntil: "load", timeout: 60000 })
  await p.waitForTimeout(1200)
  // opts.esperar: texto que só aparece quando o trecho em streaming (Suspense)
  // terminou — sem isso o print pega o esqueleto de carregamento.
  if (opts?.esperar) {
    await p.getByText(opts.esperar, { exact: false }).first().waitFor({ timeout: ESPERA_MS })
    await p.waitForTimeout(800)
  }
  // O aviso de "fora do horário de trabalho" depende da hora em que o print
  // é tirado; não é parte da tela que o manual ensina.
  await p.evaluate(() => {
    document.querySelectorAll('[role="status"]').forEach((el) => {
      if (el.textContent?.includes("fora do seu hor")) el.remove()
    })
    // Indicador do Next em desenvolvimento (o "N" no canto): não existe em produção.
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove())
  })
  // opts.openMenu: abre o dropdown do rodapé (nome do usuário) para o print
  // do alternador de interfaces.
  if (opts?.openMenu) {
    await p.getByText(EMAIL).first().click()
    await p.getByRole("menuitem", { name: "Sair" }).waitFor({ timeout: 8000 })
    await p.waitForTimeout(300)
  }
  // opts.abrir: clica no título de um cartão colapsável — um print do cartão
  // fechado não mostra o que ele guarda. Uma lista clica em sequência.
  for (const alvo of opts?.abrir ? [].concat(opts.abrir) : []) {
    await p.getByText(alvo, { exact: false }).first().click()
    await p.waitForTimeout(600)
  }
  // opts.altura: encolhe o quadro para páginas curtas, que de outro modo saem
  // com meio print de fundo vazio.
  if (opts?.altura) {
    await p.setViewportSize({ width: 1440, height: opts.altura })
    await p.waitForTimeout(300)
  }
  // opts.preencher: [[seletor, valor], …] — campos digitados antes do print,
  // para mostrar o que a tela faz com eles (ex.: o aviso de km fora do normal).
  for (const [seletor, valor] of opts?.preencher ?? []) {
    await p.fill(seletor, valor)
    await p.waitForTimeout(800)
  }
  // opts.apos: cliques DEPOIS do preencher (escolher a opção que a digitação
  // abriu). Texto clica o primeiro que bater; "css=<seletor>" clica todos.
  for (const alvo of opts?.apos ?? []) {
    if (alvo.startsWith("css=")) {
      for (const el of await p.locator(alvo.slice(4)).all()) await el.click()
    } else {
      await p.getByText(alvo, { exact: false }).first().click()
    }
    await p.waitForTimeout(600)
  }
  // opts.buscar: preenche o campo e dispara a busca — o print de uma tela de
  // busca vazia não mostra o que a tela faz.
  if (opts?.buscar) {
    const campo = p.getByPlaceholder(opts.buscar.campo)
    await campo.fill(opts.buscar.texto)
    await campo.press("Enter")
    await p.waitForTimeout(1500)
  }
  // opts.passos: sequência de ações para montar o estado da tela — clicar
  // (texto ou "css=<seletor>"), anexar [seletor, arquivo], preencher
  // [seletor, valor], selecionar [seletor, rótulo], pausa (ms) e aguardar (texto; espera
  // longa, p/ leitura pela IA).
  for (const passo of opts?.passos ?? []) {
    if (passo.clicar) {
      const alvo = passo.clicar.startsWith("css=")
        ? p.locator(passo.clicar.slice(4)).first()
        : p.getByText(passo.clicar, { exact: false }).first()
      await alvo.click()
    } else if (passo.anexar) {
      await p.setInputFiles(passo.anexar[0], passo.anexar[1])
    } else if (passo.preencher) {
      await p.fill(passo.preencher[0], passo.preencher[1])
    } else if (passo.selecionar) {
      await p.selectOption(passo.selecionar[0], { label: passo.selecionar[1] })
    } else if (passo.ir) {
      // navega para outra rota no meio dos passos (ex.: depois de abrir uma
      // visualização que grava cookie, ir à tela que se quer mostrar)
      await p.goto(BASE + passo.ir, { waitUntil: "load", timeout: 60000 })
      await p.waitForTimeout(1200)
    } else if (passo.pausa) {
      await p.waitForTimeout(passo.pausa)
    } else if (passo.aguardar) {
      await p.getByText(passo.aguardar, { exact: false }).first().waitFor({ timeout: 120000 })
    } else if (passo.pdfComoImagem) {
      // O Chromium headless não exibe PDF embutido (<object>): baixa o PDF de
      // cada visor e desenha a 1ª página com o PDF.js, como o leitor mostraria.
      await p.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" })
      await p.evaluate(async () => {
        const lib = window.pdfjsLib
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        for (const o of document.querySelectorAll('object[type="application/pdf"]')) {
          const doc = await lib.getDocument({ data: await (await fetch(o.data)).arrayBuffer() }).promise
          const pagina = await doc.getPage(1)
          const vp = pagina.getViewport({ scale: 2 })
          const canvas = document.createElement("canvas")
          canvas.width = vp.width
          canvas.height = vp.height
          canvas.style.cssText = "display:block;width:min(100%,640px);margin:0 auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25)"
          await pagina.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise
          const visor = document.createElement("div")
          visor.style.cssText = "background:#525659;border-radius:6px;padding:16px"
          visor.appendChild(canvas)
          o.replaceWith(visor)
        }
      })
    }
    await p.waitForTimeout(700)
  }
  // opts.ocultarCartao: esconde o cartão que contém o texto (ex.: o visor de
  // PDF, que o Chromium headless não exibe e sai como um bloco cinza vazio).
  for (const texto of opts?.ocultarCartao ? [].concat(opts.ocultarCartao) : []) {
    await p.evaluate((t) => {
      const el = [...document.querySelectorAll("[data-slot=card]")].find((c) => c.textContent?.includes(t))
      if (el) el.style.display = "none"
    }, texto)
    await p.waitForTimeout(300)
  }
  // opts.scrollTo: rola até o texto (foca uma seção abaixo da dobra).
  if (opts?.scrollTo) {
    try {
      await p.getByText(opts.scrollTo, { exact: false }).first()
        .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }))
      // O cabeçalho do painel é fixo e cobre o topo; recua o bastante para o
      // título do cartão aparecer inteiro.
      await p.getByText(opts.scrollTo, { exact: false }).first().evaluate((el) => {
        let n = el.parentElement
        while (n && n.scrollTop === 0) n = n.parentElement
        ;(n ?? window).scrollBy(0, -120)
      })
      await p.waitForTimeout(400)
    } catch {
      console.log("  (scrollTo não encontrado:", opts.scrollTo + ")")
    }
  }
  await p.screenshot({ path: `public/ajuda/${file}`, fullPage: opts?.fullPage ?? false })
  if (opts?.altura) await p.setViewportSize({ width: 1440, height: 1024 })
  console.log("salvo:", file)
  } catch (e) {
    if (!process.env.SEGUIR) throw e
    falhas.push(file)
    console.log("FALHOU:", file, "—", String(e.message ?? e).split(/\r?\n/)[0])
    for (const pg of [page, pageMobile, pageAnon]) if (pg) await pg.setViewportSize({ width: 1440, height: 1024 }).catch(() => {})
  }
}
if (falhas.length) console.log("Falharam " + falhas.length + ":", falhas.join(", "))

await browser.close()
console.log("Concluído.")

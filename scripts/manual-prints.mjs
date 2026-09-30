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
const EMAIL = "demo@confluir.local"

// [rota, arquivo relativo a public/ajuda/] — edite por módulo a cada rodada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- usados nos blocos comentados
const EV_DEMO = "e0e0e0e0-0000-4000-8000-000000000001"
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- usados nos blocos comentados
const DIA_DEMO = "e0e0e0e0-0000-4000-8000-000000000011"

const SWITCH_DIRETA = 'css=button[aria-label="Alternar entre via Compras e aquisição direta"]'
// Cupom fictício para a leitura pela IA (PAPELARIA ESTRELA DO NORTE, CNPJ de
// exemplo). Passe o caminho em CUPOM_TESTE; sem ele, o print da leitura é pulado.
const CUPOM = process.env.CUPOM_TESTE ?? ""
// Fatura de cartão-combustível de exemplo (PDF) para a leitura com IA.
const FATURA = process.env.FATURA_TESTE ?? ""

const SHOTS = [
  // Rodada de 30/09 (14): abastecimentos — a prévia da leitura pela IA (placa
  // fora da frota entra sem veículo), o resultado, a lista e a edição de um
  // lançamento sem veículo. Precisa de FATURA_TESTE (PDF); os lançamentos são
  // apagados pelo teste.
  ...(FATURA
    ? [["/painel/veiculos/abastecimentos/novo", "veiculos/abastecimentos-ia-previa.png", { esperar: "Ler relatório com IA", passos: [{ anexar: ["#arquivo-abastecimento-ia", FATURA] }, { clicar: 'css=button[type="submit"]:has-text("Ler relatório com IA")' }, { aguardar: "A IA leu" }], scrollTo: "Ler relatório com IA", altura: 1100 }],
       ["/painel/veiculos/abastecimentos/novo", "veiculos/abastecimentos-ia-lancados.png", { esperar: "Ler relatório com IA", passos: [{ anexar: ["#arquivo-abastecimento-ia", FATURA] }, { clicar: 'css=button[type="submit"]:has-text("Ler relatório com IA")' }, { aguardar: "A IA leu" }, { clicar: "Confirmar e lançar" }, { aguardar: "lançados" }], altura: 700 }],
       ["/painel/veiculos/abastecimentos", "veiculos/abastecimentos-lista.png", { esperar: "Incluir abastecimentos", altura: 900 }],
       ["/painel/veiculos/abastecimentos?veiculo=sem", "veiculos/abastecimento-editar.png", { esperar: "Incluir abastecimentos", passos: [{ clicar: "08/09/2026" }, { aguardar: "Dados do lançamento" }, { selecionar: ["#veiculo_id", "ABC1D23 — Fiat Cronos"] }, { pausa: 800 }], fullPage: true }]]
    : []),

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
  ["/painel/financeiro/auditoria?origem=compras", "financeiro/auditoria-regras.png", { esperar: "Uma só proposta", fullPage: true }],
  ["/painel/financeiro/ordens/1d1bc88f-8a50-457e-8d56-55d924437f81", "financeiro/ordem-verificacoes.png", { esperar: "Verificações na criação", scrollTo: "Verificações na criação", altura: 1000 }],
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
      { preencher: ['input[placeholder="Busque por nome ou CNPJ/CPF"]', "Tech Supri"] },
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
  // ["/painel/compras/comprador", "compras/comprador.png"],
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
  // ["/painel/compras/nova", "compras/nova.png"],
  // ["/painel/compras/contratos/c1100000-0000-4000-8000-000000000001", "compras/contrato.png"],
  // ["/painel/compras/fornecedores/f0f0f0f0-0000-4000-8000-000000000004", "compras/fornecedor.png"],

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
  // ["/painel/pessoal/ferias", "pessoal/ferias-periodos.png"],
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
  { waitUntil: "networkidle" }
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

for (const [route, file, opts] of SHOTS) {
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
    await p.getByText(opts.esperar, { exact: false }).first().waitFor({ timeout: 180000 })
    await p.waitForTimeout(800)
  }
  // O aviso de "fora do horário de trabalho" depende da hora em que o print
  // é tirado; não é parte da tela que o manual ensina.
  await p.evaluate(() => {
    document.querySelectorAll('[role="status"]').forEach((el) => {
      if (el.textContent?.includes("fora do seu hor")) el.remove()
    })
  })
  // opts.openMenu: abre o dropdown do rodapé (nome do usuário) para o print
  // do alternador de interfaces.
  if (opts?.openMenu) {
    await p.getByText(EMAIL).first().click()
    await p.getByRole("menuitem", { name: "Meu perfil" }).waitFor({ timeout: 4000 })
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
    } else if (passo.pausa) {
      await p.waitForTimeout(passo.pausa)
    } else if (passo.aguardar) {
      await p.getByText(passo.aguardar, { exact: false }).first().waitFor({ timeout: 120000 })
    }
    await p.waitForTimeout(700)
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
}

await browser.close()
console.log("Concluído.")

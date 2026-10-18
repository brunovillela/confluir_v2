# Direitos do titular: como cada um é atendido

> **Onda B5** (`docs/plano-documentacao.md`), 18/10/2026. Mapeia cada direito dos arts. 18 a 20 da LGPD para o caminho real no Confluir (tela, função e registro) e aponta as lacunas. Os fatos foram conferidos no código. A forma de atendimento (canal, responsável, prazo interno) é **decisão da entidade**, que é a controladora.

## 1. Quem atende e em quanto tempo

- **A entidade responde ao titular** (art. 18). O Confluir, como operador, dá os meios e apoia a entidade quando ela pedir (art. 39). Ver a seção 5.
- **Prazos (art. 19):** confirmação e acesso em formato simplificado, **imediatamente**; declaração completa (origem, critérios, finalidade), em até **15 dias** do pedido. Para os demais direitos, adotar os mesmos 15 dias como prazo interno até haver regulamentação específica.
- **Identidade:** só atender quem provou ser o titular: sessão do portal, código no e-mail do cadastro ou conferência presencial pela secretaria. Nunca responder por e-mail ou telefone sem essa prova.
- **Registro:** todo pedido e toda execução vão para o **livro de solicitações** (`lgpd_solicitacoes`): tipo, data do pedido e da conclusão, o que foi feito e a base legal do que ficou retido.

## 2. Direito por direito (art. 18)

| # | Direito | Como o titular pede | Como o sistema atende | Registro | Situação |
|---|---|---|---|---|---|
| I | **Confirmação** de que há tratamento | Portal › Privacidade e dados; secretaria | Portal mostra os aceites e o que é guardado (`src/app/portal/lgpd/page.tsx`) | — | **Atende** (filiado com portal) |
| II | **Acesso** aos dados | Portal › "Seus dados" (baixar); eventos: `/meus-dados` com código por e-mail | Exportação JSON do próprio filiado (`src/app/portal/lgpd/meus-dados/route.ts`, `dadosDoTitular` em `src/lib/db/lgpd.ts:262`); titular de evento vê os seus dados (`src/lib/db/eventos-titular.ts:216`) | Sim (`registrarPortabilidade`) | **Atende**, com lacuna: **saúde fica fora** do arquivo e só "pode ser pedida à equipe de saúde" |
| III | **Correção** | Portal › Meu cadastro (contato, endereço); secretaria para o resto; eventos: `/meus-dados` | Edição pelo próprio filiado; correção do inscrito (`corrigirDados`, `eventos-titular.ts:329`); gestão edita o cadastro com trilha de `auditoria` | Auditoria das alterações | **Atende** |
| IV | **Anonimização, bloqueio ou eliminação** de dado desnecessário ou excessivo | Texto no portal manda pedir; **não há botão**; secretaria | Gestão com `filiacao_lgpd` executa `anonimizarFiliacao` (`src/lib/db/lgpd.ts:61`; tela `/painel/filiados/[id]/lgpd`), que preserva o acervo de saúde (art. 16, I); eventos: `excluirDadosDoTitular` (`eventos-titular.ts:397`) com recibo | Sim (livro + `anonimizada_em`) | **Atende** pela gestão; **sem pedido pelo portal**; **sem "bloqueio"** (suspender o tratamento sem apagar) |
| V | **Portabilidade** | Portal › "Seus dados" | Mesmo JSON do inciso II (formato aberto) | Sim | **Atende** (mesma lacuna de saúde) |
| VI | **Eliminação** dos dados tratados com **consentimento** | Secretaria | Mesma anonimização do IV; o que tem outra base legal (contábil, saúde, sindical) fica retido, com a base informada | Sim | **Atende** pela gestão |
| VII | **Informação sobre compartilhamento** | Secretaria; política de privacidade (B6) | Lista em `docs/lgpd/suboperadores.md` e no ROPA; **não aparece ao titular** | — | **Lacuna**: publicar na política (B6) e no portal |
| VIII | **Informação sobre não consentir** e suas consequências | Termo de tratamento no portal | Termo versionado da entidade, mostrado antes do aceite (`termoEmVigor`, `registrarAceiteTermo`) | Aceite com versão, IP e navegador (`filiacao_tl_aceites`) | **Atende** (depende do texto do termo) |
| IX | **Revogação do consentimento** | Comunicados: portal (opt-out imediato); avisos: Preferências; termo LGPD e foto de evento: secretaria | Opt-out de comunicados e preferências de aviso no portal; o resto, pela gestão | Parcial | **Atende parcialmente**: sem revogação do termo LGPD pelo portal |
| §2º | **Oposição** a tratamento sem consentimento, se irregular | Secretaria | Análise caso a caso pela entidade | Livro (tipo a criar) | **Sem fluxo** |
| Art. 20 | **Revisão de decisão automatizada** | Secretaria; atendimento do portal | Regras automáticas que afetam o titular: **carência e inadimplência** bloqueiam votar e usar benefícios (`src/lib/db/votacao-portal.ts:665-669`; hospedagem). IA só **sugere** (leitura de CAT, conciliação de relações) e uma pessoa confirma: não é decisão exclusivamente automatizada | — | **Lacuna**: explicar o critério ao titular quando bloqueado e indicar onde pedir revisão |

### Titulares que não são filiados

| Titular | Canal hoje | Lacuna |
|---|---|---|
| Convidado ou inscrito em evento | `/meus-dados` (código por e-mail): ver, corrigir, excluir, recibo | — (fluxo mais completo do sistema) |
| Eleitor não filiado (lista de aptos) | Nenhum | Atender pela secretaria; registrar no livro |
| Funcionário da entidade | Meu perfil (`/painel/perfil`) para ver os próprios dados e férias | Exportação e correção pela gestão de Pessoal |
| Fornecedor ou prestador PF, hóspede, condutor, signatário externo | Nenhum | Secretaria + livro |
| Dependente, contato de emergência | Pelo titular principal | Explicitar na política |

## 3. Roteiro de atendimento para a entidade

1. **Receber:** pelo portal (atendimento, assunto "Privacidade") ou na secretaria. Anotar no livro: tipo, data e canal.
2. **Identificar:** confirmar que é o titular (sessão, código por e-mail ou documento presencial).
3. **Responder no prazo:** confirmação e acesso imediatos pelo portal; declaração completa em até 15 dias.
4. **Executar:**
   - correção: pelo cadastro;
   - eliminação ou anonimização: `/painel/filiados/[id]/lgpd`, que mostra o que fica e por quê;
   - portabilidade: pedir que o titular baixe no portal, ou baixar por ele na presença e registrar.
5. **Explicar o que fica:** dados com obrigação legal (contábeis, saúde ocupacional, prova de votação) são retidos pelo prazo de `retencao.md`, com a base legal informada por escrito.
6. **Fechar:** concluir no livro (data, o que foi feito, base da retenção). Guardar o registro por 5 anos (RT34).

## 4. Lacunas e melhorias propostas

| # | Lacuna | Proposta | Esforço |
|---|---|---|---|
| D1 | Sem pedido de eliminação, oposição ou revogação pelo portal | Botão "Fazer um pedido sobre meus dados" em Privacidade, que abre atendimento com tipo LGPD, cai no livro e conta o prazo de 15 dias | Pequeno |
| D2 | Saúde fora da exportação | Incluir na exportação o que for do próprio titular (atendimentos sem o relatório clínico, CATs ligadas), ou gerar um pedido automático à equipe de saúde com prazo | Médio |
| D3 | Prazo de 15 dias sem controle | Prazo e alerta no livro de solicitações; painel de pedidos em aberto para o encarregado | Pequeno |
| D4 | Compartilhamento não informado ao titular | Seção "Com quem compartilhamos" no portal, tirada de `suboperadores.md` (B6) | Pequeno |
| D5 | Sem "bloqueio" (suspender sem apagar) | Marca de bloqueio que tira a pessoa de comunicações, exportações e regras, sem apagar; serve também de bloqueio por litígio (retenção) | Médio |
| D6 | Revisão de decisão automatizada | Quando o sistema bloquear por carência ou inadimplência, mostrar o critério e o link para pedir revisão | Pequeno |
| D7 | Não filiados sem canal | Página pública "Seus dados" genérica (como `/meus-dados` dos eventos), por código no e-mail, para quem está em listas de aptos, hospedagem ou cessão | Médio |

## 5. O que o Confluir faz como operador

- Mantém as ferramentas acima funcionando e registradas.
- Atende pedidos que a entidade encaminhar, em até **5 dias úteis**, para caber nos 15 dias dela: extração completa (inclusive Storage e backups dentro da janela), eliminação técnica e confirmação por escrito.
- Avisa a entidade se receber um pedido diretamente do titular e não responde ao titular por conta própria (art. 39).
- Registra cada apoio prestado (data, entidade, pedido, o que foi feito).
- Lembra à entidade que dado eliminado no banco permanece nos backups até eles expirarem (ver `retencao.md`, seção 3).

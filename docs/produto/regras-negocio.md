# Catálogo de regras de negócio

> **Onda F** (`docs/plano-documentacao.md`), 19/10/2026. Cada regra tem um ID estável (prefixo da área + número) para ser citada em tickets, ADRs e no manual. Ao mudar uma regra no código, atualize a linha correspondente aqui. Pontos fracos encontrados no levantamento estão na seção final.

Só entra aqui o que foi conferido no código, em 19/10/2026. Os caminhos partem de `src/`. Os números de linha são aproximados quando aparecem com "~".

Cada regra traz quatro campos:

- **Valor**: o número, prazo ou condição.
- **Config.**: onde a entidade pode mudar a regra. "Fixo" quer dizer que o valor está escrito no código.
- **Código**: o arquivo, a linha ou a função.
- **Nota**: aparece só quando há uma ressalva.

---

## ACE: Acesso e autenticação

**ACE-01**: Os links enviados por e-mail (convite, redefinição de senha, link mágico) e o código de acesso de 6 dígitos valem 2 horas.
- Valor: 7.200 segundos.
- Config.: o valor real fica no painel do Supabase ("Email OTP Expiration"). A constante do código só repete esse valor para os textos dos e-mails.
- Código: `lib/auth-email-constantes.ts:13` (`VALIDADE_LINK_EMAIL_SEGUNDOS`).

**ACE-02**: A mesma pessoa só recebe um novo código de acesso por e-mail depois de 60 segundos, e no máximo 5 códigos por hora.
- Valor: 60 s; 5 por hora, por entidade e e-mail.
- Config.: fixo.
- Código: `lib/codigo-acesso.ts:137-138`, `conferirCadencia()`.
- Nota: se a tabela `auth_codigos_envios` falhar, o envio não é bloqueado.

**ACE-03**: Falhas de login bloqueiam a entrada por um tempo, em degraus.
- Valor: 5 falhas bloqueiam por 15 min; 10 falhas, por 60 min. A contagem zera se passar mais de 1 hora entre falhas, ou com um acerto.
- Config.: fixo.
- Código: `lib/login-bloqueio.ts:20-24` (`DEGRAUS`, `JANELA_MS`).
- Nota: o mesmo contador vale para o painel, o hotel, o portal, o código do portal e o TOTP.

**ACE-04**: Quem tem segundo fator verificado precisa de sessão com segundo fator no painel e no /admin. Com `MFA_OBRIGATORIO=1`, quem tem permissão sensível é obrigado a cadastrar um fator.
- Valor: são sensíveis `concede_tudo`, `financeiro_pagamento`, `permissoes`, `configuracoes` e alçada maior que 0.
- Config.: variável de ambiente global, não por entidade.
- Código: `lib/mfa.ts:20,32` (`permissoesExigem2FA`).

**ACE-05**: O "Ver como" (filiado, eleitor ou hotel) abre uma sessão somente leitura, que expira.
- Valor: 30 minutos, com a permissão conferida de novo a cada requisição.
- Config.: fixo.
- Código: `lib/visualizacao-filiado.ts:29`, `lib/visualizacao-eleitor.ts:28`, `lib/visualizacao-hotel.ts:30`.

**ACE-06**: A alçada efetiva de uma pessoa é a maior entre a do usuário e a dos perfis ativos dela. Perfil com alçada vazia não tem teto.
- Valor: maior valor entre usuário e perfis; vazio = `Number.MAX_SAFE_INTEGER`.
- Config.: por perfil e por usuário, em Usuários e permissões.
- Código: `lib/permissoes-resolver.ts:27-28,78-109`.

---

## FIL: Filiação e portal do associado

**FIL-01**: Cada benefício só é liberado depois da carência, contada da filiação mais recente. Com efeito suspensivo de carência, conta da primeira filiação. Sem nenhuma data, o benefício fica bloqueado.
- Valor: dias por benefício (hospedagem, saúde, jurídico, eventos, votação). Benefício sem linha na tabela não tem carência.
- Config.: tabela `filiacao_carencias`, na tela Filiados › Direitos.
- Código: `lib/filiacao-direitos-constantes.ts:89` (`conferirCarencia`), `lib/db/filiacao-direitos.ts:38`.

**FIL-02**: A pessoa é apontada como inadimplente quando tem N faltas nas últimas J remessas de um tipo. No modo "seguidas", as faltas contam a partir da remessa mais recente, então quem voltou a pagar sai da lista.
- Valor: padrão de 3 faltas seguidas numa janela de 12 remessas. A regra fica desligada até ser salva.
- Config.: tabela `filiacao_inadimplencia_regras`.
- Código: `lib/db/filiacao-direitos.ts:98-119`, `lib/db/filiacao-inadimplencia.ts:142` (`aplicarRegra`).

**FIL-03**: A inadimplência só aponta, não suspende nada. Nenhum código muda a condição da pessoa nem bloqueia benefício por causa dela.
- Valor: o texto padrão do portal diz "Nada é suspenso automaticamente".
- Config.: o texto é editável em `portal_partes` › contribuição.
- Código: `lib/portal-partes-constantes.ts:294`.

**FIL-04**: O efeito suspensivo dispensa um CPF da carência ou da inadimplência, para um benefício ou tipo de remessa, ou para todos.
- Valor: vale até `vigencia_ate`; sem essa data, não expira. Pode ser revogado.
- Config.: tabela `filiacao_suspensoes`.
- Código: `lib/db/filiacao-direitos.ts:168-296`.

**FIL-05**: Para cada categoria de fonte, a falta de um dado no cadastro é classificada como pendência, apontamento ou normal.
- Valor: o padrão trata tudo como pendência, menos cargo e lotação em fundo de pensão. O regime de trabalho só é exigido de quem é da ativa.
- Config.: `empresa.filiacao_saude_config`.
- Código: `lib/saude-cadastros.ts:1-15,144-149`, `lib/filiacao.ts:87-153`.

**FIL-06**: A matrícula sindical é sequencial na entidade: a maior em uso mais 1.
- Valor: guarda só dígitos, sem zeros à esquerda. Ignora matrículas com mais de 7 dígitos e faz até 5 tentativas contra colisão.
- Config.: fixo.
- Código: `lib/db/filiacao-matricula.ts:13-52`, `lib/db/filiacao-identidade.ts:241`.

**FIL-07**: A condição de filiação segue etapas fixas, e cada etapa grava a sua data.
- Valor:
  - Individual: Aguarda ficha assinada → Filiação não informada à fonte → Filiação aguarda fonte → Ativo.
  - Coletiva: Em processo de filiação coletiva → Filiação aguarda fonte → Ativo.
  - Desfiliação: Desfiliação não informada à fonte → Desfiliação aguarda fonte → Inativo.
- Config.: fixo.
- Código: `lib/filiacao.ts:8-19,189-238`.

**FIL-08**: Na filiação coletiva, quem não desiste no prazo passa para "Filiação aguarda fonte" e, no dia seguinte, para Ativo.
- Valor: prazo = data da aplicação + dias da rodada. Para desistir, a pessoa digita "CONFIRMO". O casamento só pelo nome exige pelo menos 6 caracteres e entra como "dúvida".
- Config.: os dias ficam na rodada (`filiacao_coletiva_dias`).
- Código: `lib/db/filiacao-coletiva.ts:74,586-588,929-1008`, `lib/db/desistencia-coletiva.ts:39,51`.

**FIL-09**: A cobrança Pix só é gerada para filiado Ativo com forma de recebimento Pix. O valor é o da pessoa ou, se ela não tiver, o valor mensal da entidade.
- Valor: vencimento no dia 10 por padrão (aceita de 1 a 28). A baixa cai sempre numa remessa "Associativa".
- Config.: valor e dia em `filiacao_cobranca_config`. O tipo de remessa é fixo.
- Código: `lib/db/cobrancas.ts:112-124,170-230`.

**FIL-10**: Um Pix do extrato casa com a cobrança pelo txid ou pelo mesmo valor dentro de uma janela em torno do vencimento.
- Valor: de 40 dias antes a 10 dias depois do vencimento.
- Config.: fixo.
- Código: `lib/db/cobrancas.ts:~359,467-472`.

**FIL-11**: O primeiro acesso ao portal exige aceitar o termo LGPD em vigor e completar os campos obrigatórios. Termo novo publicado pede novo aceite.
- Valor: ligado por padrão (termo LGPD + e-mail, telefone e endereço). Com o portal suspenso, nada é exigido.
- Config.: `portal_partes` › primeiro_acesso.
- Código: `lib/db/portal-primeiro-acesso.ts`, `lib/portal-partes-constantes.ts:186-213`.

**FIL-12**: O filiado pode reabrir pelo portal uma solicitação já concluída, dentro de um prazo.
- Valor: 15 dias por padrão; 0 desliga a reabertura.
- Config.: Filiados › Área do associado (`atendimento.prazo_reabrir_dias`).
- Código: `lib/atendimento-constantes.ts:53`.

---

## OPO: Oposição à contribuição assistencial

**OPO-01**: Registrar, desistir ou trocar o documento da oposição só é possível com a campanha aberta e com a data de hoje (horário de São Paulo) dentro do prazo, inclusive nas pontas.
- Valor: sem as duas datas, a campanha fica "sem prazo" e o registro é bloqueado.
- Config.: por campanha (`prazo_inicio`, `prazo_fim`, `situacao`).
- Código: `lib/oposicao-constantes.ts:73` (`estadoPrazo`), `lib/db/oposicao.ts:984,1074`.

**OPO-02**: A forma de oficializar a oposição depende da campanha.
- Valor:
  - "tela": só confirmação.
  - "assinatura": sempre exige documento.
  - "hibrido": o filiado só confirma e o não filiado assina.
- Config.: por campanha (`modo_formalizacao`).
- Código: `lib/oposicao-constantes.ts:16`, `lib/db/oposicao.ts:~862`.

**OPO-03**: Cada CPF tem uma só oposição por campanha. Quem desistiu pode voltar dentro do prazo, e reprovar uma oposição exige motivo.
- Valor: a mesma linha é reaproveitada; o protocolo é sequencial por campanha.
- Config.: fixo.
- Código: `lib/db/oposicao.ts:~862-930,~1388`.

---

## VOT: Votação e assembleias

**VOT-01**: Cada CPF vota uma única vez por rodada, qualquer que seja a assembleia ou o canal. A presença na urna também conta como voto.
- Valor: um voto por CPF e rodada. O banco garante isso com o índice único `voto_aptos_rodada_cpf_votou_idx`.
- Config.: fixo.
- Código: `lib/db/votacao-portal.ts:384-398,~633` (`reservarParticipacao`).

**VOT-02**: O voto é gravado sem o eleitor e com a data reduzida ao primeiro instante do mês. A hora exata fica só na participação e no comprovante.
- Valor: `eleitor_id` sempre nulo; o comprovante leva SHA-256 de código, apto, assembleia e momento.
- Config.: fixo (com gatilho no banco).
- Código: `lib/assembleias-constantes.ts:365` (`horaDoVotoSecreto`), `lib/db/voto-comprovante.ts`.

**VOT-03**: A janela da assembleia precisa caber na janela da rodada.
- Valor: o início não pode ser antes do início da rodada, nem o término depois do fim dela. Sem hora, vale das 00:00 às 23:59, no fuso -03:00.
- Config.: fixo.
- Código: `lib/db/assembleias.ts:~2686` (`validarJanelaDaAssembleia`).

**VOT-04**: Perguntas e opções travam quando a primeira assembleia da rodada começa ou quando já existe voto. Depois de começar, a assembleia não se edita nem se exclui, só se prorroga.
- Valor: travamento no início da primeira assembleia ou no primeiro voto.
- Config.: fixo.
- Código: `lib/db/assembleias.ts:~999,~1050,1575`.

**VOT-05**: Só se prorroga uma assembleia já iniciada e com a apuração em aberto. Se o novo término passar do fim da rodada, a rodada é estendida automaticamente.
- Valor: o novo término tem de ser depois do atual e no futuro. Não há limite de prorrogações.
- Config.: fixo.
- Código: `lib/db/assembleias.ts:1584` (`prorrogarAssembleia`).

**VOT-06**: O voto em separado só é aceito quando a assembleia permite e com a urna aberta.
- Valor: na urna digital, o voto fica retido até ser deferido. Na urna física, vai num envelope com código de 6 caracteres.
- Config.: por assembleia (`voto_em_separado`).
- Código: `lib/db/votacao-mesarios.ts:1556,1580-1606`.

**VOT-07**: Num pleito interno (somente filiados), só vota quem é filiado ativo e já cumpriu a carência de votação.
- Valor: os dias de carência da votação. O pleito interno não aparece no link único.
- Config.: por assembleia (`somente_filiados`); os dias ficam em `filiacao_carencias`.
- Código: `lib/db/votacao-portal.ts:467,~709,~1211`.

**VOT-08**: O código que confirma o e-mail de votação no portal vale por um tempo curto.
- Valor: 6 dígitos, 15 minutos.
- Config.: fixo, repetido em dois arquivos.
- Código: `lib/db/votacao-portal.ts:44`, `app/portal/votacao/limite-envio-codigo.ts:37`.

**VOT-09**: O envio desse código tem intervalo mínimo e bloqueia em degraus, contados por filiado e por endereço de e-mail.
- Valor: 60 s entre envios; 5 envios bloqueiam por 15 min; 10 envios, por 1 h.
- Config.: fixo.
- Código: `app/portal/votacao/limite-envio-codigo.ts:38`.

**VOT-10**: O link pessoal não vence por tempo. Ele para de funcionar depois do voto ou de um "não sou eu", e a sessão que abre dura até o fim da votação.
- Valor: a sessão dura no mínimo 1 h e no máximo 60 dias; sem data de término, dura 24 h.
- Config.: fixo.
- Código: `lib/acesso-eleitor.ts:35-37`.

**VOT-11**: No link único, a pessoa é reconhecida pelo nome, CPF, data de nascimento e e-mail da empresa. Depois de algumas tentativas que não batem, o acesso trava.
- Valor: 5 tentativas. A confirmação pelo Telegram usa um token de uso único que vale 15 min. E-mail de domínio corporativo das listas não recebe código.
- Config.: fixo.
- Código: `app/votar/actions.ts:21` (`MAX_FALHAS`), `lib/sessao-votacao-telegram.ts:18-19`.

**VOT-12**: A apuração só se encerra com a janela terminada e sem voto em separado pendente. Só os votos em separado deferidos contam.
- Valor: reabrir exige motivo de pelo menos 5 caracteres. No encerramento, o banco grava o SHA-256 do resultado e roda as conferências C1 a C6.
- Config.: fixo.
- Código: `lib/db/assembleias.ts:2359,~2530,2647`.

**VOT-13**: O sistema avisa os aptos sozinho antes da abertura e lembra quem não votou perto do fim.
- Valor:
  - aviso 24, 48 ou 72 h antes da abertura;
  - se o envio falhar, uma nova tentativa depois de 1 h;
  - lembrete nas últimas 24 h, uma vez por pessoa e assembleia;
  - alerta de "aptos sem link" quando faltam 48 h para abrir;
  - "em breve" = abre dentro de 7 dias.
- Config.: a antecedência do aviso é por rodada (`aviso_auto_horas`); o resto é fixo.
- Código: `lib/db/votacao-aviso-auto.ts:27,30`, `lib/db/votacao-sem-link.ts:36`, `lib/assembleias-constantes.ts:346`.

---

## REP: Representação e acordos

**REP-01**: Um acordo coletivo acende o alerta de renegociação um tempo antes do fim da vigência.
- Valor: 90 dias.
- Config.: fixo.
- Código: `lib/acordos-constantes.ts:97` (`DIAS_ALERTA_ACORDO`).

---

## FIN: Financeiro e ordens de pagamento

**FIN-01**: Só se estorna uma ordem paga, que não saiu do caixa, dentro de um prazo contado do pagamento. O estorno devolve a ordem para "Aguardando informações" e tira a autorização.
- Valor: 15 dias por padrão (aceita de 1 a 365); motivo de pelo menos 10 caracteres.
- Config.: `financeiro_config.estorno_prazo_dias`, na tela Financeiro › Estornos.
- Código: `lib/db/ordens-estorno.ts:32,75-84,129-166`.

**FIN-02**: A alçada vale pelo valor da ordem, qualquer que seja a origem. Só aprova quem tem alçada maior que 0 e não menor que o valor; devolver exige motivo.
- Valor: valor da ordem ≤ alçada.
- Config.: por perfil ou por usuário (ver ACE-06).
- Código: `lib/db/ordens-ciclo.ts:277-341` (`avaliarOrdem`).

**FIN-03**: Para aprovar uma ordem de contrato (que não seja apoio nem compra) ou de custeio, além da alçada é preciso uma permissão específica.
- Valor: `aquisicoes_contratos_autorizacao` ou `custeio_institucional_autorizacao`.
- Config.: permissões.
- Código: `lib/db/compras.ts:1833-1875`.

**FIN-04**: A ordem da folha de pagamento e a parcela fixa de contrato já nascem "A pagar", com a dispensa de autorização registrada.
- Valor: a parcela conta como fixa quando é igual ao valor do contrato, com tolerância de 0,005.
- Config.: fixo.
- Código: `lib/db/ordens-ciclo.ts:52-75`, `lib/db/contratos.ts:953-981`.

**FIN-05**: Mudar o valor de uma ordem já autorizada a devolve para autorização. Compra paga em dinheiro não se corrige: é preciso cancelar e lançar de novo.
- Valor: toda correção exige motivo. Ordens pagas, canceladas ou estornadas não se corrigem.
- Config.: fixo.
- Código: `lib/db/ordens-ciclo.ts:524-590`.

**FIN-06**: A troca manual de situação exige `financeiro_pagamento` e motivo. "Processando" só vale para ordem autorizada, e "Aguardando documento fiscal" só para ordem de contrato.
- Valor: o motivo é obrigatório, exceto na passagem de "A pagar" para "Processando".
- Config.: fixo.
- Código: `lib/ordens-situacoes.ts:19-56`.
- Nota: mandar para "A pagar" autoriza sem passar pela alçada.

**FIN-07**: O débito só pode sair de uma conta de pagamento: tipo "pagamento", conta ligada a uma conta bancária de remessa ativa, ou o centro do caixa.
- Valor: se o plano não tiver nenhuma conta de pagamento, todas as contas usáveis entram.
- Config.: `financeiro_config.centro_custo_caixa_id` e `financeiro_contas_bancarias.centro_custo_id`.
- Código: `lib/db/financeiro.ts:686-717`.

**FIN-08**: Cada regra de auditoria das ordens responde Aceitar, Alertar ou Bloquear, conforme a entidade e a origem da ordem. Os padrões são:
- `fornecedor_bloqueado`: bloqueia.
- `fornecedor_recente`: alerta para fornecedor cadastrado há menos de 30 dias.
- `duplicidade`: alerta para mesmo favorecido e valor com vencimento a ±7 dias.
- `proposta_unica`: aceita até R$ 5.000.
- `direta_limite`: aceita aquisição direta até R$ 10.000.
- `contrato_vencido`: bloqueia.
- `rpa_teto_mensal`: aceita até R$ 5.000 por autônomo no mês.
- `diaria_retroativa`: alerta para diária com mais de 30 dias.
- `vencimento_passado`: tolerância de 0 dias.
- Config.: tabela `auditoria_regras` (severidade e parâmetros), na tela Financeiro › Auditoria.
- Código: `lib/auditoria-regras-catalogo.ts:81-260`, `lib/db/ordens-verificacao.ts:265-505`.

**FIN-09**: A auditoria automática confere cada ordem e só informa, sem bloquear. Ela verifica:
- o rateio, que tem de fechar com o valor (tolerância de 0,01);
- a autorização dentro da alçada de quem aprovou;
- a segregação: quem autorizou não pode ter originado a despesa;
- se a dispensa de autorização é de uma origem que a permite (só Folha, Contrato e Locação);
- a duplicidade a ±7 dias.
- Config.: fixo.
- Código: `lib/db/ordens-auditoria.ts:47-49,85-280`.

**FIN-10**: Na conciliação, um débito do extrato casa com uma ordem paga de mesmo valor, e um crédito casa com um depósito de fonte, desde que a diferença de datas fique dentro de um limite.
- Valor: 3 dias para débitos e 5 dias para créditos; arquivo de até 20.000 linhas.
- Config.: fixo.
- Código: `lib/db/conciliacao.ts:26-28`.

---

## CAI: Caixa físico

**CAI-01**: Só o responsável pela conta recusa um aporte pendente, com motivo. O aporte recusado fica fora do saldo.
- Valor: motivo de pelo menos 5 caracteres.
- Config.: fixo.
- Código: `lib/db/caixa-reconhecimento.ts:259-299`.

**CAI-02**: A prestação de contas só é enviada com a conta aberta e sem despesa esperando reconhecimento.
- Valor: depois do envio, a conta fica "prestacao_pendente".
- Config.: fixo.
- Código: `app/painel/perfil/caixa/actions.ts:128-165`.

**CAI-03**: O envio da prestação pode ser desfeito enquanto ela estiver "aguardando". Depois que o gestor avalia, não pode mais.
- Valor: a prestação passa a "desfeita" e a conta reabre.
- Config.: fixo.
- Código: `app/painel/perfil/caixa/actions.ts:171-211`.

---

## COM: Compras, contratos e RPA

**COM-01**: Na aquisição direta paga em dinheiro, a conta é paga no ato. O vencimento é a data da compra e o caixa é debitado no lançamento.
- Valor: o caixa precisa estar aberto e com saldo. Quando autorizada, a ordem fecha como "Paga".
- Config.: fixo.
- Código: `lib/compras-constantes.ts:53` (`FORMA_PAGA_NO_ATO`), `lib/db/ordens-ciclo.ts:337-400`.

**COM-02**: Na aquisição direta, a forma de pagamento é obrigatória, e cada forma pede o seu detalhe. A nota fiscal também é obrigatória, menos em marketplace.
- Valor:
  - Pix: chave com pelo menos 5 caracteres.
  - Pix QR Code: começa com "000201" e tem pelo menos 40 caracteres.
  - TED: banco, agência, conta e favorecido.
  - Boleto: arquivo.
- Config.: fixo.
- Código: `lib/db/compras-pagamento-form.ts:44-118`, `app/painel/compras/nova/actions.ts:186-199`.

**COM-03**: Na compra em marketplace, a ordem não espera a nota fiscal, e o vendedor tem de ser outra empresa. Se a nota não chegar, quem comprou recebe um e-mail.
- Valor: um único e-mail, 7 dias depois.
- Config.: fixo.
- Código: `lib/db/compras-marketplace.ts:15-28,316-345`.

**COM-04**: A ordem de compra só vai por e-mail para contatos do fornecedor marcados "recebe OC".
- Valor: `recebe_ordem_compra = true`.
- Config.: na ficha do fornecedor.
- Código: `lib/db/ordem-compra.ts:~195-247`.
- Nota: se a coluna não existir no banco, o envio vai para qualquer contato com e-mail.

**COM-05**: O RPA calcula o INSS sobre o valor bruto, com teto; o IRRF por faixas, com dedução por dependente; e o ISS sobre o bruto.
- Valor:
  - INSS: 11%, teto de R$ 8.157,41.
  - IRRF: isento até R$ 2.428,80, alíquota máxima de 27,5%; dedução de R$ 189,59 por dependente.
  - ISS: 5%.
- Config.: `compras_rpa_config`, na tela Compras › RPA.
- Código: `lib/rpa-calculo.ts:56-68,90-142`.

**COM-06**: Um contrato aparece como "vencendo" quando termina dentro de um prazo, e cada geração tem um número máximo de parcelas.
- Valor: 30 dias; até 120 parcelas. A parcela mensal ou anual cai no último dia do mês quando o dia não existe.
- Config.: fixo.
- Código: `lib/contratos-constantes.ts:30,79,88-131`.

---

## INS: Institucional (custeio, diárias, viagens, reembolsos)

**INS-01**: O custeio passa por rascunho, aguardando autorização e autorizado, e só gera ordens quando autorizado. A parcela recorrente nasce dispensada de nova autorização; o pagamento único passa pela alçada e pela permissão de custeio.
- Valor: a parcela recorrente vai para "A pagar" se a formalização estiver anexada; se não, para "Aguardando documento fiscal".
- Config.: fixo.
- Código: `lib/db/custeio.ts:771-873,897-994`.

**INS-02**: A conta contábil de uma diária ou despesa é buscada em cascata:
1. quadro, departamento e tipo de gasto;
2. quadro, sem departamento, e tipo de gasto;
3. nenhuma conta: o Financeiro classifica na autorização.
- Valor: quadros funcionário, diretor e convidado (este só em Viagens).
- Config.: tabela `pessoal_diarias_centros_custo`, na tela Pessoal › Diárias › Contas.
- Código: `lib/db/diarias-config.ts:8-23,149-226`.

**INS-03**: O valor da diária é o valor de referência do tipo vezes a quantidade. As multas de trânsito pendentes do infrator são descontadas, cada uma só se couber no que resta.
- Valor: `financeiro_diarias.valor_reembolso` × quantidade.
- Config.: tipos de diária e usuários autorizados, em `financeiro_diarias`.
- Código: `lib/db/diarias.ts:79-86,436-450,637-734`.

**INS-04**: A remessa de diárias é avaliada inteira e gera uma única ordem, rateada por conta. No modo "remessa" (padrão), a ordem nasce autorizada. No modo "alçada", ela só nasce autorizada se o total couber na alçada de quem aprovou.
- Valor: lembrete quando a remessa está há 7 dias ou mais em preparação, no máximo 1 por semana.
- Config.: `financeiro_config.diarias_autorizacao`.
- Código: `lib/db/diarias-config.ts:273-300`, `lib/db/diarias-remessas.ts:459-620,856-909`.

**INS-05**: O reembolso do ACT dos funcionários é o menor valor entre a despesa vezes a proporção e o teto do tipo. O avaliador pode glosar, mas nunca aprovar acima disso.
- Valor: o menor entre despesa × proporção e o teto.
- Config.: `pessoal_reembolsos_act_tipos` (`proporcao_reembolsavel`, `valor_limite`).
- Código: `lib/reembolsos-calculo.ts:12-20`.

---

## PES: Pessoal (RH da entidade)

**PES-01**: O movimento da folha mostra se um lançamento entrou antes do dia de corte. O que chega depois que a competência foi enviada vai para a seguinte, marcado como retroativo.
- Valor: dia 15.
- Config.: fixo.
- Código: `lib/db/folha-movimento.ts:29` (`DIA_CORTE`).
- Nota: o corte só aparece na tela; a montagem das linhas não o usa.

**PES-02**: Quando as datas do período de férias estão em branco, o sistema as calcula.
- Valor: direito de 30 dias; período aquisitivo = início + 365 dias; período concessivo = mais 365 dias. O abono vende 1/3 e só vale com autorização do gestor.
- Config.: fixo.
- Código: `lib/db/ferias.ts:24,175,279-285`, `lib/ferias-painel.ts:63`.

**PES-03**: As férias seguem as regras de divisão da CLT.
- Valor:
  - até 3 partes;
  - cada parte com pelo menos 5 dias, e uma delas com pelo menos 14;
  - não pode começar na sexta, no sábado nem nos 2 dias antes de um feriado nacional;
  - tem de caber no período concessivo, sem sobreposição;
  - o gozo recusado não ocupa uma das partes.
- Config.: fixo (só feriados nacionais).
- Código: `lib/db/ferias.ts:76-124,363-416`, `lib/ferias-painel.ts:18-32`.

**PES-04**: O painel alerta quando o período concessivo tem saldo que vence em breve.
- Valor: 120 dias.
- Config.: fixo.
- Código: `lib/ferias-painel.ts:35`.

**PES-05**: As faltas justificadas têm limites por ano, por mês e por semana. Entram na conta as que estão aguardando e as autorizadas.
- Valor: sem limite por padrão. O funcionário pode cancelar até a véspera. Um novo pedido é bloqueado se a última falta autorizada não foi comprovada.
- Config.: `pessoal_faltas_config`.
- Código: `lib/faltas-constantes.ts:39-111`, `lib/db/faltas.ts:40`.

**PES-06**: O anuênio avança um degrau a cada aniversário de emprego.
- Valor: degraus de 0 a 30, cada um com sua alíquota; o próximo é o nível + 1, um ano depois.
- Config.: tabela `pessoal_anuenio_base`.
- Código: `lib/db/carreira.ts:15-19,406-431`.

**PES-07**: O ASO fica vencido quando a data passa e aparece como "a vencer" dentro de uma janela.
- Valor: 90 dias.
- Config.: fixo.
- Código: `lib/aso-situacao.ts:19-24`, `lib/db/vencimentos.ts:191`.

---

## SAU: Saúde do trabalhador

**SAU-01**: O relatório clínico é cifrado. Só o lê quem o escreveu, um profissional do mesmo tipo de atendimento ou a coordenação. A permissão de gestão da saúde não dá acesso ao relatório.
- Valor: AES-256-GCM, com a chave numa variável de ambiente. Todo acesso fica registrado, inclusive os negados.
- Config.: os profissionais e os tipos (`saude_profissionais`).
- Código: `lib/saude-sigilo.ts:32,158-189`.

---

## HOS: Hospedagem

**HOS-01**: A entidade pode limitar quem usa a hospedagem (por fontes pagadoras, regimes ou lista de beneficiários) e quantos cupons cada pessoa usa no mês ou no ano.
- Valor: sem restrição por padrão; quando o limite é ligado, 1 por mês. A conta usa a data de check-in e ignora os cupons cancelados.
- Config.: `hospedagem_condicoes`.
- Código: `lib/hospedagem-condicoes-constantes.ts:37-170`.

**HOS-02**: Não comparecer leva a uma penalidade. Conta como falta, no fim do dia do check-in, a reserva que não foi cancelada, não teve entrada e não foi abonada.
- Valor: regra desligada por padrão. Quando ligada, 1 falta em 12 meses suspende por 30 dias. As alternativas são "consumir o período" ou "desabilitar" até a equipe liberar.
- Config.: `hospedagem_condicoes.nao_comparecimento_*`.
- Código: `lib/hospedagem-garantida-constantes.ts:359-460`, `lib/db/hospedagem-garantida.ts:251-273`.

**HOS-03**: No hotel de demanda garantida, valem limites de estadia, cancelamento e lista de espera.
- Valor:
  - até 7 noites por estadia;
  - check-in às 14:00;
  - cancelamento até 24 h antes;
  - vaga da lista de espera guardada por 12 h (ou até 1 h antes da chegada);
  - último quarto guardado para o outro sexo até 3 dias antes.
- Config.: por hotel (`max_noites`, `cancelamento_horas`, `espera_prazo_horas`, `trava_*`).
- Código: `lib/db/hospedagem-garantida.ts:126-142,604,1471`.

---

## ESP: Cessão de espaços e eventos

**ESP-01**: Um pedido externo de cessão de espaço só é confirmado com um código enviado por e-mail.
- Valor: válido por 20 minutos, com até 5 tentativas.
- Config.: fixo.
- Código: `lib/db/espacos-solicitacao.ts:41-42`.

**ESP-02**: As vagas de um evento são a lotação mais o overbooking, com um teto. A cota de convidados é reservada, e o link público oferece as vagas menos a cota restante.
- Valor: lotação + overbooking%, limitado por `limite_inscricoes`.
- Config.: por evento.
- Código: `lib/db/eventos.ts:318-412`.

---

## VEI: Veículos

**VEI-01**: Na devolução, uma média alta de quilômetros por hora pede confirmação do hodômetro.
- Valor: acima de 100 km/h desde a retirada; menos de 1 h conta como 1 h.
- Config.: fixo.
- Código: `lib/veiculos-constantes.ts:30`.

**VEI-02**: CNH vencida ou condutor não autorizado bloqueia o pedido de veículo. O aviso de vencimento da CNH sai com antecedência.
- Valor: aviso 30 dias antes.
- Config.: fixo.
- Código: `lib/db/veiculos.ts:749-768`, `lib/db/vencimentos.ts:116`.

---

## LGP: LGPD e retenção

**LGP-01**: Os contatos dos aptos (e-mail, telefone, Telegram, nascimento informado) são apagados um tempo depois de encerrada a apuração de todas as assembleias da rodada. Nome, CPF, hora do voto e comprovante ficam.
- Valor: 90 dias por padrão; a tela oferece 30, 60, 90, 180 ou 365 dias, e o banco aceita de 7 a 3.650.
- Config.: por rodada (`voto_rod_assembleias.contatos_reter_dias`), não por entidade.
- Código: `lib/assembleias-constantes.ts:378-379`, `lib/db/votacao-expurgo.ts:60,88`.

**LGP-02**: RT30: a foto do inscrito num evento é apagada depois de um prazo.
- Valor: 30 dias por padrão (mínimo 1, máximo 3.650), contados de `foto_capturada_em`.
- Config.: `eventos_config.retencao_foto_dias`.
- Código: `lib/lgpd/retencao-regras.ts:32`, `lib/lgpd/retencao-motor.ts:144-163`.

**LGP-03**: RT31: os registros de tentativas de acesso e de envio de códigos são apagados depois de um prazo.
- Valor: 183 dias (mínimo legal de 183, pelo Marco Civil, art. 15).
- Config.: `lgpd_regras_retencao`.
- Código: `lib/lgpd/retencao-regras.ts:45`.

**LGP-04**: RT02: as fichas públicas de filiação não concluídas são apagadas, com o PDF, depois de um prazo.
- Valor: 365 dias por padrão (mínimo 90).
- Config.: `lgpd_regras_retencao`.
- Código: `lib/lgpd/retencao-regras.ts:57`.

**LGP-05**: O motor de retenção usa o maior valor entre o mínimo legal e o prazo escolhido. Ele poupa os registros com bloqueio por litígio e processa um número máximo de linhas por regra em cada rodada.
- Valor: até 20.000 linhas por regra e rodada.
- Config.: fixo.
- Código: `lib/lgpd/retencao-motor.ts:24,334,362`.

**LGP-06**: Uma regra de retenção só pode ser ligada para valer de verdade depois de uma simulação recente sem erro. Na tela, o motor só simula; o modo real roda só pelo cron.
- Valor: simulação feita há menos de 45 dias.
- Config.: Institucional › LGPD.
- Código: `lib/db/lgpd-retencao.ts:~172,~188`.

---

## Achados do levantamento (19/10/2026)

Pontos em que o código e a regra esperada divergem, ou em que a regra tem brecha. Cada um vira item de correção ou decisão.

| # | Achado | Proposta |
|---|---|---|
| R-1 | **Carência configurável para 5 benefícios** (hospedagem, saúde, jurídico, eventos, votação), mas o código só a aplica na **votação**. A inadimplência não suspende nada: só gera relatório e aviso no portal. | Aplicar a carência nos outros benefícios ou tirar a opção da tela |
| R-2 | **Código de confirmação do e-mail de votação (15 min) sem limite de tentativas**: dá para chutar à vontade durante a validade. A constante está repetida em dois arquivos. | Limite de tentativas por código (ex.: 5) e constante única (V3 da RIPD da votação) |
| R-3 | **Alçada contornável:** quem tem `financeiro_pagamento` leva a ordem a "A pagar" sem alçada; diárias no modo "remessa" (padrão) nascem autorizadas; a parcela sob demanda de contrato nasce autorizada, embora o manual diga que passa pela alçada. | Decidir com a entidade; registrar a dispensa como evento auditável |
| R-4 | **Auditoria × custeio recorrente:** a parcela recorrente grava dispensa de autorização, mas a auditoria só aceita dispensa de Folha, Contrato e Locação, então deve acusar falha. A janela de duplicidade é ±7 dias fixa na auditoria e configurável na criação. | Alinhar a lista de dispensas e usar a mesma janela nas duas pontas |
| R-5 | **Prorrogação de votação sem limite**, que estende a rodada sozinha e contorna a regra da janela dentro da rodada. | Limite e registro no livro da apuração |
| R-6 | **Urna física:** lacre não conferido não bloqueia; sem checagem de horário; contagem editável depois de concluída; lacre pode ser apagado de vez. | Travas como as de C-1 (dossiê da votação) para a contagem física |
| R-7 | **Fuso:** duas funções da votação usam o relógio do servidor (UTC); depois das 21h a rodada pode contar como encerrada um dia antes. | Usar o dia de São Paulo (ADR 0014) |
| R-8 | **Corte do dia 15** do movimento da folha só aparece na tela; a montagem não o usa. | Aplicar na montagem ou tirar da tela |
| R-9 | **Férias:** só feriados nacionais; aquisitivo e concessivo calculados se sobrepõem em um dia. | Feriados por sede; corrigir o limite |
| R-10 | **RPA:** padrões de INSS e IRRF com tabelas de 2025. | Atualizar para 2026 e tornar a tabela configurável por ano |
| R-11 | **Valores fixos** que talvez devessem ser configuráveis: degraus de bloqueio de login, 5 falhas no link único, ASO 90 dias, CNH 30 dias, km anormal 100 km/h, limites do ponto, conciliação 3 e 5 dias, aviso de nota de marketplace 7 dias, contrato "vencendo" 30 dias. | Avaliar caso a caso |

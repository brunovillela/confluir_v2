# Glossário do Confluir

> **Onda F** (`docs/plano-documentacao.md`), 19/10/2026. Termos do domínio como o sistema os entende. Regras com valores e prazos: [`regras-negocio.md`](regras-negocio.md). Tabelas e colunas: [`docs/dados/`](../dados/LEIA-ME.md).

Para quem chega ao sistema: desenvolvedor, auditor ou nova entidade. Cada termo traz, entre parênteses, sinônimos e o nome no banco quando existe. As definições foram conferidas no código (`src/lib`), no dicionário de dados (`docs/dados/dicionario`) ou no manual (`src/conteudo/ajuda`).

---

## 1. Organização e acesso

**Entidade** (tenant, sindicato; `tenants`, `empresa` com `tenants.empresa_id`) — A organização atendida pela plataforma. Cada entidade tem um subdomínio próprio (`tenants.slug`) e todos os seus dados levam `emp_proprietaria_id` apontando para o registro dela em `empresa`.

**Empresa** (`empresa`) — Cadastro único de organizações: a própria entidade, empregadores, fundos de pensão, fornecedores, conveniados e entidades apoiadas, distinguidos por marcas booleanas. Inclui fornecedor pessoa física identificado por CPF.

**Departamento** (`empresa_departamentos`, `empresa_departamentos_integrantes`) — Secretaria ou setor da entidade, com coordenador e integrantes. Usado em compras, ofícios, agenda, contas contábeis, diárias e avisos; o departamento legado sai das listas mas fica nos registros antigos.

**Permissão** (ACL plana; `permissoes`) — Uma coluna booleana por área ou ação do sistema, por usuário, editada em Configurações › Permissões. Inclui a alçada de aprovação.

**Perfil de acesso** (RBAC; `perfis`, `perfil_permissoes`, `usuario_perfis`) — Conjunto nomeado de permissões (ex.: Recepção, Financeiro) atribuído a usuários por cima da ACL plana. Um perfil pode "conceder tudo" e tem alçada própria; vale a maior entre a do usuário e a dos perfis.

**Alçada** (`alcada_aprovacao` em `permissoes` e `perfis`) — Valor máximo de ordem de pagamento que a pessoa pode autorizar. Perfis de comando podem ter alçada "sem teto".

**Conta de função** (`usuarios`, `usuarios_ocupacoes`) — Login ligado a um posto, não a uma pessoa (ex.: recepcao@). Registra quem ocupou o posto e quando, como titular ou em cobertura (férias, afastamento, substituição).

**"Ver como"** (ver como filiado / eleitor / hotel; `lib/visualizacao-*.ts`) — Visualização somente leitura de uma área externa (portal do associado, cédula do eleitor, interface do hotel) feita pela gestão. Usa um cookie assinado de curta duração e nunca cria sessão de escrita em nome da pessoa.

**Caixa de entrada** (caixa de entrada de pendências; `lib/db/pendencias.ts`) — Bloco da página inicial do painel que reúne tudo que espera a pessoa agir, filtrado pelas permissões dela. Não grava nada; conta as pendências de cada fonte.

**Pendência** (no painel) — Item que aguarda ação de alguém (ordem em autorização, pedido a avaliar etc.). Conta como "parada" depois de 7 dias.

**Aviso** (`notificacoes`, `avisos_entregas`, `lib/db/avisos.ts`) — Mensagem a quem precisa agir, entregue pelo sino (só eventos do grupo notificação), por e-mail ou Telegram conforme a preferência que a pessoa ligou (opt-in). `avisos_entregas` evita repetir o mesmo aviso.

---

## 2. Filiação

**Filiado** (associado; `filiacoes`) — Pessoa no cadastro de filiação da entidade, inclusive ex-filiados e não filiados. A situação dela fica em `filiacao_condicao`.

**Condição de filiação** (condição sindical; `filiacoes.filiacao_condicao`) — Situação do filiado perante a entidade. Valores: Ativo, Inativo, Aguarda ficha assinada, Em processo de filiação coletiva, Filiação aguarda fonte, Filiação não informada à fonte, Desfiliação aguarda fonte, Desfiliação não informada à fonte, Falecido, Excluído(a) do quadro associativo.

**Condição na fonte** (`filiacao_vinculos.condicao_na_fonte`) — Situação da pessoa junto à fonte pagadora: trabalhador(a) da ativa, beneficiário(a) aposentado(a) ou pensionista. Não se confunde com a condição de filiação.

**Fonte pagadora** (fonte; `empresa` marcada como empregador ou fundo de pensão) — Empresa ou fundo de pensão que desconta a contribuição e a repassa à entidade. A entidade pode criar categorias além de Empregador e Fundo de pensão (`fonte_categorias`).

**Vínculo** (`filiacao_vinculos`) — Ligação do filiado com uma fonte pagadora: matrícula na empresa, cargo, lotação, admissão e demissão. O vínculo corrente define a categoria de fonte usada na saúde do cadastro.

**Matrícula sindical** (`filiacoes.matricula_sindical`, `matricula_sindical_numero`) — Número sequencial do filiado na entidade (não na empresa). A próxima é a maior em uso + 1; guarda só dígitos, sem zeros à esquerda.

**Forma de recebimento** (`filiacoes.forma_recebimento`) — Como a entidade recebe a contribuição da pessoa: consignado (desconto em folha), Pix ou boleto.

**Carência** (`filiacao_carencias`) — Prazo, em dias após a filiação, para o associado ganhar cada direito (voto, hospedagem, convênios...). Configurada por entidade e benefício; hoje o código só a aplica à votação.

**Inadimplência** (`filiacao_inadimplencia_regras`) — Regra que aponta o filiado como inadimplente depois de certo número de remessas sem contribuição, consecutivas ou numa janela. Configurada por entidade; só gera relatório e aviso, não suspende nada automaticamente.

**Saúde dos cadastros** (`empresa.filiacao_saude_config`, `lib/saude-cadastros.ts`) — Medidor de completude dos cadastros. Para cada categoria de fonte, a falta de cada dado é pendência (derruba a saúde), apontamento (só avisa) ou normal (ignorada).

**Filiação coletiva** (`filiacao_coletiva`, `filiacao_coletiva_itens`) — Lote gerado a partir de uma assembleia ou acordo em que aptos viram filiados, com prazo de desistência e possibilidade de reverter.

**Área do associado** (portal do associado; `/portal`, `portal_partes`) — Área do filiado na internet. Cada parte pode ser habilitada, suspensa (com aviso e retorno previsto) ou desabilitada pela entidade.

**Primeiro acesso** (`lib/db/portal-primeiro-acesso.ts`) — Regra opcional do portal: o filiado só usa a área depois de aceitar o termo LGPD em vigor e completar os campos obrigatórios do cadastro.

---

## 3. Receitas e contribuições

**Remessa de recebimento** (relação de descontos; `filiacao_recebe_remessa`) — Conjunto das contribuições de uma fonte pagadora numa competência (ano/mês). Agrupa as linhas de `filiacao_recebe`.

**Contribuição (linha da remessa)** (`filiacao_recebe`) — O valor de um trabalhador numa remessa, importado em Receitas a partir da relação enviada pela fonte (planilha, PDF, TXT ou imagem lida por IA).

**Cobrança direta** (`filiacao_cobrancas`, `filiacao_cobranca_config`) — Mensalidade emitida ao filiado por Pix ou boleto, por competência, quando não há desconto em folha.

**Contribuição assistencial** — Contribuição cobrada da categoria (filiados ou não) por força de acordo ou convenção, da qual o trabalhador pode se opor.

**Oposição** (carta de oposição; `oposicao_campanha`, `oposicao_opositor`) — Manifestação do trabalhador contra a contribuição assistencial, feita numa campanha de oposição com prazo, empresas abrangidas, vídeos obrigatórios e declaração. A carta é avaliada e admite desistência.

**Reembolso a filiado** (`filiacao_reembolsos`) — Valor pago ao filiado por participar de reunião, ato ou assembleia, que gera ordem de pagamento.

---

## 4. Votação e assembleias

**Campanha de votação** (`voto_campanha`) — Tema que agrupa rodadas e assembleias (ex.: campanha salarial), com as fontes pagadoras abrangidas.

**Rodada** (`voto_rod_assembleias`) — Período de votação dentro de uma campanha. É dona das perguntas e da lista de aptos; as assembleias ficam dentro dela.

**Assembleia** (`voto_assembleias`) — Sessão de votação dentro de uma rodada: online, por urna ou reunião de trabalhadores, com janela própria, edital, sala virtual e resultado. Pode ser da categoria (vota toda a base apta) ou pleito interno ("somente filiados", com carência).

**Apto** (eleitor apto; `voto_assembleias_aptos`) — Pessoa da lista da rodada autorizada a votar. Vale para qualquer assembleia da rodada, uma vez só, salvo se ligada a uma assembleia específica.

**Participação** (`voto_assembleias_aptos`, `voto_participacao_legado`) — Registro de que o apto votou (quando, canal, presença, comprovante), separado do conteúdo do voto.

**Voto** (`voto_online`) — Escolha por pergunta, gravada sem ligação com a pessoa (`eleitor_id` sempre nulo e data reduzida ao primeiro instante do mês). A exceção é o voto em separado até a apuração.

**Voto em separado** (`voto_em_separado`) — Voto de quem alega direito sem estar na lista de aptos, registrado pelo mesário quando a assembleia permite. Fica ligado à pessoa até a apuração deferir ou descartar.

**Mesário** (`voto_mesarios`) — Pessoa cadastrada na rodada que entra em `/mesario` por código no e-mail e registra a presença dos eleitores e libera a cédula, nunca o voto.

**Apurador** (`voto_apuradores`) — Pessoa cadastrada na rodada que entra no ambiente de apuração por código no e-mail, confere lacres e lança a contagem das urnas físicas.

**Urna** (`voto_urnas`, `voto_urna_terminais`) — Urna física ou digital de uma assembleia presencial, com janela de abertura e apurador. A urna digital usa terminais pareados em que o mesário libera a cédula.

**Lacre** (`voto_urna_lacres`) — Selo numerado (boca e principal) da urna física, com instalação, rompimento e guarda registrados.

**Apuração** (`voto_apuracao_urna`, `voto_apuracao_contagem`, `voto_resultado_final`) — Contagem e confirmação do resultado pelo gestor. Encerramentos e reaberturas ficam no livro da apuração (`voto_apuracao_eventos`), só de acréscimo, com SHA-256 do resultado congelado.

**Comprovante de votação** — Código que prova que a pessoa votou, nunca o que votou. Fica no apto, com hash SHA-256 para conferir integridade.

**Link pessoal** — Endereço individual enviado no e-mail "Você está habilitado a votar" que abre a cédula sem pedir código.

**Link único** (`/votar`) — Endereço único da entidade com todas as votações abertas, para quem não recebe o e-mail da empresa. A pessoa se identifica e confirma por código no e-mail ou pelo Telegram.

---

## 5. Representação, acordos e negociações

**Empregador** (`empresa` marcada como empregador) — Empresa da base. Em Representação › Empregadores tem abas de documentos, reuniões e setoriais.

**ACT / CCT** (acordo coletivo / convenção coletiva; `acordo_coletivo`, `acordo_clausulas`) — Instrumento coletivo com vigência, PDF e texto integral, separado em cláusulas para busca por tema e comparação.

**Negociação** (`negociacoes`, `negociacao_eventos`) — Negociação coletiva com data-base, situação, acordo vigente e final, linha do tempo e campanha de votação ligada.

**Setorial** (`representacao_reunioes.tipo = 'setorial'`) — Reunião com os trabalhadores de um setor, registrada ao lado das reuniões com o empregador.

---

## 6. Diretoria e ofícios

**Mandato** (`diretoria_mandatos`) — Período de uma diretoria, com ata de posse e regimentos. Pai dos integrantes, grupos, liberações e atas.

**Integrante da diretoria** (`diretoria_integrantes`) — Pessoa do mandato, organizada em grupos (ex.: Executiva, Conselho Fiscal). Quem tem `pode_assinar` no mandato vigente pode ser signatário de ofício.

**Instância** (`diretoria_instancias`, `diretoria_instancia_assentos`) — Órgão externo (conselho, federação, comissão) em que a diretoria tem assento, com cargo, período e nomeação.

**Liberação de dirigente** (`diretoria_liberacoes`) — Dispensa do trabalho dada pelo empregador a um diretor ou trabalhador da base para atividade sindical, permanente ou pontual, com o ofício que a pediu.

**Ofício** (`oficios`, `oficios_filiados`) — Documento numerado por ano emitido pela entidade, manual ou automático (filiação/desfiliação comunicada à fonte), com signatário da diretoria e assinatura eletrônica.

**Assinatura eletrônica** (`documento_assinaturas`, `documento_assinatura_eventos`) — Envelope por assinante com link, código por e-mail, hash do conteúdo e trilha só de inserção. Usado em ofícios, termos de cessão, minutas e RPA.

---

## 7. Financeiro

**Ordem de pagamento** (ordem; `ordens_pagamento`) — Todo pagamento da entidade (compra, contrato, diária, reembolso, RPA, folha, custeio): beneficiário, valor, forma, autorização e pagamento. Os módulos geram ordens; o Financeiro autoriza e paga.

**Auditoria das ordens** (verificação; `ordens_pagamento_verificacoes`, `auditoria_regras`) — Conferência automática de cada ordem por regras configuráveis por origem, com severidade. Os apontamentos aparecem antes de autorizar.

**Estorno** (`ordens_pagamento_estornos`) — Registro de pagamento devolvido pelo banco ou pelo favorecido e de como foi resolvido.

**Centro de custo** (conta contábil; `centros_de_custo`) — Conta do plano de contas que classifica a despesa. É exibida como "Código - Conta".

**Caixa** (caixa físico; `caixa_contas`, `caixa_movimentacoes`) — Dinheiro em espécie sob responsabilidade de um usuário. O responsável lança as movimentações em Meu perfil e o Financeiro reconhece ou recusa.

**Aporte** — Entrada de dinheiro num caixa físico, que o responsável pode recusar com motivo.

**Prestação de contas** (`caixa_prestacoes`) — Fechamento do caixa aberto pelo responsável com saldo declarado. O Financeiro aprova ou devolve; o envio pode ser desfeito até a avaliação.

**CNAB** (remessa bancária; `financeiro_remessas`, `financeiro_remessa_itens`, `financeiro_contas_bancarias`) — Arquivo CNAB 240 de pagamentos gerado para o banco e o retorno importado depois.

**Conciliação** (`banco_extratos`, `banco_lancamentos`) — Ligação dos lançamentos do extrato (OFX ou CSV) a ordens, comprovações de repasse ou cobranças Pix.

---

## 8. Compras, fornecedores e contratos

**Fornecedor** (`empresa` marcada como fornecedor, `empresa_contatos`) — Empresa ou pessoa física que vende à entidade. Só os contatos marcados "recebe ordem de compra" recebem a OC por e-mail.

**Aquisição** (compra, processo de compra; `compras_solicitacoes`) — Processo da solicitação (ou aquisição direta) à cotação, compra, pagamento e recebimento. Situações: solicitada, em cotação, cotada, comprada, recebida, cancelada.

**Ordem de compra** (OC; `lib/db/ordem-compra.ts`) — PDF enviado por e-mail ao fornecedor confirmando a compra.

**Compra em marketplace** — Compra em loja virtual em que a nota fica "a receber" e o vendedor é registrado, com cobrança por e-mail.

**Contrato** (`contratos`) — Contrato com fornecedor PJ ou PF: objeto, vigência, valor, aditivos e parcelas. Categoria sigilosa restringe quem vê.

**Minuta** (`contratos_minutas`, `contratos_minutas_versoes`) — Rascunho de contrato redigido com IA a partir de tipo e cláusulas fixas da entidade, revisado e versionado.

**RPA** (Recibo de Pagamento a Autônomo; `compras_rpa`, `compras_rpa_config`) — Recibo para prestador pessoa física por contrato ou compra de serviço, com INSS, IRRF e ISS calculados pelos parâmetros da entidade e assinatura por link ou anexo.

---

## 9. Institucional, diárias e viagens

**Custeio institucional** (`institucional_custeios`) — Pagamento a diretor, filiado (demitido político), convidado externo ou assessoria por uma finalidade, em parcelas, que vira ordem de pagamento e exige formalização (documento fiscal).

**Diária** (`pessoal_diarias_solicitacoes`) — Valor pago a funcionário ou diretor por atividade fora da sede, com despesas extras opcionais. Entra numa remessa mensal e gera ordem de pagamento.

**Remessa de diárias** (`pessoal_diarias_remessas`) — Conjunto mensal das diárias de um beneficiário: preparação, envio, avaliação, devolução e ordem.

**Quadro** (`pessoal_diarias_centros_custo.quadro`) — Grupo de quem recebe, para escolher a conta contábil: funcionário, diretor ou convidado (este só em viagens, não recebe diária).

**Viagem** (`viagens_solicitacoes`, `viagens_itens`, `viagens_faturas`) — Pedido de passagens e hospedagens para diretor, funcionário ou convidado. A fatura da agência vira aquisição direta e ordem com rateio.

---

## 10. Hospedagem e espaços

**Hotel conveniado** (`hospedagem_hotel`) — Hotel com regras de convênio: modalidade normal ou demanda garantida, quartos dedicados, prazos de cancelamento e espera. Tem interface própria em `/hotel`.

**Cupom de hospedagem** (`hospedagem_cupom`) — Reserva de um filiado num hotel conveniado (datas, tarifa, presença, cancelamento, não comparecimento), criada pelo portal ou pelo hotel em caso emergencial.

**Condições de uso da hospedagem** (`hospedagem_condicoes`) — Regras da entidade: restrição por fonte e regime, limite de cupons por período, só beneficiários e punição por não comparecimento.

**Demanda garantida** (`hospedagem_alocacoes`, `hospedagem_espera`) — Modalidade em que a entidade garante quartos dedicados; o sistema distribui os cupons nos quartos por noite e mantém fila de espera com oferta por link.

**Cessão de espaço** (`cessao_espacos`, `cessao_solicitacoes`) — Empréstimo de um espaço da entidade (um ou mais recintos) a terceiros, pedido por link público ou painel, com janelas, bloqueios, exigências de segurança e termo.

---

## 11. Pessoal (RH da entidade)

**Funcionário** (`usuarios` + `vinculos_trabalhistas`) — Empregado da própria entidade, gerido em Pessoal.

**Contracheque** (`pessoal_contracheques`) — PDF mensal do funcionário com líquido, que pode gerar ordem de pagamento (tipo "Folha de pagamento") e é liberado em Meu perfil.

**Movimento da folha** (`pessoal_folha_competencias`) — Alterações do mês (dependentes, jornada, função, ausências etc.) enviadas à contabilidade por competência, com fotografia do que foi entregue.

**Ponto** (espelho de ponto; `pessoal_registro_ponto`, `pessoal_registro_ponto_remessas`) — Espelho mensal em PDF com saldos de horas extras (70% e 100%) e marcações diárias lidas por IA.

**Período aquisitivo / concessivo** (`pessoal_ferias`) — Ciclo que dá direito a férias e prazo em que devem ser concedidas, com dias disponíveis e abono. O gozo (`pessoal_ferias_gozo`) é pedido pelo funcionário em Meu perfil e autorizado em Pessoal.

**Falta justificada** (`pessoal_faltas_justificadas`, `pessoal_faltas_config`) — Pedido de abono de falta com tipo e comprovante, sujeito a limites por ano, mês e semana definidos pela entidade.

**Anuênio** (`pessoal_anuenio`, `pessoal_anuenio_base`) — Adicional por tempo de casa: degraus de 0 a 30 anos com alíquota sobre o salário básico, avançando no aniversário de emprego.

**ASO** (Atestado de Saúde Ocupacional; `aso`) — Exame ocupacional (NR-7) do funcionário com tipo e vencimento, usado nos alertas.

---

## 12. Saúde do trabalhador

**Assistido** (`saude_assistidos`) — Pessoa atendida pelo serviço de saúde da entidade, filiada ou não, com regras de retenção e anonimização.

**Atendimento de saúde** (`saude_atendimentos`, `saude_atendimentos_relatorio`) — Atendimento por profissional (psicologia, assistência social...). O relatório clínico é cifrado (AES-256-GCM) e só o autor, profissionais do mesmo tipo e a coordenação leem; cada acesso fica registrado.

**CAT** (Comunicação de Acidente de Trabalho; `saude_cat`) — Registro dos acidentes de trabalho da base, com os campos do formulário oficial, cadastrados à mão, por planilha ou por leitura de PDF com IA.

**CIPA** (`saude_cipa_agenda`, `saude_cipa_representantes`) — Reuniões da Comissão Interna de Prevenção de Acidentes nas empresas da base em que a entidade tem representantes.

---

## 13. Comunicação e eventos

**Evento** (`eventos`, `eventos_inscricoes`) — Evento com inscrição pública sem login, lotação, aprovação, foto, RSVP e cota de convidados. A presença é registrada por dia na recepção.

**Cota de convidados** (`eventos`) — Quantos convidados cada inscrito pode levar ao evento.

---

## 14. Plataforma e LGPD

**Motor de retenção** (`lgpd_regras_retencao`, `lgpd_retencao_execucoes`) — Rotina mensal que elimina ou anonimiza dados vencidos por regra (código RT). Desligada, só simula; cada execução fica no livro.

**Bloqueio por litígio** (legal hold; `lgpd_bloqueios_litigio`) — Trava que tira uma pessoa ou registro de todas as regras de retenção enquanto vigente.

**Livro de exportações** (`lgpd_exportacoes`) — Registro de cada arquivo com dado pessoal gerado no painel (planilha, PDF, CNAB): quem, quando, filtros e quantidade.

**Código de acesso** (`auth_codigos_envios`, `lib/codigo-acesso.ts`) — Código enviado por e-mail para entrar no portal ou votar, com limite de frequência de envio por endereço.

**Bloqueio de login** (`login_tentativas`, `lib/login-bloqueio.ts`) — Contador de falhas de login e de envio de código que bloqueia temporariamente a chave depois de várias falhas.

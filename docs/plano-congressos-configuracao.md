# Congressos — área de configuração (09/11/2026)

> Complemento de [plano-congressos.md](plano-congressos.md). **Situação:** desenho, nada implementado.

## 1. A ideia

Nenhum congresso é igual a outro. Em vez de embutir as regras de um evento no código, cada congresso tem uma **configuração** que a comissão ajusta, e o sistema aplica.

O catálogo abaixo reúne **todas as decisões encontradas** em seis regimentos de portes diferentes (21º Congrenf, XIV Confup, IX Plenafup, 12º Concut, 4ª Conferência Nacional de Cultura, Conferência de Saúde de Resende), além das propostas de Saúde/SC, Joinville e Fiocruz. Os exemplos citam a origem de cada opção.

## 2. Como a área funciona

### Ponto de partida

Ninguém começa de uma tela vazia com 150 campos. A configuração começa por um destes caminhos:

| Caminho | O que faz |
|---|---|
| **Copiar a edição anterior** | Traz a configuração do congresso passado da mesma entidade. É o caminho mais comum. |
| **Modelo pronto** | Congresso sindical regional · Congresso ou plenária de federação · Congresso nacional de central · Conferência de políticas públicas · Assembleia simples · Em branco |
| **Ler o regimento** | A IA lê o PDF e propõe cada ajuste **com o artigo de origem**. A comissão confere item a item antes de gravar. |

### Regras de funcionamento

- **Só aparece o que se aplica.** Se o congresso não tem grupos, toda a parte de grupos some. Se não há eleição, a seção de eleições some. Ajustes avançados ficam recolhidos.
- **Cada ajuste mostra a origem:** "Art. 21, parágrafo único" ou "padrão do modelo". Assim a comissão sabe o que veio do regimento e o que ninguém decidiu.
- **Conferência de consistência.** O sistema alerta contradições antes do evento, por exemplo:
  - O credenciamento de suplentes termina depois da votação.
  - A moção exige percentual da base, mas os delegados não têm base.
  - A programação diz 12h e o artigo diz 17h (caso real do 21º Congrenf).
- **Simulador.** Para qualquer regra numérica, a tela mostra o efeito com números. Exemplo: "com 120 credenciados, a moção precisa de 20 assinaturas, ou de 9 dos 10 delegados da base Macaé".
- **Versões e trava.** A configuração é livre até a aprovação do regimento. Depois disso, mudar exige registrar a deliberação da plenária, com motivo e responsável. Cada ato (voto, assinatura, credenciamento) guarda a versão das regras que valia no momento.
- **Leitura humana.** A configuração gera um resumo em linguagem clara ("Delegados têm voz e voto; observadores falam com autorização da mesa"), que pode ir para o caderno do participante e servir de base para a minuta do regimento.

## 3. Catálogo de ajustes

Formato de cada linha: **ajuste**, opções possíveis, padrão sugerido e exemplos reais.

**Cuidado com o excesso:** configuração demais também afasta. Os padrões são escolhidos para que um congresso comum funcione mudando poucos itens, e a tela abre resumida, com os ajustes avançados recolhidos. O teste é a régua de utilidade da seção 3.1 do plano.

### 3.1 Identidade e lugar no processo

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Modo | Promove · Participa | Promove | Resende reserva vagas a sindicatos: o sindicato **participa** |
| Abrangência | Local · Municipal · Regional · Estadual · Nacional · Internacional | Regional | |
| Natureza | Congresso · Plenária · Conferência · Encontro · Seminário deliberativo | Congresso | |
| Evento vinculado | Evento do módulo Eventos | Obrigatório | Decisão 1 |
| Etapa anterior | Nenhuma · Uma ou mais etapas (do Confluir ou externas) | Nenhuma | Concut: assembleias de base → estaduais → nacional |
| Etapa seguinte | Nenhuma · Evento de destino | Nenhuma | Congrenf → Plenafup ou Confup |
| Edição e tema | Número, título, eixos | — | "Energia, Democracia e Futuro" |
| Quem organiza | Comissão organizadora (pessoas e funções) | Diretoria | Resende nomeia secretárias de credenciamento, relatores, tesoureira |

### 3.2 Regimento e casos omissos

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Aprovação | Aprovado antes por outro órgão · Aprovado na abertura pela plenária | Na abertura | Resende: Conselho aprova antes; Congrenf e CNC: plenária |
| Trava após aprovação | Trava · Pode mudar com deliberação | Trava | Congrenf art. 16 |
| Quórum para mudar | Maioria simples · Absoluta · 2/3 | Simples | |
| Cláusula de assinatura eletrônica | Incluir · Não incluir | Incluir | Necessária para moção digital |
| Casos omissos | Cadeia de quem decide: mesa → comissão → direção → plenária | Mesa, com recurso à plenária | Concut: coordenação → executiva → plenário; Resende: comissão com recurso |
| Tempo esgotado | Plenária decide o que fica sem apreciar · Remete à direção · Remete à próxima instância | Plenária decide | Concut art. 34 |

### 3.3 Papéis e direitos

Cada congresso tem sua **lista de papéis** (nome, cor do crachá, ordem). Para cada papel, uma **matriz de direitos**:

| Direito | Valores possíveis | Exemplos |
|---|---|---|
| Voz na plenária | Livre com inscrição · Só com autorização da mesa · Não | Congrenf: convidados e observadores falam; Concut: só com autorização; CNC: observador não fala |
| Voz no grupo | Idem | |
| Voto na plenária | Sim · Não · Só ao substituir titular | Resende: suplente vota na ausência do titular |
| Voto no grupo | Idem | |
| Propor (no grupo, em plenária) | Sim · Não | |
| Pedir destaque | Sim · Não | |
| Questão de ordem, esclarecimento, encaminhamento | Sim · Não | |
| Declaração de voto | Sim · Não | |
| Assinar moção | Sim · Não | Congrenf: só delegados |
| Candidatar-se (delegação, direção) | Sim · Não | Concut: só delegado credenciado |
| Votar em eleição | Sim · Não | |
| Acesso à plenária | Sim · Não · Área reservada | Concut: só credenciado com crachá |
| Entra no quórum | Sim · Não | |
| Entra no denominador dos percentuais | Sim · Não | Define o que é "10% dos delegados" |

Papéis do modelo: delegado eleito, delegado indicado, delegado nato, suplente, observador, convidado, expositor, assessor, imprensa, equipe, comissão organizadora.

### 3.4 Como se forma a delegação

Uma ou mais **regras de vaga**, cada uma com papel, forma e limite.

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Forma de definir delegado | Ordem de inscrição · Indicação da entidade · Eleição em assembleia de base · Eleição entre pares no evento · Inscrição livre (todo inscrito é delegado) | Ordem de inscrição | Congrenf: ordem; Resende: indicação; Concut: assembleia; Joinville: todo inscrito |
| Cálculo de vagas | Número fixo · Por categoria de entidade · Por sócios (base + 1 a cada N) · Por segmento | Número fixo | FUP: 16 + 1 a cada 360; Concut: 1 a cada 1.500; Resende: 1 ou 2 por categoria |
| Regra da fração | Despreza · Arredonda para cima · Conta se passar de 50% | Despreza | Concut: "fração de 50% mais um" |
| Base de cálculo | Sócios · Sócios quites · Trabalhadores da base | Sócios quites | |
| Data de corte da base | Data | Convocação | |
| Limite por unidade | Por base, plataforma, entidade, segmento, ramo | Sem limite | Congrenf: limites estatutários por base |
| Lista de espera | Sim · Não | Sim, na ordem de inscrição | |
| Dupla representação | Proibida · Permitida | Proibida | Concut: vedada no mesmo ramo |
| Indicação exige documento | Nenhum · Ficha assinada pelo representante legal · Ata de eleição | Nenhum | Resende: ficha assinada; Concut: ata da assembleia |
| Natos | Nenhum · Lista de origem: diretoria, executiva, conselho, lista manual | Nenhum | Congrenf: diretores; Resende: conselheiros; Concut: executiva |
| Natos incluem suplentes da origem | Sim · Não | Não | Resende: titulares e suplentes do Conselho |
| Suplentes por titular | 0 · 1 · N · Lista ordenada da entidade | 1 | FUP: lista em ordem decrescente |
| Vagas de observador | Livre · Número fixo · % da delegação | Livre | Concut: 10% da delegação de cada estadual |
| Convidados | Livre · Definidos pela direção | Definidos pela direção | |

### 3.5 Cotas e paridade

Uma ou mais **regras de cota**:

| Ajuste | Opções | Exemplos |
|---|---|---|
| Dimensão | Gênero · Segmento · Raça e cor · Idade · Base · Livre | |
| Tipo | Mínimo percentual · Mínimo absoluto · Proporção fixa | CUT: 30% de gênero; Sindipetro-ES: 2 mulheres em 8; Saúde: 50/25/25 |
| Arredondamento | Para cima · Para baixo · Regra própria | CUT tem regra própria |
| Exceção | Ex.: categoria com menos de X% de um gênero | CUT: abaixo de 20% |
| Onde vale | Delegação · Grupos · Chapas · Direção eleita · Mesa | Saúde: também nos grupos; Concut: direção |
| Efeito | Bloqueia · Alerta | Alerta |

### 3.6 Elegibilidade

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Filiação exigida | Não · Filiado · Filiado em dia · Filiado há X meses | Filiado em dia | |
| Entidade em dia | Não · Sim | Não | Concut: entidade quite |
| Taxa de inscrição | Nenhuma · Por pessoa · Rateio por entidade | Nenhuma | Concut: taxa rateio é condição |
| Quem paga despesas | Promotora · Cada entidade · Rateio | Promotora | Congrenf: Sindipetro-NF paga tudo |
| Documento no credenciamento | Nenhum · Com foto | Com foto | Concut |
| Exceções | Permitidas com decisão da comissão · Não | Permitidas | Sindipetro-ES: demitido *sub judice* |
| Recurso | Comissão de verificação de poderes · Mesa · Não há | Mesa | |
| Efeito das conferências | Bloqueia · Alerta e a comissão decide | Alerta | |

### 3.7 Inscrição

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Janela | Abre e fecha, por papel | — | Resende: 22/06 a 01/07; Concut: até 30 dias antes |
| Canais | Link público · Entidade indica · Secretaria lança · Planilha · IA lê ata · No ato do evento | Link público e secretaria | Resende: observadores no ato |
| Aprovação | Automática · Pela comissão | Pela comissão | |
| Dados pedidos | Acessibilidade · Alimentação · Hospedagem · Transporte · Crianças e creche · Nome social · Camiseta | Acessibilidade e nome social | Concut: creche de 1 a 6 anos com ficha antecipada |
| Confirmação | E-mail · Telegram · Link pessoal | Link pessoal | Decisão 5 |

### 3.8 Credenciamento

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Janelas | Por dia, horário e papel | Uma janela | Congrenf: titular até 17h do 1º dia, suplente até 12h do 2º; Concut: 4 janelas |
| Credenciamento antecipado | Não · Sim, até data | Não | CUT: sistema próprio antes |
| Depois do prazo | Bloqueia sem exceção · Permite com justificativa | Bloqueia | Concut: "nenhuma possibilidade" |
| Suplente assume | Só no lugar de titular ausente · Na ordem da lista · Livremente | No lugar de titular ausente | |
| Autorização da troca | Ninguém · Coordenação da delegação · Comissão | Coordenação da delegação | Concut: autorização escrita; CNC: coordenação |
| Titular pode voltar | Sim · Não | Não | |
| Crachá | Campos, cor por papel, QR, cartão de votação separado | Cor por papel e QR | |
| Segunda via | Proibida · Permitida, invalidando a anterior | Permitida | Concut: proibida |
| Participação remota | Não · Híbrida com direitos iguais · Remota só com voz | Não | XIX Confup: híbrido com direitos iguais |

### 3.9 Presença e quórum

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Registrar presença por sessão | Sim · Não | Sim | |
| Métodos | QR na porta · QR na sala · Chamada · Virtual | QR na porta | |
| Registrar saída | Sim · Não | Não | |
| Votar exige presença registrada | Sim · Não | Não | |
| Quórum de instalação | Não há · % de credenciados ou inscritos | Não há | |
| Quórum de votação | Não há · % por tipo de matéria | Não há | |
| Sem quórum | Suspende · Segue com aviso | Suspende | |
| Frequência mínima para certificado | 0% a 100% | 75% | |

### 3.10 Programa e grupos

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Tipos de sessão | Plenária · Mesa de debate · Grupo · Setorial · Atividade conjunta · Cultural | Todos disponíveis | Congrenf: "Plano de luta"; Concut: mesas de debate e de votação |
| Há grupos | Sim · Não | Sim | Concut: não há |
| Grupo por eixo | Um grupo por eixo · Vários por eixo · Livre | Um por eixo | |
| Como se entra no grupo | Indicação · Escolha com vagas · Sem inscrição (a presença define) | Escolha com vagas | Resende: escolha, 40 vagas; Confup: indicação |
| Vagas por grupo | Sem limite · Número | Sem limite | |
| Mais de um grupo | Permite · Proíbe | Proíbe | XIV Confup: observador em um só |
| Troca de grupo | Permite até data · Proíbe | Proíbe | |
| Grupos simultâneos | Sim · Não | Sim | |
| Funções no grupo | Coordenação · Relatoria · Relatoria adjunta | Coordenação e relatoria | |
| Como se escolhem | Eleitas no grupo · Indicadas pela comissão | Eleitas no grupo | Resende: relator eleito no início |

### 3.11 Propostas e textos

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Origens aceitas | Caderno de teses · Etapas anteriores · Documento externo · Novas no grupo · Novas em plenária | Novas no grupo | Concut: Encontro de Mulheres como fonte |
| Mínimo para vir de etapa anterior | % de aprovação na origem | — | Concut: 20% em um estadual |
| Propostas novas no grupo | Proibidas · Até N por grupo · Livres | Livres | Saúde/SC: proibidas; CNC: até 2 |
| Propostas novas em plenária | Proibidas · Com % de assinaturas · Com aceite da mesa · Acordo de texto | Acordo de texto | Concut: 20% ou pertinência; Congrenf: só matéria das mesas |
| Tipos de emenda | Aditiva · Supressiva · Modificativa · Aglutinativa · Substitutiva | Todos | |
| Abrangência | Local · Municipal · Estadual · Nacional · Lista própria | Lista própria | |
| Cota de saída por grupo | Total · Por eixo · Por abrangência | Sem limite | Resende: 20, 5 por eixo, 3 estaduais e 2 nacionais |
| Trava do relatório do grupo | Horário · Ao entregar | Horário | Resende: 13h, sem alteração depois; Fiocruz |
| Tema só de debate | Vai à votação · Só aos anais | Vai à votação | Concut: conjuntura e balanço só aos anais |

### 3.12 Apreciação nos grupos

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Há votação no grupo | Sim · Não (só apontamentos) | Não | Congrenf: não há |
| Quem vota | Pela matriz de papéis | — | |
| Regras de classificação | Lista ordenada de regras do tipo "se X, então Y" | Maioria simples aprova | Ver exemplos abaixo |

Regras do catálogo, combináveis:

- **Aprovada direto** com ≥ X% no grupo (Saúde/SC: 70%).
- **Vai à plenária** com maioria em mais de um grupo (Saúde/SC) ou em ao menos metade dos grupos (Fiocruz: 2/3 em metade).
- **Vencida sobe junto** com mais de X% (Plenafup: 1/3).
- **Votação em bloco** com mais de X% (Plenafup: 2/3).
- **Sem emenda segue aprovada** (CNC).
- **As N mais votadas por eixo sobem** (CNC: 5).
- **Rejeitada** abaixo do limite.

### 3.13 Consolidação e IA

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Quem consolida | Relator geral · Comissão de relatoria · Relatores dos grupos juntos | Comissão de relatoria | Congrenf: relator; Resende: relatores dos grupos |
| Prazo | Horário | — | Congrenf: noite do 2º dia |
| Consenso e debate | Classifica cada item como consenso (vai em bloco) ou debate | Classifica | Concut art. 24 |
| Funções de IA ligadas | Refino · Mesclagem · Readequação de assunto · Correlação · Abrangência · Fora de competência · Memória · Síntese · Triagem de moção · Leitura de documentos | Todas, exceto triagem | Cada uma liga ou desliga |
| IA vê autoria | Nunca | Nunca | Regra fixa, não configurável |

### 3.14 Plenária

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Mesa | Indicada · Eleita · Indicada e referendada; composição e funções | Indicada e referendada | Congrenf: indicada; Concut: referendada |
| Matéria admitida | Só a dos grupos · Também propostas novas | Só a dos grupos | Congrenf art. 9º |
| Tempo de fala | Minutos | 3 | |
| Encerramento das inscrições | Após N oradores · Pela mesa | Após 3 | Congrenf |
| Contraditório | Um a favor e um contra · Livre · Com réplica e tréplica a critério da plenária | Um a favor e um contra | Concut, Resende |
| Questões de ordem, esclarecimento, encaminhamento | Quais existem, tempo, proibidas durante a votação | Todas, 1 min, proibidas na votação | |
| Declaração de voto | Quem, quando, máximo, tempo, só para abstenção, vedada a quem defendeu | Só abstenção, 1 min, até 2 | Congrenf; Concut |
| Destaque | Com nome de quem pede · Prazo para pedir | Com nome | Resende |
| Aprovação sem oposição | Sim · Não | Sim | Concut art. 26 |
| Votação em bloco | Sim · Não | Sim | |
| Maioria por tipo de matéria | Simples dos presentes votantes · Absoluta dos credenciados · 2/3 | Simples; 2/3 para estatuto | |
| Empate | Mesa decide · Nova votação · Rejeita | Nova votação | |
| Forma de votar | Crachá · Contagem · Secreta em urna · Eletrônica (futuro) | Crachá | Decisão 3 |
| Na dúvida | Repete · Conta · Repete e depois conta | Repete e depois conta | Concut |

### 3.15 Moções

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Tipos | Apoio · Aplauso · Repúdio · Recomendação · Solidariedade · Lista própria | Todos | |
| Abrangência aceita | Qualquer · Só nacional · Lista | Qualquer | Concut: só nacional |
| Como se habilita | Assinaturas · Voto no grupo · Aprovação na etapa anterior · Aceite da comissão (combináveis com "ou") | Assinaturas | Resende: voto no grupo; Concut: assinaturas ou etapa anterior |
| Limiar de assinaturas | Número · % do congresso · % da base de origem; combináveis com "ou" e "e" | 10% | Congrenf: 90% da base **ou** 20; Plenafup: 10%; CNC: 50 |
| Denominador | Inscritos · Credenciados · Presentes | Credenciados | |
| Momento do cálculo | No protocolo · No prazo final | No protocolo | |
| Prazo de entrega | Data e hora | — | Congrenf: 9h do último dia; Concut: 14h do 4º dia |
| Meio de assinatura | Eletrônico · Papel · Ambos | Ambos | |
| Retirar assinatura | Até o protocolo · Não | Até o protocolo | |
| Nomes visíveis para | Comissão · Credenciados · Público | Credenciados | Decisão 4 |
| Leitura | Pela mesa · Por quem propõe | Pela mesa | |
| Defesa | Tempo, contraditório | 3 min | |
| Conteúdo vedado | Lista (discurso de ódio etc.) | Discurso de ódio | CNC |
| Encaminhamento | Ofício ao destinatário · Publicação | Ofício | |

### 3.16 Eleições

Um congresso pode ter várias eleições (delegação, direção, conselho fiscal, mesa). Para cada uma:

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| O que se elege | Delegação para a etapa seguinte · Direção · Conselho fiscal · Outro | — | |
| Vagas | Número total · Por base · Por segmento | — | Congrenf: chapa de 18; Resende: 4/2/2 + 1 convidado |
| Forma de candidatura | Chapa · Individual · Por segmento entre pares | Chapa | Resende: entre pares |
| Inscrição de chapa | Janela de horário; tamanho exato ou mínimo | — | Congrenf: 12h às 12h15; Concut: 10h às 12h |
| Defesa | Tempo para chapa única e para concorrentes | 15 min (única) ou 5 + 10 | Concut |
| Chapa única | Votação normal · Aclamação com autorização da plenária | Aclamação com autorização | Concut |
| Forma de voto | Crachá · Secreto em urna com cédula · Eletrônico (futuro) | Crachá | Concut: urna se houver disputa |
| Urnas | Coordenador por urna · Fiscal por chapa · Exige documento | — | Concut |
| Apuração | Majoritária (vencedora leva tudo) · Proporcional (maior resto ou D'Hondt; cláusula de barreira) · Por segmento | Majoritária | Congrenf: majoritária; Concut: proporcional com paridade |
| Paridade na composição | Regra de cota aplicada ao resultado | — | Concut art. 31 |
| Suplentes | Número, como se definem | — | Congrenf: definido depois, conforme a FUP |
| Posse | Imediata · Em data | Imediata | Concut |
| Plenária pode alterar o resultado | Sim · Não | Não | Congrenf art. 15 |

### 3.17 Divulgação e privacidade

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Público | Resoluções · Moções · Lista de delegados · Relatório final · Anais | Resoluções e moções | |
| Reservado | Quem marca uma resolução como reservada | Plenária | Congrenf art. 19: estratégias de luta |
| Telão | Programa · Fala atual · Quórum · Votação · Resultado | Programa e fala | |
| Transmissão | Por sessão: aberta · Interna | Aberturas e mesas abertas | |
| Lista de participantes no portal | Sim · Não | Não | |

### 3.18 Encerramento

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Certificado | Todos · A pedido · Com frequência mínima; mostra a condição | Todos, com condição | Resende: a pedido, por e-mail; Saúde/SC: condição |
| Relatório final | Prazo · Quem aprova | 60 dias | CNC |
| Envio à etapa seguinte | O que vai: propostas aprovadas, moções, delegação | Tudo o que foi aprovado | |
| Acompanhamento de resoluções | Sim · Não; responsável e prazo por resolução | Sim | |
| Destino das resoluções | Pauta de negociação · Plano de lutas (Tarefas) · Ofício | Conforme o tipo | Congrenf: pauta do ACT |
| Pesquisa de avaliação | Sim · Não | Sim | |

### 3.19 Local da decisão

Desenho completo na seção 6.7 do plano.

| Ajuste | Opções | Padrão | Exemplos |
|---|---|---|---|
| Formato do evento | Presencial · Virtual · Híbrido | Presencial | Plenafup 2021: virtual; XIX Confup: híbrido |
| Modalidade por tipo de ato | Só no local · No local ou a distância · A distância só para autorizados · Só a distância | Só no local | Eleição de direção só no local; debate aberto a distância |
| Quem pode ficar a distância | Todos · Por papel · Lista aprovada · Com justificativa aprovada | Com justificativa aprovada | |
| Modalidade da pessoa | Pelo evento inteiro · Por dia · Por sessão | Por dia | |
| Nível mínimo de prova para atos no local | A (credenciado) · B (presente na sessão) · C (código da sala) · D (estação da mesa) · E (físico) | B para voto; C para assinatura de moção | |
| Validade do código da sala | 10 a 60 segundos | 20 segundos | |
| Sinais extras | Rede do evento · Geolocalização (só alerta) | Nenhum | |
| Quem a distância conta no quórum | Sim · Não, por tipo de matéria | Sim | |
| Resultado separado por canal | Sim · Não | Sim | |

## 4. Como guardar (desenho técnico)

- **Configuração versionada:** `congresso_config_versoes` com um jsonb validado por um esquema tipado (zod) que cobre todo o catálogo. Cada versão tem autor, motivo, data e, depois da trava, a deliberação que a autorizou.
- **O que precisa de relação vira tabela:** papéis e matriz de direitos, regras de vaga, cotas e eleições ficam em tabelas próprias, porque se ligam a pessoas e resultados.
- **Regras como funções puras:** limiar de moção, cotas, arredondamento, coeficiente de delegados, classificação nos grupos e apuração proporcional. Cada uma recebe a configuração e os números e devolve o resultado com a explicação. Todas com testes em `npm run test:unidade`, usando os casos reais deste catálogo.
- **A mesma função serve o simulador e o evento,** o que garante que a prévia mostra o que vai acontecer.
- **Origem por ajuste:** cada valor guarda se veio do modelo, da edição anterior, do regimento (com artigo) ou de decisão da comissão.
- **Esquema inteiro já na Fase 1;** as telas de cada seção chegam com a fase que as usa.

## 5. O que muda nas fases

| Fase | Seções da configuração |
|---|---|
| 1. Base | 3.1 a 3.7, 3.10, modelos, cópia da edição anterior, conferência de consistência |
| 2. Credenciamento | 3.8, 3.9, 3.19 (modalidade da pessoa, níveis A, B e D, código da sala) |
| 3. Grupos e relatoria | 3.11, 3.12, 3.13 (sem IA), 3.14 |
| 4. Moções | 3.15, simulador de limiar |
| 5. IA | Funções de 3.13; leitura do regimento que preenche a configuração |
| 6. Encerramento | 3.17, 3.18, eleição de delegação (parte de 3.16) |
| 7. Votação ao vivo | Forma eletrônica em 3.14 e 3.16; votação híbrida (salão + distância) de 3.19 |
| 8. Cadeia e delegação | Restante de 3.4, 3.16 e as etapas de 3.1 |

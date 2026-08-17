
<div align="center">

# 🎲 LUDUS — Sistema de Aluguel de Jogos de Tabuleiro

**Instituto Federal de Educação, Ciência e Tecnologia do Maranhão — Campus Timon**

![Versão](https://img.shields.io/badge/versão-1.0.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow?style=for-the-badge)
![Licença](https://img.shields.io/badge/licença-MIT-green?style=for-the-badge)
![IFMA](https://img.shields.io/badge/IFMA-Campus%20Timon-3A3AB0?style=for-the-badge)

> Sistema acadêmico de aluguel de jogos de tabuleiro com app mobile
> multiplataforma e interface web administrativa, desenvolvido para o
> Projeto de Ensino Ludus do IFMA Campus Timon.

[📱 App Mobile](#-aplicativo-mobile) •
[💻 Web Admin](#-interface-web-administrativa) •
[📋 Requisitos](#-requisitos-do-sistema) •
[🚀 Instalação](#-instalação-e-execução) •
[🗂️ Rotas](#️-mapeamento-de-rotas) •
[🏆 Temporadas](#-sistema-de-temporadas) •
[🎮 Acervo](#-acervo-de-jogos)

</div>

---

## 📌 Sumário

- [Sobre o Projeto](#-sobre-o-projeto)
- [Integrantes](#-integrantes)
- [Funcionalidades](#-funcionalidades)
- [Requisitos Funcionais](#-requisitos-funcionais)
- [Requisitos Não Funcionais](#-requisitos-não-funcionais)
- [Requisitos Estendidos](#-requisitos-estendidos-evoluções-do-sistema)
- [Arquitetura do Sistema](#-arquitetura-do-sistema)
- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Mapeamento de Rotas](#️-mapeamento-de-rotas)
- [Acervo de Jogos](#-acervo-de-jogos)
- [Sistema de Categorias](#-sistema-de-categorias)
- [Sistema de Temporadas](#-sistema-de-temporadas)
- [Sistema de Cupons](#-sistema-de-cupons)
- [Guia de Mecânicas](#-guia-de-mecânicas)
- [Design System](#-design-system)
- [Instalação e Execução](#-instalação-e-execução)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Banco de Dados](#-banco-de-dados)
- [Casos de Uso](#-casos-de-uso)
- [Metodologia](#-metodologia)
- [Licença](#-licença)

---

## 📖 Sobre o Projeto

O **Ludus** é um sistema completo de aluguel de jogos de tabuleiro desenvolvido
para o Projeto de Ensino Ludus do IFMA Campus Timon. O projeto visa modernizar
e automatizar o processo de empréstimo de jogos, substituindo registros físicos
e planilhas manuais por uma plataforma digital integrada.

A solução é composta por duas interfaces complementares:

- **Aplicativo Mobile** (React Native + Expo): voltado aos usuários finais
  (discentes e servidores) para consulta ao catálogo, reservas e gamificação.
- **Interface Web Administrativa** (React): voltada aos gestores para controle
  do acervo, empréstimos, usuários e relatórios.

### Contexto Institucional

O Projeto de Ensino Ludus já era executado fisicamente na biblioteca do IFMA
Campus Timon, utilizando jogos de tabuleiro como ferramenta pedagógica para
promover ludicidade, inclusão cultural e desenvolvimento de habilidades
socioemocionais. Este sistema digitaliza e expande essa iniciativa.

---

## 👥 Integrantes

| Nome | Papel |
|------|-------|
| Joseni Daniel | Desenvolvedor |
| Hemyly Rayany | Desenvolvedora |
| Ramilson Rios | Desenvolvedor |
| Marcelo Loureiro | Desenvolvedor |
| Guilherme Raphael | Desenvolvedor |
| Hélio Victor | Desenvolvedor |
| **Nara Chaves** | **Orientadora** |

---

## ✨ Funcionalidades

### 📱 Aplicativo Mobile

| Módulo | Funcionalidades |
|--------|----------------|
| **Autenticação** | Login, cadastro, recuperar senha, login com Google OAuth |
| **Home** | Feed personalizado, ranking dos mais alugados, novidades do acervo, widget de temporada ativa com contagem regressiva |
| **Catálogo** | Busca em tempo real, filtros avançados (status, jogadores, idade, tempo, categoria, avaliação), visualização em cards |
| **Detalhe do Jogo** | Informações completas, avaliações com estrelas, mecânicas linkadas ao Guia, componentes, vídeo tutorial, reserva por horário |
| **Reserva por Horário** | Calendário mensal interativo, seleção de turnos (manhã 08h30–12h00 / tarde 12h30–16h00), múltiplos horários por reserva |
| **Favoritos** | Salvar jogos, lista de favoritos |
| **Meus Aluguéis** | Acompanhamento em andamento, histórico completo, status em tempo real |
| **Pagamento de Multa** | Cálculo automático, geração de QR Code Pix, comprovante |
| **Guia de Mecânicas** | 103 mecânicas catalogadas, tags linkando aos jogos do acervo, abas de níveis de usuário e de jogos |
| **Perfil** | Foto, nickname, dados pessoais, segurança, verificação de conta, meus cupons, meu progresso |
| **Verificação** | Upload de comprovante de matrícula, documento com foto, WhatsApp |
| **Cupons** | Visualização, QR Code de uso, histórico de utilizados |
| **Progresso de Nível** | Barra de progresso, critérios pendentes, calendário de recompensas por temporada |
| **Temporada** | Painel de acompanhamento, dias restantes, mini stats de progresso |
| **Chats** | Mensagens com administração |
| **Notificações** | Central de notificações, configurações por tipo |
| **Configurações** | Aparência, idioma, termos de uso, política de privacidade, sobre os desenvolvedores, sair |

### 💻 Interface Web Administrativa

| Módulo | Funcionalidades |
|--------|----------------|
| **Dashboard** | KPIs em tempo real, gráficos de uso, widget de temporada ativa, atividades recentes |
| **Acervo Digital** | Cadastrar, editar, classificar, inativar jogos; gerenciar exemplares com número de cópia, patrimônio e condição |
| **Empréstimos** | Aprovar reservas, registrar retirada, confirmar devolução, renovação, penalidades, histórico completo |
| **Gestão de Usuários** | Listar, cadastrar, editar, alterar categoria, bloquear/desbloquear usuários |
| **Cadastros Pendentes** | Analisar documentos, aprovar/rejeitar, notificar usuário |
| **Mecânicas** | Cadastrar, editar, vincular mecânicas aos jogos do acervo |
| **Cupons e Promoções** | Criar, editar cupons; configurar recompensas por nível e temporada; gerenciar lojas parceiras |
| **Temporadas** | Criar e gerenciar temporadas; definir requisitos e recompensas por nível; acompanhar progressão dos usuários; gerar cupons de temporada |
| **Multas** | Visualizar multas pendentes, gerar QR Code Pix, registrar pagamento |
| **Relatórios** | Jogos mais alugados, estatísticas de uso, evolução de empréstimos, controle de acesso por categoria |
| **Perfil Admin** | Dados pessoais, segurança, sessões ativas, configurações |

---

## 📋 Requisitos Funcionais

### Módulo do Usuário (Discente / Servidor)

| ID | Requisito |
|----|-----------|
| RF001 | **Manter Usuário** — O sistema deve permitir o cadastro, login (autenticação) e edição de perfil dos usuários. |
| RF002 | **Visualizar Catálogo** — O sistema deve apresentar a lista de jogos disponíveis com filtros por categoria, número de jogadores, idade e complexidade. |
| RF003 | **Visualizar Detalhes do Jogo** — O sistema deve exibir informações detalhadas do jogo (descrição, componentes, manual), importadas de bases externas (Ludopedia e BGG). |
| RF004 | **Realizar Reserva/Empréstimo** — O usuário deve conseguir solicitar a reserva de um jogo disponível para uma data e horário específicos, respeitando regras de categoria e disponibilidade. |
| RF005 | **Cancelar Reserva** — O usuário deve poder cancelar uma reserva pendente dentro de prazo estabelecido. |
| RF006 | **Visualizar Histórico** — O sistema deve permitir que o usuário consulte seu histórico de empréstimos com datas, títulos e status das devoluções. |
| RF007 | **Visualizar Ranking (Gamificação)** — O sistema deve exibir um ranking dos usuários com base em pontos acumulados por empréstimos e devoluções no prazo. |
| RF008 | **Receber Notificações** — O sistema deve notificar o usuário sobre confirmação de reservas, prazos de retirada e devolução e disponibilidade de jogos. |
| RF013 | **Cadastro com Status Pendente** — Ao finalizar o cadastro, o usuário deve ser criado com status "Aguardando Aprovação", sem acesso às funcionalidades até liberação pelo administrador. |
| RF014 | **Upload de Documentos** — No cadastro, o sistema deve exigir: (a) documento de identidade (RG ou CNH) e (b) comprovante de matrícula, em PDF, JPG ou PNG. |
| RF015 | **Notificação de Aprovação de Cadastro** — Após aprovação pelo administrador, o sistema deve enviar notificação ao usuário via WhatsApp ou serviço de mensageria. |
| RF016 | **Visualizar Categoria e Progresso** — O sistema deve permitir que o usuário visualize sua categoria atual, os jogos acessíveis e quantos empréstimos faltam para avançar. |

### Módulo de Classificação de Clientes e Jogos

| ID | Requisito |
|----|-----------|
| RF017 | **Classificar Jogos por Categoria** — O administrador deve poder classificar cada jogo em: Latão, Bronze, Prata, Ouro ou Diamante. |
| RF018 | **Classificar Clientes por Categoria** — O sistema deve atribuir a cada cliente uma categoria: Starter, Family, Expert ou Ultragamer. |
| RF019 | **Controle de Acesso por Categoria** — O sistema deve restringir o aluguel conforme a categoria do cliente: Starter (Latão e Bronze), Family (+Prata), Expert (+Ouro), Ultragamer (+Diamante). |
| RF020 | **Progressão Automática de Categoria** — O sistema deve atualizar automaticamente a categoria do cliente a cada dez jogos alugados, promovendo-o à categoria imediatamente superior. |

### Módulo Administrativo (Bibliotecário / Gestor)

| ID | Requisito |
|----|-----------|
| RF009 | **Manter Acervo** — O administrador deve poder cadastrar, editar, classificar por categoria e inativar jogos no sistema via interface web. |
| RF010 | **Gerenciar Empréstimos** — O administrador deve poder aprovar reservas, registrar retirada e confirmar devolução, incluindo controle de prazo, renovação e penalidades. |
| RF011 | **Gerenciar Usuários** — O administrador deve visualizar usuários, aprovar ou rejeitar cadastros, alterar categorias e bloquear usuários. |
| RF012 | **Gerar Relatórios** — O sistema deve emitir relatórios sobre jogos mais alugados, estatísticas de uso, evolução de empréstimos e indicadores de engajamento. |
| RF021 | **Aprovar/Rejeitar Cadastro** — O administrador deve ter interface para análise de dados cadastrais e documentos enviados, podendo aprovar ou rejeitar cadastros com registro de decisão. |

---

## 🔒 Requisitos Não Funcionais

### Usabilidade

| ID | Requisito |
|----|-----------|
| RNF001 | **Interface Intuitiva** — Interface amigável, responsiva e consistente, seguindo Material Design (Android) e Human Interface Guidelines (iOS). |
| RNF002 | **Facilidade de Aprendizado** — O fluxo de reserva/empréstimo não deve exigir mais de 3 toques a partir da tela inicial para um usuário autenticado. |

### Portabilidade e Compatibilidade

| ID | Requisito |
|----|-----------|
| RNF003 | **Multiplataforma** — Compatível com Android (versão 10+) e iOS (versão 15+). |
| RNF004 | **Tecnologia Híbrida** — Desenvolvimento com React Native + Expo para base de código unificada. |

### Confiabilidade e Disponibilidade

| ID | Requisito |
|----|-----------|
| RNF005 | **Disponibilidade** — Sistema disponível 99% do tempo durante horário letivo, com janelas de manutenção planejadas. |
| RNF006 | **Tratamento de Falhas em APIs Externas** — Caso Ludopedia ou BGG estejam indisponíveis, o sistema deve permitir cadastro manual sem interromper o funcionamento. |

### Segurança

| ID | Requisito |
|----|-----------|
| RNF007 | **Autenticação Segura** — Senhas armazenadas com hash criptográfico (bcrypt). Autenticação via JWT com refresh token. |
| RNF008 | **Privacidade de Dados Pessoais (LGPD)** — Em rankings e telas públicas, exibir apenas nickname, nunca nome completo, e-mail ou documento. |
| RNF011 | **Armazenamento Seguro de Documentos** — Documentos enviados pelos usuários armazenados em serviço seguro com acesso restrito a perfis administrativos. |
| RNF012 | **Confidencialidade de Documentos** — Arquivos de identificação não acessíveis por links públicos; acesso intermediado pelo sistema com verificação de permissão e log de auditoria. |

### Desempenho

| ID | Requisito |
|----|-----------|
| RNF009 | **Tempo de Resposta** — Carregamento do catálogo de jogos não deve exceder 3 segundos em conexão 4G padrão. |
| RNF010 | **Escalabilidade** — Banco de dados e arquitetura devem suportar crescimento do acervo e número de usuários sem degradação perceptível. |

### Integração e Comunicação

| ID | Requisito |
|----|-----------|
| RNF013 | **Integração com Mensageria** — Integração com WhatsApp Business API ou equivalente para notificações de aprovação de cadastro, confirmação de reservas e avisos de prazo. |

---

## 🆕 Requisitos Estendidos — Evoluções do Sistema

Funcionalidades desenvolvidas além do escopo original do documento de proposta:

### Módulo de Reserva por Horário

| ID | Requisito |
|----|-----------|
| RF-E01 | **Calendário de Reservas** — O sistema deve exibir calendário mensal interativo com disponibilidade de horários por dia. |
| RF-E02 | **Seleção de Turnos** — O usuário pode selecionar horários entre 08h30 e 16h00, em intervalos de 30 minutos, podendo escolher múltiplos horários contíguos. |
| RF-E03 | **Turno Manhã** — Slots disponíveis de 08h30 às 12h00. |
| RF-E04 | **Turno Tarde** — Slots disponíveis de 12h30 às 16h00. |
| RF-E05 | **Bloqueio de Horários** — Horários já reservados por outros usuários devem aparecer bloqueados e não clicáveis. |
| RF-E06 | **Resumo da Reserva** — Antes de confirmar, o sistema deve exibir resumo com jogo, data, horários selecionados e duração total. |

### Módulo de Temporadas

| ID | Requisito |
|----|-----------|
| RF-E07 | **Cadastro de Temporadas** — O administrador deve poder criar temporadas com nome, período (data início e fim), descrição, cores do banner e status. |
| RF-E08 | **Requisitos por Nível** — Cada temporada deve ter requisitos específicos para cada nível de usuário (Starter, Family, Expert, Ultragamer), incluindo mínimo de aluguéis, dias sem atraso, avaliações e ausência de multas. |
| RF-E09 | **Recompensas por Nível** — Cada nível de uma temporada deve ter recompensas configuradas: cupons gerados, badge exclusivo e acesso antecipado a novidades. |
| RF-E10 | **Quatro Temporadas Anuais** — O sistema deve suportar quatro temporadas por ano (S1: jan–mar, S2: abr–jun, S3: jul–set, S4: out–dez). |
| RF-E11 | **Painel de Temporada no Dashboard Web** — O dashboard deve exibir widget da temporada ativa com dias restantes, barra de progresso e métricas dos usuários. |
| RF-E12 | **Painel de Temporada no Home Mobile** — A tela inicial do app deve exibir card da temporada ativa com countdown, mini stats do usuário e link para tela de progresso. |
| RF-E13 | **Progressão por Temporada** — O sistema deve rastrear individualmente o progresso de cada usuário em cada temporada. |
| RF-E14 | **Urgência Visual** — O widget de temporada deve alterar a cor do contador de dias conforme urgência: verde (>60d), amarelo (30–60d), laranja (7–30d), vermelho (<7d). |

### Módulo de Cupons Estendido

| ID | Requisito |
|----|-----------|
| RF-E15 | **Gerar Cupons por Temporada** — Ao final de cada temporada, o sistema deve gerar automaticamente os cupons para os usuários que completaram os requisitos do seu nível. |
| RF-E16 | **Tipos de Cupom** — O sistema deve suportar cupons de percentual (%) e valor fixo (R$). |
| RF-E17 | **Cupons de Lojas Parceiras** — Cupons podem ser vinculados a lojas parceiras específicas. |
| RF-E18 | **Validade de Cupom** — Cada cupom deve ter data de validade configurável em dias a partir da emissão. |
| RF-E19 | **QR Code de Cupom** — Usuário deve poder exibir QR Code do cupom para uso em lojas parceiras. |
| RF-E20 | **Histórico de Cupons** — O sistema deve registrar todos os cupons utilizados com data, local e valor de desconto aplicado. |

### Módulo de Mecânicas

| ID | Requisito |
|----|-----------|
| RF-E21 | **Cadastro de Mecânicas** — O administrador deve poder cadastrar, editar e inativar mecânicas com nome em PT e EN, categoria temática, ícone, cor e descrição completa. |
| RF-E22 | **Vínculo Mecânica-Jogo** — O sistema deve permitir vincular mecânicas aos jogos do acervo, criando uma rede de referência cruzada. |
| RF-E23 | **Guia de Mecânicas no App** — O app deve exibir guia completo de 103 mecânicas em ordem alfabética, com cards acordeão e tags de jogos do acervo. |
| RF-E24 | **Link Mecânica → Jogo** — Ao tocar na tag de um jogo dentro de uma mecânica, o app deve navegar para a tela de detalhe daquele jogo. |
| RF-E25 | **Link Jogo → Mecânica** — Ao tocar em uma mecânica na aba "Mecânicas" do detalhe do jogo, o app deve navegar para o Guia com aquela mecânica destacada. |
| RF-E26 | **Abas do Guia** — O Guia deve conter três abas: Mecânicas, Níveis de Usuário e Níveis de Jogos. |

### Módulo de Verificação de Conta

| ID | Requisito |
|----|-----------|
| RF-E27 | **Comprovante de Matrícula** — O sistema deve exigir upload de comprovante de matrícula emitido há no máximo 3 meses. |
| RF-E28 | **Documento com Foto** — O sistema deve exigir upload de RG ou CNH legível e dentro da validade. |
| RF-E29 | **Verificação de WhatsApp** — O sistema deve coletar e verificar número de WhatsApp do usuário para comunicação. |
| RF-E30 | **Estados de Verificação** — O sistema deve exibir estados distintos: Não Verificado, Em Análise e Verificado, com visual diferenciado. |
| RF-E31 | **Análise Administrativa** — O administrador deve ter interface para revisar os documentos enviados e aprovar ou rejeitar com motivo registrado. |

### Módulo de Pagamento de Multa

| ID | Requisito |
|----|-----------|
| RF-E32 | **Cálculo de Multa** — O sistema deve calcular a multa por atraso automaticamente (valor por dia × dias de atraso). |
| RF-E33 | **QR Code Pix** — O sistema deve gerar QR Code Pix para pagamento de multa com validade de 24 horas. |
| RF-E34 | **Cópia de Código Pix** — O usuário deve poder copiar o código Pix para colar em seu aplicativo bancário. |
| RF-E35 | **Comprovante de Pagamento** — O usuário deve poder enviar comprovante de pagamento via upload diretamente pelo app. |
| RF-E36 | **Confirmação de Quitação** — O administrador deve poder marcar a multa como quitada e restaurar o acesso do usuário. |

### Módulo de Chat

| ID | Requisito |
|----|-----------|
| RF-E37 | **Mensagens** — O app deve disponibilizar módulo de chat para comunicação entre usuários e administração. |
| RF-E38 | **Busca no Chat** — O usuário deve poder buscar mensagens anteriores dentro de uma conversa. |
| RF-E39 | **Badge de Não Lidas** — A aba de chat deve exibir badge com a contagem de mensagens não lidas. |

---

## 🏗️ Arquitetura do Sistema


┌─────────────────────────────────────────────────────────────┐ │ LUDUS PLATFORM │ ├─────────────────┬───────────────────┬───────────────────────┤ │ Mobile App │ Web Admin │ Backend API │ │ React Native │ React.js │ Node.js + Express │ │ + Expo │ │ │ ├─────────────────┴───────────────────┼───────────────────────┤ │ HTTPS / REST API │ PostgreSQL │ │ JWT Authentication │ (Railway) │ ├─────────────────────────────────────┼───────────────────────┤ │ SERVIÇOS EXTERNOS │ Prisma ORM │ │ • Google OAuth 2.0 │ │ │ • Ludopedia API │ Cloudflare R2 │ │ • BGG API │ (Documentos) │ │ • WhatsApp Business API │ │ │ • SendGrid (E-mail) │ Redis (Cache) │ │ • Pix (QR Code) │ │ └─────────────────────────────────────┴───────────────────────┘

---

## 🛠️ Stack Tecnológica

### Mobile App

| Tecnologia | Versão | Finalidade |
|------------|--------|------------|
| React Native | 0.74+ | Framework mobile multiplataforma |
| Expo | SDK 51+ | Ferramental de desenvolvimento e build |
| React Navigation | v6 | Navegação entre telas |
| Zustand | 4.x | Gerenciamento de estado global |
| Axios | 1.x | Requisições HTTP |
| React Query | 5.x | Cache e sincronização de dados |
| date-fns | 3.x | Manipulação de datas |
| Expo Notifications | - | Push notifications |
| Expo Camera | - | Câmera para upload de documentos |
| Expo ImagePicker | - | Seleção de imagens da galeria |
| React Native Reanimated | 3.x | Animações fluidas |
| React Native Gesture Handler | 2.x | Gestos nativos |

### Web Admin

| Tecnologia | Versão | Finalidade |
|------------|--------|------------|
| React | 18.x | Framework frontend |
| React Router DOM | v6 | Roteamento SPA |
| Zustand | 4.x | Estado global |
| Axios | 1.x | Requisições HTTP |
| React Query | 5.x | Cache e sincronização |
| Recharts | 2.x | Gráficos e dashboards |
| React Hook Form | 7.x | Formulários |
| Zod | 3.x | Validação de schemas |
| date-fns | 3.x | Datas |
| QRCode.react | 3.x | Geração de QR Codes |

### Backend

| Tecnologia | Versão | Finalidade |
|------------|--------|------------|
| Node.js | 20 LTS | Runtime JavaScript |
| Express | 4.x | Framework HTTP |
| PostgreSQL | 16 | Banco de dados relacional |
| Prisma | 5.x | ORM |
| JWT | - | Autenticação |
| bcrypt | 5.x | Hash de senhas |
| Railway | - | Hospedagem do banco |
| Cloudflare R2 | - | Armazenamento de arquivos |
| Redis | 7.x | Cache e filas |
| Zod | 3.x | Validação de entrada |

### Integrações Externas

| Serviço | Finalidade |
|---------|------------|
| Google OAuth 2.0 | Autenticação social |
| Ludopedia API | Dados de jogos (descrição, imagem, mecânicas) |
| BoardGameGeek API | Dados complementares de jogos |
| WhatsApp Business API | Notificações de cadastro e empréstimos |
| SendGrid | Envio de e-mails transacionais |
| Pix (Banco Central) | Geração de QR Code para multas |

---

## 📁 Estrutura do Projeto


ludus/ ├── apps/ │ ├── mobile/ # React Native + Expo │ │ ├── src/ │ │ │ ├── components/ # Componentes reutilizáveis │ │ │ │ ├── common/ # Botões, inputs, cards, chips │ │ │ │ ├── home/ # TemporadaWidget, RankingCard │ │ │ │ ├── game/ # GameCard, GameTag, InfoPill │ │ │ │ ├── guia/ # MecanicaCard, GameTagAccordion │ │ │ │ └── profile/ # ProgressBar, CouponCard │ │ │ ├── screens/ # Telas do app │ │ │ │ ├── auth/ # Login, Registro, RecuperarSenha │ │ │ │ ├── home/ # Home, Novidades, Ranking │ │ │ │ ├── game/ # Busca, Filtro, Detalhe, ModalReserva │ │ │ │ ├── alugueis/ # MeusAlugueis, Detalhe, Pagamento │ │ │ │ ├── guia/ # Guia, NiveisUsuario, NiveisJogos │ │ │ │ ├── perfil/ # Perfil, Dados, Seguranca, Verificacao │ │ │ │ ├── cupons/ # MeusCupons, QrCodeCupom │ │ │ │ ├── temporada/ # ProgressoTemporada │ │ │ │ └── chat/ # Chats, ChatDetalhe │ │ │ ├── navigation/ # AppNavigator, stacks, tabs │ │ │ ├── hooks/ # useTemporada, useProgressao, useAuth │ │ │ ├── services/ # api.ts, auth.service.ts │ │ │ ├── store/ # Zustand stores │ │ │ ├── mocks/ # Dados mock para desenvolvimento │ │ │ ├── types/ # TypeScript interfaces │ │ │ └── utils/ # Helpers e formatadores │ │ ├── app.json │ │ └── package.json │ │ │ └── web/ # React + Vite │ ├── src/ │ │ ├── components/ # Componentes web │ │ │ ├── layout/ # Sidebar, Header, AdminLayout │ │ │ ├── dashboard/ # TemporadaWidget, KpiCard │ │ │ ├── acervo/ # TabelaJogos, ModalJogo │ │ │ ├── emprestimos/ # TabelaEmprestimos, Modais │ │ │ ├── usuarios/ # TabelaUsuarios, Modais │ │ │ ├── cupons/ # TabelaCupons, GerarCupom │ │ │ ├── temporadas/ # TabelaTemporadas, ProgressaoAdmin │ │ │ └── common/ # Botões, inputs, badges, modais │ │ ├── pages/ # Páginas do admin │ │ ├── routes/ # webRoutes.jsx │ │ ├── hooks/ # Hooks compartilhados │ │ ├── services/ # Chamadas à API │ │ ├── store/ # Estado global │ │ ├── mocks/ # mockData.ts completo │ │ └── types/ # TypeScript types │ └── package.json │ └── packages/ ├── api/ # Node.js + Express │ ├── src/ │ │ ├── controllers/ │ │ ├── routes/ │ │ ├── middleware/ │ │ ├── services/ │ │ └── utils/ │ └── prisma/ │ └── schema.prisma └── shared/ # Tipos e utilitários compartilhados

---

## 🗂️ Mapeamento de Rotas

### Web Admin (React Router v6)


/admin/login → LoginWebPage /admin/recuperar-senha → RecuperarSenhaWebPage /admin/dashboard → DashboardPage /admin/acervo → AcervoDigitalPage /admin/acervo/novo → NovoJogoPage /admin/acervo/:jogoId → DetalheJogoAdminPage /admin/acervo/:jogoId/editar → EditarJogoPage /admin/acervo/:jogoId/exemplar/novo → AdicionarExemplarPage /admin/acervo/:jogoId/exemplar/:id/editar → EditarExemplarPage /admin/emprestimos → EmprestimosPage /admin/emprestimos/:id → DetalheEmprestimoPage /admin/emprestimos/:id/devolucao → RegistrarDevolucaoPage /admin/usuarios → GestaoUsuariosPage /admin/usuarios/novo → NovoUsuarioPage /admin/usuarios/:id → DetalheUsuarioAdminPage /admin/usuarios/:id/editar → EditarUsuarioPage /admin/cadastros-pendentes → CadastrosPendentesPage /admin/cadastros-pendentes/:id/analisar → AnalisarCadastroPage /admin/mecanicas → MecanicasPage /admin/mecanicas/nova → NovaMecanicaPage /admin/mecanicas/:id/editar → EditarMecanicaPage /admin/cupons → CuponsPage /admin/cupons/novo → NovoCupomPage /admin/cupons/:id/editar → EditarCupomPage /admin/cupons/gerar → GerarCupomTemporadaPage /admin/cupons/lojas-parceiras → LojasParceirasPage /admin/cupons/recompensas-nivel → RecompensasNivelPage /admin/temporadas → TemporadasPage /admin/temporadas/nova → NovaTemporadaPage /admin/temporadas/:id → DetalheTemporadaPage /admin/temporadas/:id/editar → EditarTemporadaPage /admin/temporadas/:id/progressao → ProgressaoTemporadaPage /admin/multas → MultasPage /admin/multas/:id/qrcode → QrCodeMultaPage /admin/relatorios → RelatoriosPage /admin/perfil → PerfilAdminPage /admin/perfil/seguranca → SegurancaAdminPage /admin/perfil/configuracoes → ConfiguracoesAdminPage

### Mobile App (React Navigation v6)


── Auth Stack ├── Login ├── Registro └── RecuperarSenha

── Main (Bottom Tabs) ├── HomeTab (Stack) │ ├── Home │ ├── DetalheJogo │ ├── Busca │ ├── Filtro │ ├── Ranking │ ├── Novidades │ ├── Notificacoes │ ├── TemporadaDetalhes │ └── ModalReserva (modal) │ ├── FavoritosTab (Stack) │ ├── Favoritos │ └── DetalheJogo │ ├── AlugueisTab (Stack) │ ├── MeusAlugueis │ ├── DetalheAluguel │ ├── PagamentoMulta │ ├── QrCodePagamento │ └── HistoricoDetalhado │ ├── GuiaTab (Stack) │ ├── Guia (abas: Mecânicas | Níveis Usuário | Níveis Jogos) │ ├── DetalheMecanica │ ├── NiveisUsuario │ ├── NiveisJogos │ └── TemporadaGuia │ └── PerfilTab (Stack) ├── Perfil ├── EditarPerfil ├── FotoPerfil ├── DadosPessoais ├── Seguranca ├── Aparencia ├── Idioma ├── VerificacaoConta ├── MeusCupons ├── MeuProgresso ├── ProgressoTemporada ├── Notificacoes (config) ├── TermosUso ├── PoliticaPrivacidade └── SobreDesenvolvedores

---

## 🎮 Acervo de Jogos

Jogos atualmente disponíveis no acervo do Projeto Ludus — IFMA Campus Timon:

| Jogo | Jogadores | Categoria |
|------|-----------|-----------|
| 7 Wonders: Segunda Edição | 3–7 | Prata |
| Arquimedes | 2–5 | Bronze |
| Azul | 2–4 | Prata |
| Bang! Dice Game | 3–8 | Bronze |
| Barony | 2–4 | Prata |
| Bebê Diabo | 2–4 | Latão |
| BrainBox Pocket: Espaço | 2–6 | Latão |
| Cangaço | 2–4 | Bronze |
| Cartas a Vapor | 2–6 | Bronze |
| Catan: O Jogo | 3–4 | Prata |
| Conquest - Mystic Invasions | 2–4 | Ouro |
| Conselho | 2–4 | Bronze |
| Cores com Dicas | 3–10 | Latão |
| Coup | 2–10 | Bronze |
| Dixit | 3–6 | Prata |
| Duplo Risco | 2–8 | Latão |
| Enquadrados | 2–4 | Latão |
| Funocracy | 3–15 | Latão |
| Ímpar | 3–6 | Bronze |
| Jungo | 3–5 | Latão |
| Loira do Banheiro | 2–5 | Bronze |
| Me Enganei | 3–6 | Latão |
| Não Pode | 4–8 | Latão |
| Odin | 2–6 | Ouro |
| Passaporte Mundo | 1–6 | Bronze |
| Pitágoras | 2–6 | Bronze |
| Pool Party Stars | 3–6 | Latão |
| Quem Disse Isso? | 3–8 | Latão |
| Quem Foi? | 3–6 | Latão |
| Qwirkle | 2–4 | Prata |
| Revolução dos Bichos | 3–6 | Bronze |
| Set | 2–20 | Prata |
| Splendor: Marvel | 2–4 | Ouro |
| Superlemming | 2–5 | Bronze |
| Ticket to Ride: Trem Fantasma | 2–4 | Prata |
| Timeline: Twist | 2–6 | Latão |
| Toca Raul | 2–6 | Latão |
| Trio | 2–6 | Bronze |
| Uno | 2–10 | Latão |
| Véio do Saco | 2–5 | Latão |

---

## 🏅 Sistema de Categorias

### Categorias de Jogos

| Categoria | Cor | Acesso |
|-----------|-----|--------|
| 🥉 Latão | `#D4A853` | Starter+ |
| 🟤 Bronze | `#F97316` | Starter+ |
| ⬜ Prata | `#9CA3AF` | Family+ |
| 🟡 Ouro | `#EAB308` | Expert+ |
| 💎 Diamante | `#06B6D4` | Ultragamer |

### Categorias de Clientes

| Categoria | Cor | Acesso a Jogos | Progressão |
|-----------|-----|----------------|------------|
| 🌱 Starter | `#22C55E` | Latão e Bronze | Nível inicial |
| 🏠 Family | `#EAB308` | + Prata | 10 aluguéis |
| 🏅 Expert | `#7C3AED` | + Ouro | 20 aluguéis |
| 🏆 Ultragamer | `#3A3AB0` | + Diamante | 30 aluguéis |

---

## 🏆 Sistema de Temporadas

O Ludus opera com um sistema de temporadas trimestrais que incentiva o engajamento contínuo dos usuários através de metas, recompensas e cupons exclusivos.

### Temporadas 2026

| Temporada | Período | Status |
|-----------|---------|--------|
| S1 — 2026 | 01/01 – 31/03 | ✅ Encerrada |
| S2 — 2026 | 01/04 – 30/06 | 🟡 **Ativa** |
| S3 — 2026 | 01/07 – 30/09 | 🔜 Próxima |
| S4 — 2026 | 01/10 – 31/12 | 🔜 Próxima |

### Requisitos por Nível — Temporada S2 (Ativa)

| Requisito | Starter | Family | Expert | Ultragamer |
|-----------|---------|--------|--------|------------|
| Aluguéis mínimos | 3 | 8 | 12 | 20 |
| Dias sem atraso | 45 | 70 | 85 | 91 |
| Avaliações mínimas | 2 | 4 | 6 | 12 |
| Multas pendentes | 0 | 0 | 0 | 0 |

### Recompensas — Temporada S2

| Nível | Cupons | Badge | Acesso Antecipado |
|-------|--------|-------|-------------------|
| Starter | 1 cupom 12% OFF | ✅ | ❌ |
| Family | 2 cupons (18% + R$15) | ✅ | ❌ |
| Expert | 2 cupons (25% + R$25) | ✅ | ✅ |
| Ultragamer | 3 cupons (35% + R$40 + 60%) | ✅ | ✅ |

---

## 🎫 Sistema de Cupons

O sistema de cupons opera em dois eixos principais:

**1. Cupons de Temporada** — Gerados ao final de cada temporada para usuários que completaram os requisitos do seu nível.

**2. Cupons de Lojas Parceiras** — Parcerias com estabelecimentos locais que oferecem descontos aos usuários do Ludus.

### Tipos de Cupom

| Tipo | Descrição |
|------|-----------|
| `percentual` | Desconto em % sobre o valor total |
| `valor_fixo` | Desconto em R$ fixo |

### Atributos de um Cupom



Typescript
Copiar
interface Cupom {
  id: string
  codigo: string          // ex: LUDUS-S2-ULT-2026
  tipo: 'percentual' | 'valor_fixo'
  valor: number           // 30 (%) ou 40 (R$)
  descricao: string
  temporadaId?: string
  lojaParceiraId?: string
  usuarioId: string
  dataEmissao: Date
  dataExpiracao: Date
  utilizado: boolean
  dataUtilizacao?: Date
}




---

## 📚 Guia de Mecânicas

O app inclui um dicionário completo de **103 mecânicas de jogos de tabuleiro**, baseado na taxonomia da Ludopedia, com as seguintes funcionalidades:

- Busca em tempo real por nome (PT/EN)
- Filtro por índice alfabético (A a Z)
- Filtro por categoria temática
- Cards acordeão com definição detalhada
- Tags dos jogos do acervo que utilizam cada mecânica
- Link direto da tag para o detalhe do jogo
- Link da mecânica no detalhe do jogo para o Guia

### Categorias Temáticas

Estratégia, Cooperativo, Cartas, Dados, Econômico, Movimento, Memória, Guerra, Narrativo, Criativo, Lógica, RPG, Social, Habilidade, Mistério, Solo, Rotas, Simulação.

---

## 🎨 Design System

### Paleta de Cores



Css
Copiar
/* PRIMÁRIAS */
--ludus-purple-deep:    #3A3AB0;   /* Header mobile, botão primário */
--ludus-purple-dark:    #2D2D8C;   /* Sidebar web, variação escura */

/* DESTAQUE */
--ludus-yellow:         #F5B800;   /* Bottom nav ativo, tabs, estrelas */
--ludus-red:            #B91C1C;   /* Filtros, botão voltar Filter */
--ludus-green:          #22C55E;   /* Preços, sucesso, Starter */

/* FUNDOS */
--ludus-bg-main:        #F5F5F7;   /* Fundo geral de conteúdo */
--ludus-bg-card:        #FFFFFF;   /* Cards e inputs */
--ludus-bg-sage:        #5A7A6E;   /* Tela de foto de perfil */

/* TEXTO */
--ludus-text-primary:   #1A1A2E;
--ludus-text-secondary: #6B7280;
--ludus-text-white:     #FFFFFF;
--ludus-text-green:     #22C55E;

/* CATEGORIAS JOGOS */
--latao:    #D4A853;
--bronze:   #F97316;
--prata:    #9CA3AF;
--ouro:     #EAB308;
--diamante: #06B6D4;

/* CATEGORIAS USUÁRIOS */
--starter:    #22C55E;
--family:     #EAB308;
--expert:     #7C3AED;
--ultragamer: #3A3AB0;




### Tipografia


Família: Inter (primária) Fallback: SF Pro Display (iOS), Roboto (Android)

Escala: hero: 28px / Bold page-title: 24px / Bold section: 18px / Bold card-title: 16px / Bold button: 16px / SemiBold body: 14px / Regular label: 13px / Medium caption: 12px / Regular price: 16px / Bold / #22C55E

### Raios de Borda


Mobile: cards 16–24px | inputs 12–14px | badges 20–999px Web: cards 8–16px | inputs 10px | badges 6–20px

---

## 🚀 Instalação e Execução

### Pré-requisitos



Bash
Copiar
node >= 20.0.0
npm >= 10.0.0
postgresql >= 16




### Clonar o Repositório



Bash
Copiar
git clone https://github.com/ifma-timon/ludus.git
cd ludus
npm install




### Configurar o Backend



Bash
Copiar
cd packages/api
cp .env.example .env
# Preencha as variáveis de ambiente

npx prisma migrate dev
npx prisma db seed

npm run dev
# API rodando em http://localhost:3333




### Executar o Web Admin



Bash
Copiar
cd apps/web
cp .env.example .env.local

npm run dev
# Web Admin em http://localhost:5173




### Executar o App Mobile



Bash
Copiar
cd apps/mobile
cp .env.example .env

npx expo start

# Escaneie o QR Code com o Expo Go
# ou pressione A para Android / I para iOS




---

## 🔐 Variáveis de Ambiente

### Backend (`packages/api/.env`)



Env
Copiar
# Banco de Dados
DATABASE_URL="postgresql://user:password@host:5432/ludus"

# JWT
JWT_SECRET="sua-chave-secreta-aqui"
JWT_REFRESH_SECRET="sua-chave-refresh-aqui"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Google OAuth
GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="seu-client-secret"

# Armazenamento de Arquivos
CLOUDFLARE_R2_ENDPOINT="https://seu-endpoint.r2.cloudflarestorage.com"
CLOUDFLARE_R2_ACCESS_KEY="sua-access-key"
CLOUDFLARE_R2_SECRET_KEY="sua-secret-key"
CLOUDFLARE_R2_BUCKET="ludus-documentos"

# E-mail
SENDGRID_API_KEY="SG.sua-chave-sendgrid"
EMAIL_FROM="noreply@ludus.ifma.edu.br"

# WhatsApp
WHATSAPP_TOKEN="seu-token-whatsapp-business"
WHATSAPP_PHONE_ID="seu-phone-id"

# APIs Externas
LUDOPEDIA_API_KEY="sua-chave-ludopedia"

# Ambiente
NODE_ENV="development"
PORT=3333




### Web Admin (`apps/web/.env.local`)



Env
Copiar
VITE_API_URL="http://localhost:3333"
VITE_GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
VITE_USE_MOCK_DATA="true"




### Mobile (`apps/mobile/.env`)



Env
Copiar
EXPO_PUBLIC_API_URL="http://localhost:3333"
EXPO_PUBLIC_GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
EXPO_PUBLIC_USE_MOCK_DATA="true"




---

## 🗄️ Banco de Dados

### Principais Entidades


Usuario id, nome, sobrenome, nickname, email, senha (hash), cpf (criptografado), telefone, whatsapp, dataNascimento, cep, logradouro, numero, complemento, bairro, cidade, estado, fotoPerfil, categoriaUsuario, statusConta, statusVerificacao, role, createdAt, updatedAt

Jogo id, nome, descricao, fabricante, categoriaJogo, imagem, tempoMin, tempoMax, jogadoresMin, jogadoresMax, idadeMinima, complexidade, avaliacaoMedia, totalAvaliacoes, ludopediaId, bggId, ativo, createdAt, updatedAt

Exemplar id, jogoId, numeroCopia, codigoPatrimonio, condicaoFisica, disponivel, observacoes, createdAt, updatedAt

Emprestimo id, usuarioId, jogoId, exemplarId, dataRetirada, dataPrevistaDevolucao, dataEfetivaDevolucao, status, condicaoRetirada, condicaoDevolucao, penalidade, multaValor, multaStatus, observacoes, createdAt, updatedAt

Reserva id, usuarioId, jogoId, data, horaInicio, horaFim, status, createdAt, updatedAt

Mecanica id, nomePT, nomeEN, categoriaTag, corCategoria, icone, descricao, ativa, createdAt, updatedAt

JogoMecanica (relação N:N) jogoId, mecanicaId

Temporada id, nome, ano, numero, dataInicio, dataFim, status, descricao, requisitosJson, recompensasJson, bannerImagemUrl, bannerCorPrimaria, bannerCorSecundaria

ProgressaoUsuarioTemporada id, usuarioId, temporadaId, nivelAtual, nivelMeta, alugueisRealizados, diasSemAtraso, avaliacoesRealizadas, multasPendentes, percentualConcluido, cuponsGerados, dataUltimaAtualizacao

Cupom id, codigo, tipo, valor, descricao, temporadaId, lojaParceiraId, usuarioId, dataEmissao, dataExpiracao, utilizado, dataUtilizacao

LojaParceira id, nome, descricao, categoria, logoUrl, ativa

Documento id, usuarioId, tipo, arquivoUrl, status, motivoRejeicao, dataEnvio, dataAnalise, analisadoPorId

Notificacao id, usuarioId, tipo, titulo, descricao, lida, linkDestino, createdAt

Avaliacao id, usuarioId, jogoId, nota, comentario, createdAt

---

## 📊 Casos de Uso Principais

### CSU-01: Registrar Usuário


Ator Principal: Usuário (Discente / Servidor) Ator Secundário: Google API

Pré-condições: App instalado e internet ativa.

Fluxo Principal:

Usuário seleciona "Registrar Usuário"
Sistema solicita dados (Nome, Matrícula, E-mail)
Usuário preenche dados ou usa "Entrar com Google"
[Se Google] Sistema valida via OAuth 2.0
Sistema verifica duplicidade no banco de dados
Sistema cria conta com status "Aguardando Aprovação"
Sistema solicita upload de documentos obrigatórios
Sistema envia notificação ao administrador

Fluxo Alternativo [FA1] — E-mail já cadastrado: FA1.1. Sistema identifica e-mail duplicado FA1.2. Exibe mensagem "Usuário já cadastrado" FA1.3. Redireciona para recuperação de senha

Pós-condições: Conta criada aguardando aprovação administrativa.

### CSU-02: Alugar Jogo


Ator Principal: Usuário (Discente / Servidor)

Pré-condições: Conta ativa e verificada, usuário autenticado.

Fluxo Principal:

Usuário acessa catálogo de jogos
Aplica filtros desejados (opcional)
Seleciona jogo de interesse
Visualiza detalhes do jogo
Toca em "Alugar"
Sistema exibe calendário de disponibilidade
Usuário seleciona data e horários desejados
Sistema verifica disponibilidade e compatibilidade de categoria
Usuário confirma a reserva
Sistema registra reserva com status "Pendente"
Sistema notifica administrador sobre nova reserva
Administrador aprova → usuário recebe notificação

Fluxo Alternativo [FA1] — Usuário sem categoria adequada: FA1.1. Sistema identifica incompatibilidade de categoria FA1.2. Exibe mensagem com a categoria necessária FA1.3. Exibe tela de progressão de nível

Fluxo Alternativo [FA2] — Jogo indisponível no horário: FA2.1. Sistema exibe horários já ocupados em vermelho FA2.2. Usuário seleciona horários alternativos disponíveis

Pós-condições: Reserva registrada aguardando aprovação.

---

## 📐 Metodologia

O desenvolvimento segue a metodologia **Scrum** com sprints de 1–2 semanas:


Sprint Planning → Daily Standup → Sprint Review → Retrospectiva

### Papéis

| Papel | Responsabilidade |
|-------|-----------------|
| Product Owner | Nara Chaves (Orientadora) |
| Scrum Master | Ramilson Rios |
| Time de Dev | Joseni, Hemyly, Marcelo, Guilherme, Hélio |

### Fases do Projeto


Fase 1: Levantamento de Requisitos e Prototipagem (Figma) Fase 2: Setup da infraestrutura e autenticação Fase 3: Catálogo, reservas e gestão de empréstimos Fase 4: Gamificação (ranking, temporadas, cupons) Fase 5: Guia de mecânicas e integrações externas Fase 6: Testes com usuários reais do IFMA Timon Fase 7: Ajustes, otimizações e deploy

---

## 📄 Documentos e Conformidade

- **Termo de Compromisso de Aluguel**: Incluído no app durante o cadastro, com aceite obrigatório antes da primeira reserva.
- **Prazo de Aluguel**: Até 3 dias por jogo. Renovação sujeita a disponibilidade.
- **Multas**: Em caso de atraso, o usuário fica com acesso suspenso até regularização.
- **LGPD**: Dados sensíveis protegidos, documentos com acesso restrito, nicknames exibidos em rankings públicos.
- **Armazenamento**: Documentos armazenados em serviço seguro com acesso apenas a perfis administrativos autenticados.

---

## 📜 Licença

Este projeto foi desenvolvido para fins acadêmicos no âmbito do
**Instituto Federal de Educação, Ciência e Tecnologia do Maranhão — Campus Timon**.


IFMA Campus Timon — Projeto de Ensino Ludus Desenvolvido em 2025 | Timon, Maranhão, Brasil

---

<div align="center">

**🎲 Ludus — Construindo caminhos de ludicidade**

*IFMA Campus Timon · 2025*

</div>


Este README cobre integralmente o documento original mais todas as evoluções desenvolvidas ao longo do projeto, incluindo os 21 requisitos funcionais originais, os 13 requisitos não funcionais, os 36 requisitos estendidos, o mapeamento completo de rotas web e mobile, o acervo dos 40 jogos, o sistema de temporadas 2026, cupons, guia de mecânicas e o design system completo.

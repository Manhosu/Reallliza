# Atualização 01.06.2026 — Pedidos da Jessica (dump fiel)

> Este arquivo é o **dump fiel** dos pedidos da Jessica recebidos em 01/06/2026 (mensagem + PDF `atualização 01.06.2026 APP REALLLIZA (1).pdf` + screenshots de referência visual + transcrição de vídeo).  
> Serve como referência durante toda a implementação — **não contém planejamento**, só repete o que foi pedido.  
> Plano técnico associado: `C:\Users\delas\.claude\plans\clever-cooking-wind.md`.

---

## 1. Tela de Perfil mobile (referência visual: print "Desejado")

### 1.1 Cabeçalho

- Foto do colaborador (avatar circular)
- Nome completo
- E-mail/login
- **Função** (cargo: ex. "Técnico Instalador")
- **Nível** (Bronze / Prata / Ouro) com badge colorido
- **Score Geral** em destaque (número grande, ex.: `92`, com label de qualidade — ex.: "Excelente")

> O Score Geral é o destaque visual mais importante — representa o desempenho global.

### 1.2 Avaliações Gerais (3 cards lado a lado)

Toda OS executada gera 3 avaliações:

1. **Sistema** (automática pela plataforma):
   - Aceitação da OS
   - Pontualidade
   - Cumprimento dos prazos
   - Preenchimento correto da OS
   - Envio das fotos obrigatórias
   - Cumprimento do fluxo operacional
   - Finalização correta da OS
2. **Cliente** (após finalização da OS, cliente recebe link e avalia em estrelas + comentários — exibido como `4,8 ⭐` + "157 avaliações")
3. **Qualidade (Reallliza)** (avaliação interna pela Reallliza após conclusão, técnica — exibido como `4,6 ⭐` + "Avaliação Reallliza")

Esses três indicadores devem aparecer **sempre visíveis** no perfil.

### 1.3 Especialidades (lista com estrelas por item)

Lista vertical, cada item com nome + estrelas + nota decimal à direita:

- Rodapé — ⭐⭐⭐⭐⭐ — 5,0
- Painel de parede — ⭐⭐⭐⭐☆ — 4,0
- Forro — ⭐⭐⭐⭐⭐ — 5,0
- Piso vinílico colado — ⭐⭐⭐⭐☆ — 4,2
- Piso vinílico clicado — ⭐⭐⭐⭐⭐ — 4,9
- Acabamentos — ⭐⭐⭐⭐☆ — 4,3

> A média de cada especialidade deve ser calculada **apenas pelas OS em que aquela especialidade foi executada** (não inclui OS de outras especialidades).

### 1.4 Relacionamento com cliente

Card separado abaixo das especialidades:

- "Relacionamento com o cliente" — "Avaliado pelos clientes"
- Estrelas (ex.: ⭐⭐⭐⭐☆ 4,8)
- "157 avaliações recebidas"

### 1.5 Estatísticas

Cards horizontais com ícones:

- `157` OS Concluídas
- `3` OS em Andamento
- `1` OS Canceladas
- `98%` Pontualidade
- `2,1 dias` Tempo Médio

### 1.6 Dados pessoais

- Nome completo
- E-mail
- CPF (ex.: 123.456.789-01)
- Telefone (ex.: (83) 99189-5684)
- Endereço (ex.: Rua das Flores, 123 — Jardim Primavera, Campinas - SP, 13087-123)
- Botão "Alterar senha"

---

## 2. Regra de Retrabalho

Quando uma OS gera retrabalho confirmado:

1. **Reduz a nota daquela OS** (rebaixa a avaliação Sistema/Qualidade da OS original)
2. **Reduz o Score Geral** do técnico
3. **Reduz a nota da especialidade relacionada** ao problema

### Exemplo concreto

Uma OS contém:

- Piso Vinílico Clicado
- Rodapé

Se o retrabalho ocorrer apenas no Rodapé:

- Penaliza a especialidade **Rodapé** (somente)
- Penaliza o **Score Geral**
- **Não** penaliza Piso Vinílico Clicado

### Vinculação

- O retrabalho sempre fica **vinculado à OS original** que gerou o problema (parent → child).

### Objetivo das classificações (futuro)

Esses dados alimentarão:

- Classificação Bronze / Prata / Ouro
- Ranqueamento dos homologados
- Distribuição automática de OS
- Indicadores de desempenho
- Relatórios gerenciais
- Controle de qualidade dos serviços

---

## 3. Imagens do Local da OS (renomear para "Projetos")

- **Renomear** o card "Imagens do Local" → **"Projetos"**
- **Aceitar arquivo de imagem E PDF** (hoje só imagem)
- **Quem adiciona é o administrador** na plataforma web execução
- **No app móvel:** retirar os botões "Tirar foto" e "Galeria" — o técnico **só visualiza** as imagens/PDFs anexadas pelo administrador.

---

## 4. Ações da OS — Iniciar Deslocamento (bug)

- Quando o técnico clica em "Iniciar Deslocamento", **não está aparecendo a rota (mapa)**.
- **Antes aparecia**, agora não aparece mais.

---

## 5. Ações da OS — Sequência lógica

Seguir esta sequência (gate sequencial — cada etapa só libera após a anterior):

1. **Deslocamento** (Iniciar Deslocamento)
2. **Cheguei no Local**
3. **Executar todas as etapas de execução**
4. **Capturar Assinatura**
5. **Finalizar Serviço**

> As sequências devem ser **liberadas de acordo com a lógica** — o botão da próxima etapa só aparece (ou só fica habilitado) quando a anterior estiver concluída.

---

## 6. Menu Agenda (regras de criação)

Os eventos da agenda podem ser criados de duas formas:

1. **Manualmente** pelo administrador na plataforma web execução
2. **Automaticamente:**
   - Quando uma OS é **atribuída** a um técnico
   - Quando lança uma **proposta** para ele E ele **aceita** a proposta

> O sistema deve garantir que as duas formas fiquem **integradas e inteligentes** o suficiente para **não gerar conflito de datas e horários** para o mesmo técnico.

---

## 7. Menu Especialidades (sincronia com cadastro de usuário)

- A especialidade criada no menu "Especialidades" deve aparecer **automaticamente** no menu de cadastro de usuário.
- O administrador seleciona as especialidades do técnico nesse cadastro.

> Hoje as 6 especialidades estão hard-coded no form. Precisa virar dinâmico (lista vinda da tabela `specialties`).

---

## 8. Checklist (não carrega na OS)

- O **cadastro** de checklist (template) está funcionando.
- Mas ao **anexar o checklist na OS**:
  - Mostra que foi adicionado (ex.: "0,00%")
  - **Não permite visualizar os itens** do checklist
- Mesmo problema acontece no **app móvel**:
  - Tela abre mostrando "0/0 itens" e espaço vazio
  - Impossibilita técnico responder em campo

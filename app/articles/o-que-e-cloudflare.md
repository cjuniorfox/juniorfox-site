---
title: "O que é Cloudflare?"
articleId: "o-que-e-cloudflare"
date: "2024-09-24"
author: "Carlos Junior"
category: "Rede"
brief: "Como é amplamente conhecido, desde 29 de agosto de 2024, o X (anteriormente Twitter) foi bloqueado no Brasil. No entanto, os serviços do Twitter voltaram brevemente ao ar. Vamos explorar o porquê."
image: "/assets/images/what-is-cloudflare/twitter-cloudflare.webp"
keywords: ["twitter", "x", "cloudflare", "rede", "hospedagem", "túnel", "firewall"]
lang: "pt"
other-langs: [{"lang":"en","article":"what-is-cloudflare"}]
---

## Table of Contents

- [Para que serve o Cloudflare?](#para-que-serve-o-cloudflare)
- [Prós e Contras do Cloudflare](#prós-e-contras-do-cloudflare)
  - [Prós](#prós)
  - [Contras](#contras)
- [Uma Perspectiva Técnica](#uma-perspectiva-técnica)
- [Túnel de Rede Zero Trust do Cloudflare](#túnel-de-rede-zero-trust-do-cloudflare)
  - [Requisitos](#requisitos)
  - [Vinculando Seu Domínio ao Cloudflare](#vinculando-seu-domínio-ao-cloudflare)
  - [Instalando o Cloudflared](#instalando-o-cloudflared)
    - [1. Instalar a ferramenta Cloudflared](#1-instalar-a-ferramenta-cloudflared)
    - [2. Autenticar no Cloudflare](#2-autenticar-no-cloudflare)
    - [3. Criar um túnel](#3-criar-um-túnel)
    - [4. Criar nosso config.yml](#4-criar-nosso-configyml)
    - [5. Adicionar uma entrada DNS](#5-adicionar-uma-entrada-dns)
    - [6. Ingress](#6-ingress)
    - [7. Executando o túnel](#7-executando-o-túnel)
    - [8. Algo deu errado](#8-algo-deu-errado)
- [Conclusão](#conclusão)

Desde 29 de agosto de 2024, o X (anteriormente Twitter) foi bloqueado no Brasil por não cumprir ordens judiciais para remover perfis que violavam as leis brasileiras, especialmente durante o período eleitoral. No entanto, em 18 de setembro, o X voltou a ficar brevemente acessível. O motivo? Cloudflare. O debate jurídico em torno da legitimidade das ações do Twitter é uma questão sensível e complexa, que não explorarei mais a fundo neste artigo.

![Twitter e Cloudflare](/assets/images/what-is-cloudflare/twitter-cloudflare.webp)

Para a surpresa dos usuários brasileiros do Twitter, em [18 de setembro, o Twitter de repente voltou a ficar acessível no país](https://www.bbc.com/portuguese/articles/c5y3xy47jxzo). Legalmente, nada havia mudado. Então, como o Twitter retomou as operações no país?

A resposta? Cloudflare. O Twitter começou a operar por trás do Cloudflare, e logo depois, todos os veículos de notícias começaram a tentar explicar o que é o Cloudflare. É um escudo? Uma armadura que Elon Musk usou para proteger o Twitter do Supremo? O Cloudflare é uma solução à prova de falhas contra o bloqueio do STF? Como você provavelmente sabe, o Twitter saiu do ar novamente dois dias depois. Vamos nos aprofundar e ver como o Cloudflare funciona na prática.

## Para que serve o Cloudflare?

Em resumo, o Cloudflare atua como um intermediário entre o seu serviço online (como um site ou servidor de mídia) e a internet, oferecendo funcionalidades que reforçam a segurança e melhoram desempenho. Mas por que adicionar um intermediário?

Existem várias razões. A mais óbvia é que o Cloudflare oferece proteção ao bloquear ataques à sua infraestrutura, além de gerenciar conexões SSL e certificados para você, o que é muito conveniente.

Outra razão é que, por meio do túnel Zero Trust do Cloudflare, é possível tornar serviços por trás de uma rede privada (sem um endereço IP público válido na internet, como redes CGNAT) acessíveis na internet, como um servidor de mídia Jellyfin, um servidor de arquivos (NAS) em sua casa, sistemas de câmeras de vigilância ou até mesmo um armazenamento em nuvem privado como o Nextcloud.

![Macmini](/assets/images/what-is-cloudflare/macmini.webp)

Você pode até pensar que eu tenho uma grande infraestrutura com muitos funcionários ou que estou usando uma grande empresa para hospedar este site, mas não. Este site está, na verdade, hospedado neste velho Mac Mini de 2010. Pra te dizer a verdade, vários dos meus serviços estão rodando nessa pequena, mas confiável, máquina.

Como um servidor Linux conectado à internet 24 horas por dia, 7 dias por semana, ele se torna um alvo valioso para aqueles que querem cometer crimes online. Basta plantar algum script malicioso, e qualquer coisa pode acontecer. Desde alguém vigiando o que trafego online, até mineração de criptomoedas, a um proxy para atividades ilegais. Portanto, colocar algo entre este servidor e a internet aberta é uma ótima medida de segurança.

## Prós e Contras do Cloudflare

Vamos dar uma olhada mais de perto no Cloudflare para entender os benefícios e possíveis desvantagens de usar seus serviços.

### Prós

- É gratuito!
- Adiciona uma camada de segurança à sua rede, atuando como intermediário entre seu servidor e a internet.
- Gerencia certificados SSL para você.
- Fácil de usar e configurar.

### Contras

- Depende de um parceiro terceirizado e de sua infraestrutura.
- Abre a um terceiro acesso de sua rede, o que, se não for gerenciado adequadamente, pode permitir que o esse terceiro tenha visibilidade sobre o tráfego da sua rede.
- Embora as conexões entre seus clientes e o Cloudflare estejam protegidas, os dados dentro do túnel não são criptografados. Mesmo que você configure um servidor HTTPS, o Cloudflare descriptografará os dados e os recriptografará com o certificado deles. Isso significa que o Cloudflare pode ver todo o seu tráfego, incluindo informações sensíveis, como dados pessoais ou senhas. Tenha isso em mente, caso seu site lide com esse tipo de informação.

Sejamos honestos. O Cloudflare é uma empresa respeitável com grandes parceiros no mercado. Embora não haja casos conhecidos de espionagem por parte deles em relação aos seus clientes, é tecnicamente possível, se eles quisessem. Eles chamam sua solução de "zero trust" (não confie em ninguém em tradução livre), é importante ser cauteloso e não confiar em ninguém. Tenha isso em mente quando for trafegar informações sensíveis através da Cloudflare.

## Uma Perspectiva Técnica

Para entender como o Cloudflare funciona, vamos explorar suas principais funcionalidades, incluindo o [Túnel Zero Trust](https://www.cloudflare.com/products/tunnel/) assim como facilmente disponibilizar na internet um site hospedado em sua rede doméstica.

Como este blog aborda os aspectos técnicos desses assuntos, vamos olhar alguns dos serviços oferecidos pelo Cloudflare, seguir um guia passo a passo sobre como configurar um [Túnel Zero Trust do Cloudflare](https://www.cloudflare.com/products/tunnel/) e publicar um site com facilidade.

## Túnel de Rede Zero Trust do Cloudflare

Após o serviço de gerenciamento de DNS, um dos serviços mais importantes que o Cloudflare oferece é o **Túnel de Rede Zero Trust**. Este serviço nos permite facilmente expor serviços locais na internet. Neste exemplo, vou hospedar uma página simples e torná-la acessível online.

Este guia passo a passo é baseado no vídeo do YouTube de Raid Own: [Cloudflare Tunnel Setup Guide - Self-Hosting for EVERYONE](https://www.youtube.com/watch?v=hrwoKO7LMzk&t=649s). Recomendo assisti-lo.

![Diagrama da rede Cloudflare](/assets/images/what-is-cloudflare/cloudflare-diagram.webp)

### Requisitos

Usaremos uma ferramenta chamada **cloudflared**, que pode ser instalada em qualquer sistema operacional. Para este guia, usarei o Ubuntu Linux. Antes de começarmos, certifique-se de que você tenha:

- Criado uma conta no Cloudflare.
- Um domínio de internet (FQDN).
- Uma máquina Linux hospedando um site.

### Vinculando Seu Domínio ao Cloudflare

Depois de fazer login no Cloudflare, adicione seu domínio e configure os **domain names** no gerenciador de domínios. Este passo pode variar dependendo do seu provedor. No meu caso, estou usando **Hostgator**, e configurei o DNS assim:

![Configuração do Hostgator](/assets/images/what-is-cloudflare/fqdn-domain-setup.webp)

Pode levar algum tempo (até 24 horas) para que as configurações se propaguem e se tornem funcionais. Como já estou usando o Cloudflare, meu domínio já está ativado.

![Domínio Cloudflare](/assets/images/what-is-cloudflare/cloudflare-mainpage.webp)

### Instalando o Cloudflared

Criei uma máquina virtual, configurei-a para permitir conexões SSH, e agora estou acessando-a. Esta seção segue os passos descritos no [Guia de Introdução do Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/).

#### 1. Instalar a ferramenta Cloudflared

```bash
# 1. Adicione a chave de assinatura do pacote do Cloudflare:
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# 2. Adicione o repositório apt do Cloudflare aos seus repositórios apt:
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list

# 3. Atualize os repositórios e instale o cloudflared:
sudo apt-get update && sudo apt-get install cloudflared
```

#### 2. Autenticar no Cloudflare

Execute o comando abaixo.

```bash
cloudflared tunnel login
```

Você verá uma URL grande com uma string de autenticação como esta.

```bash
https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2FyO5QTw53edgtamTbyJb9TtlzHNnnDLNApcx3gSo%3D
```

Basta copiar e colar no seu navegador. Uma tela de autorização será exibida.

![Tela de autorização do Cloudflare](/assets/images/what-is-cloudflare/cloudflare-login.webp)

Clique no seu domínio e autorize. O Cloudflare instalará automaticamente um arquivo de certificado no diretório home do usuário.

```bash
You have successfully logged in.
If you wish to copy your credentials to a server, they have been saved to:
/home/junior/.cloudflared/cert.pem
```

#### 3. Criar um túnel

Para criar um novo túnel, basta rodar o seguinte:

```bash
cloudflared tunnel create neotwitter
```

Você terá uma saida informando que o túnel foi criado com sucesso.

```bash
Created tunnel neotwitter with id d90fb39e-37c9-478a-b315-173cb83dd06c
```

Listando os arquivos no diretório `/home/junior/.cloudflared`, você verá um arquivo de autenticação de certificado e um arquivo JSON com uma longa sequência de caracteres, que é a mesma string encontrada no ID do túnel do Cloudflare. Selecione e copie a string do seu ID do Túnel.

```bash
ls ~/.cloudflared/
cert.pem d90fb39e-37c9-478a-b315-173cb83dd06c.json
```

#### 4. Criar nosso config.yml

Como estamos configurando nosso túnel por meio da ferramenta `cloudflared`, precisamos criar nosso arquivo `config.yml` dentro do diretório `/home/user/.cloudflared/`. Este arquivo configurará nossas entradas (ingresses) para permitir o acesso ao site hospedado no nosso servidor.

```bash
touch ~/.cloudflared/config.yml
```

Listando os arquivos no diretório `.cloudflared`, agora temos 3 arquivos.

```bash
ls ~/.cloudflared/
cert.pem config.yml d90fb39e-37c9-478a-b315-173cb83dd06c.json
```

Vamos fazer a configuração básica, adicionando o ID do túnel no arquivo de configuração.

```bash
vim ~/.cloudflared/config.yml
```

```vim
tunnel: d90fb39e-37c9-478a-b315-173cb83dd06c
credentials-file: /home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json
```

O `tunnel` é o UUID do túnel que copiamos antes. O `credentials-file` é a pasta do cloudflared, seguida pelo UUID `.json`. Salve e feche o vim se estiver usando o vim com `:wq`.

#### 5. Adicionar uma entrada DNS

Nessa etapa, adicionaremos a entrada DNS para o site. Essa será a URL que os usuários digitarão em seus navegadores para acessar seu site. Você pode fazer este passo no painel do Cloudflare, mas como estamos usando o `cloudflared`, faremos isso digitando o seguinte comando:

```bash
cloudflared tunnel route dns neotwitter neotwitter.juniorfox.net
```

#### 6. Ingress

As entradas de ingress são configurações que tornam um site ou serviço em seu host ou rede acessível na internet. Pode ser qualquer host ou serviço em sua rede, como um site, uma núvem privada Nextcloud ou servidor de mídia Jellyfin. Não importa, desde que seja um servidor HTTP ou HTTPS em sua rede, você pode torná-lo acessível. Vamos adicionar as entradas de **Ingress** ao arquivo `.cloudflared/config.yml` .

```bash
vim ~/.cloudflared/config.yml
```

```vim
tunnel: d90fb39e-37c9-478a-b315-173cb83dd06c
credentials-file: /home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json
ingress:
  - hostname: neotwitter.juniorfox.net
    service: https://192.168.122.130:80

  - service: http_status:404
```

#### 7. Executando o túnel

Por último, mas não menos importante, vamos iniciar o nosso túnel. Executando:

```bash
cloudflared tunnel run neotwitter
```

#### 8. Algo deu errado

Ao testar o site **neotwitter.juniorfox.net**, ocorreu o seguinte erro:

![Bad gateway 502](/assets/images/what-is-cloudflare/bad-gateway-error.webp)

O que deu de errado? Vamos dar uma olhada no log do túnel para entender o que aconteceu.

![Log de execução](/assets/images/what-is-cloudflare/error-log.webp)

O log aponta que não é possível realizar conexão com `https://192.168.122.130:80`. Isso porque o servidor Web **NGINX** está servindo o site via HTTP simples, não HTTPS. Vamos corrigir isso e tentar novamente.

```bash
vim ~/.cloudflared/config.yml
```

![Config.yml corrigido](/assets/images/what-is-cloudflare/fix-config.webp)

Vamos levantar o túnel novamente.

```bash
cloudflared tunnel run neotwitter
```

E acesse o **neotwitter.juniorfox.net**

![O site Neotwitter está no ar!](/assets/images/what-is-cloudflare/neotwitter.webp)

Parece que tudo está funcionando conforme o esperado. É muito legal já ter a conexão com certificado SSL já configurado.

Você acha que o Neotwitter seria um bom substituto para o Twitter no Brasil, já que o anterior não está mais funcionando?

## Conclusão

Isso conclui este artigo sobre o Cloudflare, uma solução fácil de usar para ajudar qualquer pessoa a colocar um site online com facilidade. Abordamos seus principais recursos, assim como suas vantagens e também seus riscos. Espero que este artigo tenha ajudado você a entender a natureza do Cloudflare, assim como ajudado a colocar seu site ou serviço disponível online.

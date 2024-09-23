---
title: "Wireguard VPN"
articleId: "vpn-com-wireguard"
date: "2024-09-23"
author: "Carlos Junior"
category: "Rede"
brief: "Vamos criar nosso próprio servidor VPN gratuitamente para acessar nossa rede doméstica com Wireguard."
image: "/assets/images/wireguard-vpn/stephen-sherbers-wireguard-photo.webp"
keywords: ["sobre"]
lang: "pt"
other-langs: [{"lang":"en","article":"wireguard-vpn"}]
---

# Wireguard VPN

![Foto do Wireguard de Stephen Sherber](/assets/images/wireguard-vpn/stephen-sherbers-wireguard-photo.webp)

Wireguard VPN é uma ótima e confiável opção para seu próprio servidor VPN. O Wireguard não depende de um servidor centralizado, mas de uma rede ponto a ponto. Além de ser fácil de usar e configurar.

Este tutorial é inspirado no blog de Stephen Herbers, que infelizmente não está mais disponível, mas você ainda pode acessa-lo usando o [arquivo do Waybackmachine](https://web.archive.org/web/20240203171519/https://www.sherbers.de/diy-linux-router-part-6-wireguard-vpn/).

Meu provedor de internet não oferece um endereço IP público válido, mas sim por trás de uma rede CGNAT. Isso significa que é impossível acessar diretamente minha rede doméstica pela Internet. Para superar isso, usarei um **VPS gratuito da Oracle Cloud** como intermediário entre minha rede doméstica e hosts remotos.

## Índice

- [Topologia de Rede](#topologia-de-rede)
- [Instalação](#instalação)
- [Autenticação](#autenticação)
- [Configuração do Wireguard](#configuração-do-wireguard)
  - [Configuração do VPS](#configuração-do-vps)
  - [Firewall e VCN](#firewall-e-vcn)
    - [VCN](#vcn)
    - [Firewall](#firewall)
    - [Habilitar encaminhamento ipv4](#habilitar-encaminhamento-ipv4)
  - [Configuração do Gateway Doméstico](#configuração-do-gateway-doméstico)
  - [Laptop e Android](#laptop-e-android)
- [Conectando tudo](#conectando-tudo)
- [Testando](#testando)

## Topologia de Rede

![Topologia de Rede](/assets/images/wireguard-vpn/network-topology.webp)

Usarei a rede **10.10.10.0/26** para o Wireguard.

- **10.10.10.62/26** - VPS na nuvem com um endereço IP público disponível. Este será o servidor ao qual todos os hosts remotos se conectarão.
- **10.10.10.1/26** - Servidor doméstico/Gateway com IP CGNAT, atuando como roteador para permitir o acesso à minha rede doméstica.
- **10.10.10.2 - 10.10.10.61** - Outros hosts remotos que permito acessar minha rede doméstica.
- **192.168.0.1 - 192.168.0.254** - Rede doméstica.

## Instalação

O processo de instalação varia dependendo do sistema operacional ou distribuição Linux que você está usando. Para este tutorial, usarei **Oracle Linux**, que é um clone do **RHEL** e a base para muitos outros sistemas como **Rocky Linux** e **Fedora** usando `yum`.

```sh
sudo yum install -y wireguard-tools
```

## Autenticação

A autenticação do Wireguard é feita usando um par de chaves privada e pública. Vamos gerar nosso par de chaves para cada host na rede Wireguard:

```sh
wg genkey | tee private.key | wg pubkey > public.key
```

O comando acima criará o par de chaves para o peer. Você pode gerar o par de chaves para cada host que deseja que faça parte da rede VPN. No exemplo acima, geramos as chaves privada/pública, respectivamente, nos arquivos `private.key` e `public.key`.

## Configuração do Wireguard

Depois de criar um par de chaves para cada host, é hora de configurar nosso `wg0.conf`. O caminho para este arquivo varia dependendo do sistema operacional. Você pode ter uma interface gráfica ou apenas um arquivo de texto. Como a chave privada estará nesse arquivo, lembre-se de definir o proprietário como `root` e as permissões como `600` para o arquivo `/etc/wireguard/wg0.conf`.

### Configuração do VPS

Vamos configurar nosso **VPS** com sua chave privada e a chave pública dos outros hosts, bem como os endereços IP de cada host na nossa rede Wireguard.

`/etc/wireguard/wg0.conf`

```conf
#VPS
[Interface]
PrivateKey = <chave privada do VPS>
Address = 10.10.10.62/26
ListenPort = 51820

#Servidor doméstico/Gateway doméstico
[Peer]
PublicKey = <chave pública do servidor doméstico>
AllowedIPs = 0.0.0.0/0 # Permitir conexão com a rede doméstica.

#Laptop
[Peer]
PublicKey = <chave pública do laptop>
AllowedIPs = 10.10.10.2/32

#Celular Android
[Peer]
PublicKey = <chave pública do celular Android>
AllowedIPs = 10.10.10.3/32
```

`AllowedIPs` define a rede acessível por trás daquele host. Ela pode ser uma sub-rede ou um endereço IP. Eu defini um endereço para cada host.

### Firewall e VCN

#### VCN

Apesar de estar disponível publicamente na internet, o **VPC** não tem o IP público diretamente conectado a ele. Em vez disso, a Oracle Cloud, como muitos provedores de nuvem, cria uma **VCN** (Rede Virtual na Nuvem), anexando um IP público a ela e roteando apenas a porta 22 desse IP para o **VPC** permitindo assim uma conexão entre você e a máquina.

Para tornar o Wireguard disponível, é necessário rotear a **porta UDP 51820 do Wireguard** do IP público para a máquina. Vamos acessar o console da **Oracle Cloud**, e navegar até **Network** e **Virtual Cloud Networks**.

![Lista de Redes Virtuais na Nuvem da Oracle Cloud](/assets/images/wireguard-vpn/virtual-cloud-network.webp)

Você verá a VCN criada para sua máquina. Clique nela. Depois, você verá as sub-redes relacionadas a essa VCN, clique na sub-rede apropriada e, em seguida, teremos suas listas de segurança. Clique na lista apropriada.

![Regras de Entrada](/assets/images/wireguard-vpn/ingress-rules.webp)

Role um pouco para baixo até ver as **Ingress Rules**. Clique em **Add Ingress Rule**. Ao adicionar a regra, defina como:

- Source Type: CIDR
- Source CIDR: 0.0.0.0/0
- IP Protocol: UDP
- Destination Port Range: 51820
- Description: Wireguard

Salve clicando em **Add Ingress Rule**. A regra de entrada fará parte das outras regras de entrada.

#### Firewall

A rota foi criada na VCN, mas também é importante abrir a porta no próprio firewall do **VPC**. Não é complicado. Apenas alguns comandos no terminal pronto! Mas primeiro, vamos ver como está a configuração de rede do **VPC**:

```bash
ip --brief a
lo UNKNOWN 127.0.0.1/8 ::1/128
ens3 UP 10.0.0.240/24
```

Parece que tenho um adaptador de rede chamado **ens3** com o endereço IP da LAN fornecido pela Oracle Cloud. Vamos ver em qual zona de firewall essa interface está.

```bash
firewall-cmd --get-zone-of-interface=ens3
public
```

Ótimo, a interface está vinculada à zona pública. Com isso em mente, vamos adicionar o serviço Wireguard a essa zona.

```bash
firewall-cmd --add-service=wireguard --zone=public
Error: INVALID_SERVICE: wireguard
```

Temos um problema. O serviço **wireguard** não existe nas regras incorporadas do firewall-cmd. Vamos criar nossa regra.

```bash
firewall-cmd --permanent --new-service=wireguard
firewall-cmd --permanent --service=wireguard --add-port=51820/udp
firewall-cmd --reload
```

Com nosso serviço criado, vamos adicioná-lo à zona pública, que é a zona da qual o adaptador **ens3** faz parte.

```bash
firewall-cmd --add-service=wireguard --zone=public
firewall-cmd --runtime-to-permanent
```

#### Habilitar encaminhamento ipv4

Nosso VPS está aceitando conexões, mas não está encaminhando-as. Para fazer isso, precisamos habilitar o `ip_forward`. Habilite o encaminhamento de IP no arquivo `/etc/sysctl.conf`.

```bash
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

As conexões podem ser encaminhadas, mas é importante adicionar a opção **Masquerade** para traduzir os endereços, essa tradução viabiliza que os hosts de um lado do gateway, alcancem os computadores do outro lado.

```bash
firewall-cmd --add-masquerade --permanent
```

### Configuração do Gateway Doméstico

Meu gateway doméstico está por trás de um CGNAT (Carrier-Grade NAT), o que significa que ele não está disponível publicamente na internet. É por isso que preciso de um VPS na nuvem atuando como intermediário entre minha rede doméstica e recursos remotos. Ele atuará como um gateway para permitir que meus hosts remotos acessem minha rede doméstica.

A configuração da VPN será a mesma dos outros hosts remotos. Atente ao valor **PersistentKeepalive**. O objetivo desse valor é manter a conexão ativa, pois quando conexão fica ociosa, ela é interrompida após um tempo.

`/etc/wireguard/wg0.conf`

```conf
#Servidor Doméstico/Gateway
[Interface]
PrivateKey = <chave privada do servidor doméstico>
Address = 10.10.10.1/26

#VPS
[Peer]
Endpoint = <IP Público do VPS>:51820
PublicKey = <chave pública do VPS>
PersistentKeepalive = 25
AllowedIPs = 10.10.10.0/26
```

### Laptop e Android

A configuração identica a que fizemos no **Gateway Doméstico**. No celular Android, você pode gerar sua chave privada diretamente no celular ou copiar e colar a chave gerada no servidor. Eu prefiro usar a que criei no meu servidor.

Esteja ciente de que esses pares de chaves permitirão o acesso à rede doméstica. Então, após configurar e conectar tudo, é uma boa prática excluir esses arquivos de chave por motivos de segurança.

`wg0.conf`

```conf
#Celular Android ou Laptop
[Interface]
PrivateKey = <chave privada do celular Android ou laptop>
Address = 10.10.10.2/26

#VPS
[Peer]
Endpoint = <IP Público do VPS>:51820
PublicKey = <chave pública do VPS>
AllowedIPs = 0.0.0.0/0
```

## Conectando tudo

Assumindo que tudo está configurado conforme o esperado, vamos conectar tudo. Para fazer isso, basta executar como usuário root em cada máquina Linux:

```sh
wg-quick up wg0
```

Para outros sistemas operacionais, será uma questão de clicar em botões ou alternar switches. Você também pode iniciar as conexões Wireguard na inicialização habilitando o módulo de serviço `systemd`.

```sh
systemctl enable wg-quick@wg0.service
```

## Testando

Com tudo conectado e funcionando, você poderá testar a conexão entre os hosts. Você deve ser capaz de rotear conexões entre os hosts e a rede doméstica através da máquina VPS.

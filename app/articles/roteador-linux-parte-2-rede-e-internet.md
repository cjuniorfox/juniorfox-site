---
title: "Roteador Linux - Parte 2 - Rede e Internet"
articleId: "roteador-linux-parte-2-rede-e-internet"
date: "2024-10-06"
author: "Carlos Junior"
category: "Linux"
brief: "Nesta segunda parte, vamos configurar VLANs e suas redes, configurar uma conexão PPPoE, configurar o servidor DHCP e implementar regras básicas de firewall."
image: "/assets/images/diy-linux-router/network.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-2-network-and-internet"}]
---

Esta é a segunda parte de uma série de artigos descrevendo como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 3: [Usuários, segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)
- Parte 7: [Compartilhamento de Arquivos](/article/roteador-linux-parte-7-compartilhamento-de-arquivos)
- Parte 8: [Backup](/article/roteador-linux-parte-8-backup)
- [Armazenamento não permanente](/article/roteador-linux-armazenamento-nao-permanente)

Na primeira parte, abordamos a configuração de hardware e instalamos um sistema Linux básico usando NixOS sobre um sistema de arquivos ZFS.  
Nesta parte, configuraremos VLANs e suas redes, configuraremos uma conexão PPPoE, configuraremos o servidor DHCP e implementaremos regras básicas de firewall.

![Rede](/assets/images/diy-linux-router/network.webp)

## Índice

- [VLANs](#vlans)
  - [O Modelo OSI](#o-modelo-osi)
  - [O que é uma VLAN?](#o-que-é-uma-vlan)
    - [VLANs sem tags](#vlans-sem-tags)
    - [VLANs com tags](#vlans-com-tags)
    - [Configuração Híbrida (tagged e untagged)](#configuração-híbrida-tagged-e-untagged)
  - [Vantagens das VLANs](#vantagens-das-vlans)
  - [Desvantagens das VLANs](#desvantagens-das-vlans)
- [Topologia da Rede](#topologia-da-rede)
- [Mac Mini](#mac-mini)
  - [Redes](#redes)
- [Configuração do NixOS](#configuração-do-nixos)
- [Conclusão](#conclusão)

## VLANs

Nesta configuração, utilizo switch gerenciável **TP-Link TL-SG108E** com capacidade de VLAN.

### O Modelo OSI

O modelo OSI define a arquitetura de comunicação de uma rede em sete camadas:

- **Camada 1: Camada Física** – Trata das conexões físicas, como cabos, NICs e conectores.
- **Camada 2: Camada de Enlace de Dados** – Gerencia os endereços MAC, pontes, switches e **VLANs**.
- **Camada 3: Camada de Rede** – Responsável pelo endereçamento IP e roteamento.
- **Camada 4: Camada de Transporte** – Facilita o transporte de dados usando protocolos como **TCP** e **UDP**.
- **Camada 5: Camada de Sessão** – Gerencia as conexões entre as aplicações cliente e servidor.
- **Camada 6: Camada de Apresentação** – Trata da formatação e codificação de dados.
- **Camada 7: Camada de Aplicação** – Fornece acesso à rede para as aplicações de usuário final.

Você pode aprender mais sobre o modelo OSI [aqui](https://www.freecodecamp.org/news/osi-model-networking-layers-explained-in-plain-english/).

### O que é uma VLAN?

Uma VLAN (Rede Local Virtual) segmenta uma rede logicamente, em vez de fisicamente. Sem as VLANs, a segmentação da rede exigiria switches e interfaces de rede separados. Este método é chamado de **segmentação na Camada 1**, enquanto a segmentação baseada em VLAN opera na **Camada 2**.

Na Camada 2, os dados são transportados em **frames**, cada um contendo um **cabeçalho** e **dados**. O cabeçalho inclui informações como o **endereço MAC de destino** e, opcionalmente, uma **tag VLAN**. A tag VLAN garante que os frames sejam entregues ao segmento de rede desejado, conforme configurado no switch.

As VLANs isolam o tráfego entre diferentes segmentos, garantindo que dispositivos em uma VLAN não possam se comunicar diretamente com os de outra VLAN. Para usar as VLANs de forma eficaz, vamos entender os princípios da VLAN:

- Cada VLAN é identificada por um **PVID** (Port VLAN ID).
- As portas podem ser configuradas para aceitar tráfego de várias VLANs **com tags**.
- O tráfego sem tags em uma porta é atribuído à sua VLAN padrão, geralmente **PVID 1**.

#### VLANs sem tags

Uma VLAN sem tags divide um switch em segmentos isolados. Por exemplo, atribuindo:

- **Portas 1-4** ao **PVID 1**
- **Portas 5-8** ao **PVID 2**

serão criadas duas redes separadas, onde dispositivos conectados às **Portas 1-4** não poderão se comunicar com aqueles nas **Portas 5-8**.

#### VLANs com tags

As VLANs com tags permitem que uma única porta trate o tráfego de várias VLANs. O switch verifica a tag VLAN para rotear o tráfego de forma apropriada. Isso é semelhante a conectar várias placas de rede a switches diferentes, mas usando uma única interface física.

Por exemplo:

- **Portas 1 e 3** estão com tags para **VLAN 30** e **VLAN 90**.
- O tráfego marcado como **VLAN 30** ou **VLAN 90** da **Porta 1** só alcançará a **Porta 3**, e vice-versa.

Dispositivos conectados às portas com tags devem ser configurados para reconhecer tags VLAN; caso contrário, o tráfego será descartado.

#### Configuração Híbrida (Tagged e Untagged)

Um switch inteligente pode remover as tags VLAN dos frames antes de encaminhá-los para uma porta. Por exemplo:

- **Porta 1** está com tag para **VLAN 2**.
- **Porta 2** está configurada com **PVID 2** como sem tags.

O tráfego enviado da **Porta 1** com tag **VLAN 2** será entregue à **Porta 2** sem tags. Isso é útil em cenários onde um dispositivo, como um modem ISP, não suporta tags VLAN.

### Vantagens das VLANs

- **Custo-benefício**: Reduz a necessidade de interfaces de rede adicionais e cabos.
- **Cabeamento Simplificado**: A segmentação lógica elimina a necessidade de conexões físicas separadas.
- **Reconfiguração Flexível**: As VLANs podem ser reconfiguradas facilmente através de uma interface de gerenciamento de rede.

### Desvantagens das VLANs

- **Largura de banda compartilhada**: Todo o tráfego de VLAN na mesma interface física compartilha a largura de banda.
- **Maior Complexidade**: Exige gerenciamento cuidadoso das configurações de VLAN.
- **Configuração de Host**: Dispositivos nas portas com tags devem suportar VLANs e ser configurados corretamente.

### Topologia da Rede

O **Mac Mini** atuará como um roteador usando a seguinte configuração de VLAN:

| Rede         | Interface | VLAN      |
|--------------|-----------|----------:|
| **LAN**      | br0       | Untagged  |
| **Guest**    | vlan30    | 30        |
| **IoT**      | vlan90    | 90        |
| **WAN**      | ppp0      | 2         |

#### Configuração do Switch

O switch possui 8 portas configuradas da seguinte forma:

- **VLAN 1**: Portas 1, 3–8 (Untagged)
- **VLAN 2**: Portas 1 e 2 (Tagged)
- **VLAN 30**: Portas 1 e 3 (Tagged)
- **VLAN 90**: Portas 1 e 3 (Tagged)

```txt
    ┌─────────────► Mac Mini
    │   ┌─────────► WAN PPPoE 
    │   │   ┌─────► AP Unifi U6 Lite
    │   │   │   ┌─► Rede Privada
    │   │   │   │   ▲   ▲   ▲   ▲
┌───┴───┴───┴───┴───┴───┴───┴───┴───┐    
| ┌───┬───┬───┬───┬───┬───┬───┬───┐ |
| │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ |
| └───┴───┴───┴───┴───┴───┴───┴───┘ |
└───┬───┬───┬───┬───────────────────┘
    │   │   │   └─► Portas 4–8 Untagged VLAN 1
    │   │   └─────► VLANs Tagged 30, 90; VLAN 1 Untagged
    │   └─────────► VLAN 2 Untagged
    └─────────────► VLANs Tagged 2, 30, 90; VLAN 1 Untagged
```

## Mac Mini

Esta seção descreve como configuramos as redes no **Mac Mini** para organização e confiabilidade ideais.

### Redes

- **LAN**: `10.1.78.0/24` é atribuída a uma ponte, `br0`. Ela é deixada sem tags para acesso direto à rede.
- **Guest**: `10.30.17.0/24` é configurada como `vlan30` (VLAN 30).
- **IoT**: `10.90.85.0/24` é configurada como `vlan90` (VLAN 90).
- **WAN**: `PPPoE` serve como a rede `wan` para a conexão com a internet.

### Renomeando a Interface de Rede

Nos sistemas Linux antigos, as interfaces de rede eram nomeadas arbitrariamente (por exemplo, `eth0`, `eth1`), com a ordem determinada pela inicialização do kernel. Isso podia levar a inconsistências, especialmente após atualizações do kernel ou do firmware, fazendo com que a identificação da interface mudasse e interrompesse as configurações de rede.

Sistemas modernos usam nomes previsíveis com base na conexão física do hardware ao barramento (por exemplo, `enp4s0f0`). Embora essa abordagem seja mais confiável, ela ainda pode ser afetada por atualizações do sistema.

Para garantir um nome consistente, atribuí um nome persistente à minha interface de rede principal com base no seu **Endereço MAC**. Essa renomeação vincula a interface (`enp4s0f0`) a `enge0`, facilitando a gestão durante as atualizações.

## Configuração do NixOS

*Nota: Partes desta configuração são inspiradas no [Blog do Francis](https://francis.begyn.be/blog/nixos-home-router).*

Vamos configurar nosso servidor NixOS como um roteador, organizando a configuração em arquivos `.nix` modulares. Essa abordagem melhora a manutenção e clareza.

### Estrutura de Arquivos

Abaixo está a estrutura de diretórios para nossa configuração:

```bash
/etc/nixos
├── configuration.nix        # Arquivo principal de configuração do NixOS
└── modules/ 
      ├── networking.nix       # Configurações de rede e ativação do NFTables
      ├── pppoe.nix            # Configuração da conexão PPPoE
      ├── services.nix         # Configurações de serviços
      └── nftables.nft         # Conjunto de regras do NFTables
```

### 1. Criar Arquivos de Configuração e Diretórios

Primeiro, crie os diretórios necessários e os arquivos de configuração:

```bash
mkdir -p /etc/nixos/modules
touch /etc/nixos/modules/{networking,pppoe,services}.nix
touch /etc/nixos/modules/nftables.nft
```

### 2. Atualizar o Arquivo de Configuração Principal

Vamos dividir o arquivo `configuration.nix` em módulos separados para uma melhor organização. Em vez de sobrescrever o arquivo inteiro, acrescente as seguintes linhas.

#### Arquivo: `/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:

{
  imports = [
    <nixos-hardware/apple/macmini/4> # Configuração de hardware específica para o Mac Mini 2010
    ./hardware-configuration.nix
    ./modules/networking.nix
    ./modules/services.nix
    ./modules/pppoe.nix
    ./modules/users.nix
  ];

  # Habilitar o encaminhamento IPv4 e IPv6 para configurar o servidor como um roteador
  boot.kernel.sysctl = {
    "net.ipv4.conf.all.forwarding" = true;
    "net.ipv6.conf.all.forwarding" = true;
  };

  # Instalar pacotes essenciais para administração e depuração
  environment.systemPackages = with pkgs; [
    bind
    conntrack-tools
    ethtool
    htop
    ppp
    openssl
    tcpdump
    tmux
    vim
  ];
}
```

### 3. Configuração de Rede

A **configuração de rede** é definida em `modules/networking.nix`. Como o **Mac Mini** possui apenas uma NIC física, vamos usar VLANs para gerenciar várias redes.

A NIC no sistema é identificada como `enp4s0f0`. Você pode verificar o nome da sua NIC executando:

```bash
ip link show
```

Exemplo de saída:

```txt
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: wlp3s0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 60:63:9a:b2:c7:44 brd ff:ff:ff:ff:ff:ff
3: enp4s0f0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq master lan state UP mode DEFAULT group default qlen 1000
    link/ether c4:2c:03:36:46:38 brd ff:ff:ff:ff:ff:ff
```

Como mostrado, existem três interfaces:

1. `lo` (Interface de loopback)
2. `wlp3s0` (Interface sem fio)
3. `enp4s0f0` (Interface Ethernet)

Vamos renomear a interface Ethernet para `enge0` para maior clareza, usando o endereço MAC `c4:2c:03:36:46:38`. O novo nome `enge0` segue uma convenção de nomenclatura mais consistente. Evite usar nomes padrão como `enoX`, `enpX`, `ensX`, ou `ethX`. Essa convenção de nomenclatura é inspirada no post do blog: [www.apalrd.net/posts/2023/tip_link/](https://www.apalrd.net/posts/2023/tip_link/#solution).

Além disso, vamos atribuir endereços MAC únicos para cada interface de rede:

- **br0**: `c4:2c:03:36:46:ff`
- **wan**: `c4:2c:03:36:46:02`
- **vlan30**: `c4:2c:03:36:46:30`
- **vlan90**: `c4:2c:03:36:46:90`

Aqui está a abordagem que usaremos para configurar tais definições no arquivo `networking.nix`:

Definiremos algumas variáveis:

- `mac_addr`: O endereço MAC real para a interface, neste caso, `c4:2c:03:36:46:38`.
- `mac_addr_prefix`: Os primeiros 5 bytes do endereço MAC, `c4:2c:03:36:46`.
- `nic`: O nome da interface, aqui será `enge0`.

Configuraremos a rede usando **systemd-network**, que oferece uma solução unificada e eficiente para gerenciar redes.

Segue o arquivo `networking.nix`:

`/etc/nixos/modules/networking.nix`:

```nix
{ config, pkgs, ... }:
let
  nic = "enge0";
  mac_addr_prefix = "c4:2c:03:36:46";  
  mac_addr = "${mac_addr_prefix}:38";
  wan = "wan"; # Corresponde com pppoe.nix
  guest = "vlan30";
  iot = "vlan90";
  ip_lan = "10.1.78.1";
  ip_guest = "10.30.17.1";
  ip_iot = "10.30.85.1";
in
{
  systemd.network = {
    enable = true;
    
    # Renomear a NIC com base no endereço MAC
    links."10-${nic}" = {
      matchConfig.MACAddress = "${mac_addr}";
      linkConfig.Name = "${nic}";
    };

    netdevs = {
      "10-${wan}" = {
        netdevConfig.Name = "${wan}";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:02";
        vlanConfig.Id = 2;
      };
      "10-${guest}" = {
        netdevConfig.Name = "${guest}";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:30";
        vlanConfig.Id = 30;
      };
      "10-${iot}" = {
        netdevConfig.Name = "${iot}";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:90";
        vlanConfig.Id = 90;
      };
      "10-${lan}" = {
        netdevConfig.Name = "${lan}";
        netdevConfig.Kind = "bridge";
        MACAddress = "${mac_addr_prefix}:ff";
      };
    };

    # Configurar as interfaces de rede e atribuir endereços IP
    networks = {
      "10-${nic}" = {
        matchConfig.Name = "${nic}";
        networkConfig = {
          LinkLocalAddressing = "no";
          Bridge = "${lan}";
          VLAN = [ "${wan}" "${guest}" "${iot}" ];
        };
      };

      "10-${wan}" = {
        matchConfig.Name = "${wan}";
        networkConfig.LinkLocalAddressing = "no";
      };

      "10-${guest}" = {
        matchConfig.Name = "${guest}";
        networkConfig.Address = "${ip_guest}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig.DNS = [ "${ip_iot}" ];
      };

      "10-${iot}" = {
        matchConfig.Name = "${iot}";
        networkConfig.Address = "${ip_iot}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig.DNS = [ "${ip_iot}" ];
      };

      "10-${lan}" = {
        matchConfig.Name = "${lan}";
        networkConfig.Address = "${ip_lan}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig = {
          PoolOffset = 20;
          PoolSize = 150;
          DefaultLeaseTimeSec = 3600;
          MaxLeaseTimeSec = 7200;
          SendOption = [
            "15:string:home.example.com" # Substitua pelo seu próprio domínio
            "119:string:\x04home\x09example\x03com\x00" # Para a opção DHCP 119
          ];
          DNS = [ "${ip_lan}" ];
        };
      };
    };
  };

  networking = {
    useDHCP = false;
    hostName = "macmini";
    firewall.enable = false;
    nftables = {
      enable = true;
      rulesetFile = ./nftables.nft;
      flattenRulesetFile = true;
    };
  };
}
```

### 4. Conexão PPPoE

Vamos configurar a conexão PPPoE (Point-to-Point Protocol over Ethernet) para acesso à internet no arquivo `modules/pppoe.nix`.

`/etc/nixos/modules/pppoe.nix`

```nix
{ config, pkgs, ... }: {
  services.pppd = {
    enable = true;
    peers = {
      providername = {
        # Iniciar automaticamente a sessão PPPoE na inicialização
        autostart = true;
        enable = true;
        config = ''
          plugin pppoe.so 
          nic-wan
          user "testuser"
          password "password"
           
          noipdefault
          defaultroute 
          
          lcp-echo-interval 5
          lcp-echo-failure 3
          
          noauth
          persist
          noaccomp
  
          default-asyncmap
        '';
      };
    };
  };
}
```

### 5. Firewall

A configuração do firewall será gerenciada com **nftables**. Vamos configurar um firewall básico, mas seguro, que bloqueia todas as conexões de entrada da internet e das redes **Guest** e **IoT**, enquanto permite acesso total da rede **LAN**. Não cobrirei o **Flow Offloading** aqui, pois encontrei problemas que não puderam ser resolvidos. No entanto, se você estiver interessado, pode tentar a configuração por conta própria de acordo com [esta thread de fórum](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3).

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {

  chain input {
    type filter hook input priority filter; policy drop;

    # Permitir redes confiáveis acessarem o roteador
    iifname "lo" counter accept
    iifname "br0" counter accept

    # Permitir tráfego de retorno de ppp0 e bloquear todo o resto
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }

  chain output {
    type filter hook output priority 100; policy accept;
  }

  chain forward {
    type filter hook forward priority filter; policy drop;

    # Permitir acesso WAN para rede confiável
    iifname "br0" oifname "ppp0" counter accept comment "Permitir LAN confiável para WAN"
    # Permitir que conexões WAN estabelecidas retornem
    iifname "ppp0" oifname "br0" ct state established,related counter accept comment "Permitir retorno para LANs"
    # Ajustar MSS para pacotes TCP SYN (importante para PPPoE)
    oifname "ppp0" tcp flags syn tcp option maxseg size set 1452
  }
}

table ip nat {
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    tcp flags syn tcp option maxseg size set 1452
  }
  # NAT masquerading na interface ppp0
  chain postrouting {
    type nat hook postrouting priority filter; policy accept;
    oifname "ppp0" masquerade
  }
}
```

### 6. Serviços

Para melhor organização, separaremos a configuração dos **serviços** em um arquivo próprio, em vez de mantê-la em `configuration.nix`.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    envfs.enable = true;
    # Ativar serviço SSH
    openssh = {
      enable = true;
      settings.PermitRootLogin = "yes"; # Permitir login root (opcional, mas considere desabilitar por questões de segurança)
      settings.PasswordAuthentication = true; # Habilitar autenticação por senha
    };
  };
}
```

### 7. Aplicar Alterações

Para o **Mac Mini**, há uma configuração adicional em `hardware-configuration`. Como esta é a primeira vez que estamos reconstruindo a configuração, adicione seu canal, como foi feito durante o processo de instalação.

```bash
sudo nix-channel --add https://github.com/NixOS/nixos-hardware/archive/master.tar.gz nixos-hardware
sudo nix-channel --update
```

Para aplicar todas as mudanças e reconstruir o sistema, execute o seguinte comando:

```bash
nixos-rebuild switch
```

## Conclusão

Isso é tudo por enquanto! No próximo artigo, vamos focar em melhorar a segurança, desabilitando o login root, habilitando a **autenticação SSH baseada em chave** e fortalecendo ainda mais o **firewall** com regras e permissões mais detalhadas.

- Parte 3: [Usuários, segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)

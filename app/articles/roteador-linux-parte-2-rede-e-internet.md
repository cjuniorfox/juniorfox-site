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

Na primeira parte, abordamos a configuração de hardware e instalamos um sistema Linux básico usando NixOS usando o sistema de arquivos ZFS. Nesta parte, vamos configurar VLANs e suas redes, a conexão PPPoE, configurar o servidor DHCP e implementar regras básicas de firewall.

![Rede](/assets/images/diy-linux-router/network.webp)

## Índice

- [VLANs](#vlans)
  - [O que é VLAN](#o-que-é-vlan)
    - [VLANs sem Tag](#vlans-sem-tag)
    - [VLANs com Tag](#vlans-com-tag)
    - [Misturando VLANs com e sem Tag](#misturando-vlans-com-e-sem-tag)
    - [Vantagens](#vantagens)
    - [Desvantagens](#desvantagens)
- [Topologia de Rede](#topologia-de-rede)
- [Mac Mini](#mac-mini)
  - [Redes](#redes)
- [Configuração do NixOS](#configuração-do-nixos)
- [Conclusão](#conclusão)

### VLANs

Nesta configuração, estou usando o switch **TP-Link TL-SG108E** e farei uso de VLANs.

#### O que é VLAN

Para atribuir corretamente diferentes redes usando uma única NIC, precisamos utilizar VLANs. Mas o que exatamente é uma VLAN?

**VLAN** ou **LAN Virtual**, permite criar redes virtuais, semelhantes a NICs virtuais, para dividir sua rede em dois ou mais segmentos. Em um switch gerenciado, você pode criar VLANs e atribuir portas a cada VLAN como **tagged** (com tag) ou **untagged** (sem tag).

- Você pode atribuir várias VLANs do tipo *tagged* a uma única porta.
- Você só pode atribuir uma VLAN *untagged* a uma porta.

##### VLANs sem Tag

Em um switch gerenciado, é possível criar duas ou mais **VLANs** e dividir a rede. Isso é como ter dois switches separados dentro do mesmo hardware físico. Por exemplo, digamos que queremos criar duas redes isoladas que não podem se comunicar entre si. Podemos atribuir `VLAN 1` às **portas 1 a 4** e `VLAN 2` às **portas 5 a 8**. Qualquer tráfego vindo da **porta 1** poderá alcançar as **portas 2, 3 e 4**, mas não poderá alcançar nenhum dispositivo conectado às **portas 5, 6, 7 ou 8**.

##### VLANs com Tag

Da mesma forma, você pode configurar uma porta usando **tags de VLAN**. Isso permite que uma única porta manipule o tráfego de várias **VLANs**, desde que o o host conectado a porta esteja devidamente configurado. Na prática, isso é como ter dois adaptadores de rede distintos conectados a dois switches de rede distintos, mas compartilhando a mesma interface de rede física, cabo e porta do switch.

Por exemplo:

- **Porta 1** está *tagged* com `VLAN 1` e `VLAN 2`.
- **Portas 2 a 4** estão *untagged* para `VLAN 1`, e **portas 5 a 8** estão *untagged* para **VLAN 2**.

Qualquer tráfego vindo da **porta 1** *tagged* como `VLAN 1` alcançará dispositivos nas **portas 2 a 4**, mas não aqueles nas **portas 5 a 8**. Da mesma forma, o tráfego *tagged* como `VLAN 2` alcançará dispositivos nas **portas 5 a 8**, mas não aqueles nas **portas 2 a 4**.

##### Misturando VLANs com e sem Tag

Alguns switches permitem que você misture tráfego *tagged* e *untagged* na mesma porta. Isso é útil quando você deseja compartilhar uma porta entre duas ou mais redes. Embora possa parecer complicado, é bastante simples na prática.

Por exemplo, suponha que você tenha uma rede corporativa para tráfego privado e queira permitir que visitantes usem o Wi-Fi da empresa sem acessar a rede privada. No seu gateway, você pode configurar duas LANs virtuais compartilhando a mesma NIC: uma **LAN Privada** (*untagged*) e uma **LAN de Convidados** (*tagged* como `VLAN 2`). Você também pode configurar seus pontos de acesso (APs) com duas LANs virtuais vinculadas a duas redes sem fio: Privada (untagged) e Convidados (tagged como VLAN 2).

A configuração do switch seria:

- **VLAN 1** (untagged) em todas as portas.
- **VLAN 2** (tagged) nas portas 1 e 2.

Nesta configuração:

O gateway está conectado à **porta 1**.
O AP está conectado à **porta 2**.

Qualquer tráfego *untagged* da **porta 1** se comunicará com dispositivos nas **portas 1 a 8** sem problemas. No entanto, o tráfego *tagged* como `VLAN 2` da **porta 1** só alcançará a **porta 2**, e o dispositivo na **porta 2** só verá o tráfego da `VLAN 2` se estiver configurado para lidar com tráfego etiquetado como `VLAN 2`. Se você conectar um dispositivo à **porta 2** sem configurar a `VLAN 2`, ele não receberá nenhum tráfego etiquetado como `VLAN 2`, rejeitando o mesmo.

##### Vantagens

- **Custo-benefício**: Você pode compartilhar uma NIC, um cabo e uma porta de switch entre várias redes.

##### Desvantagens

- **Largura de banda compartilhada**: O tráfego físico e a velocidade são compartilhados entre as VLANs.
- **Complexidade**: Você precisa tomar nota de quais portas estão atribuídas a quais VLANs.
- **Configuração do host**: Dispositivos conectados a portas *tagged* devem ser configurados trabalhar com tráfego VLAN.

No Mac Mini, vamos configurar três redes na mesma interface. Isso significa que o tráfego das redes **LAN**, **GUEST** e **PPPoE WAN** compartilharão o mesmo cabo físico, efetivamente compartilhando a largura de banda. Por exemplo, se você estiver transmitindo um filme, o tráfego será duplicado, pois o Mac Mini lidará tanto com o tráfego vindo da internet quanto com o tráfego enviado para o dispositivo na sua rede.

A minha conexão de internet tem 600 Mbps de download e 150 Mbps de upload, não notei nenhum impacto no desempenho. Isso porque, enquanto o Mac Mini está baixando conteúdo da WAN, ele está simultaneamente enviando-o para a LAN, efetivamente se comportando como uma conexão "half-duplex". Como muitas conexões de internet, incluindo fibra, já são half-duplex, essa configuração não introduz problemas de desempenho significativos. No entanto, tenha em mente que, se você saturar a conexão com mais tráfego, alguma degradação de desempenho por saturação de rede pode ocorrer.

## Topologia de Rede

Teremos as seguintes redes:

| Network      | Interface | VLAN      |
|--------------|-----------|----------:|
|10.1.1.0/24   | Lan       | untagged  |
|10.1.30.0/24  | GUEST     | 30        |
|10.1.90.0/24  | IoT       | 90        |
|PPPoE         | PPP0      | 2         |

Por hora vamos configurar apenas IPv4. Posteriormente endereçamos IPv6.

- O Switch tem 8 portas.
- **VLAN 1**: Ports 1, 3 à 8 são untagged.
- **VLAN 2**: Ports 1 e 2 são tagged.
- **VLAN 30**: Port 1 e 3 são tagged.
- **VLAN 90**: Port 1 e 3 são tagged.

```txt
    ┌─────────────► Mac Mini
    │   ┌─────────► WAN PPPoE 
    │   │   ┌─────► AP Unifi U6 Lite
    │   │   │   ┌─► Rede Local
    │   │   │   │   ▲   ▲   ▲   ▲
┌───┴───┴───┴───┴───┴───┴───┴───┴───┐    
| ┌───┬───┬───┬───┬───┬───┬───┬───┐ |
| │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ |
| └───┴───┴───┴───┴───┴───┴───┴───┘ |
└───┬───┬───┬───┬───────────────────┘
    │   │   │   └─► 4-8 Untagged VLAN 144
    │   │   └─────► Untagged VLAN 1, Tagged VLAN 30, 90
    │   └─────────► Untagged VLAN 2
    └─────────────► Untagged VLAN 1, Tagged VLAN 2, 30, 90
```

### Mac Mini

Como este Mac Mini só tem uma porta Ethernet, as demais redes serão configuradas via **VLAN**.

#### Redes

- `10.1.1.0/24` é uma bridge vinculada à placa de rede. No meu caso, `enp4s0f0`. Essa será untagged para facilitar o acesso do computador pela rede sem a necessidade de configurar uma VLAN em outro host.
- `10.1.30.0/24` é `enp4s0f0.30` (VLAN 30) como rede `guest`.
- `10.1.90.0/24` é `enp4s0f0.90` (VLAN 90) como rede `iot`.
- `PPPoE` é `enp4s0f0.2` como rede `wan` para conexões PPPoE.

## Configuração do NixOS

*Algumas partes eu tirei do [Blog do Francis](https://francis.begyn.be/blog/nixos-home-router)*.

Vamos configurar nosso servidor editando os arquivos `.nix` conforme necessário. Para manter a organização, vamos criar arquivos separados para suas seções:

```bash
/etc/nixos
├── configuration.nix
└── modules/
      ├── networking.nix  # Configurações de rede/ habilita NFTables
      ├── pppoe.nix       # Configuração da conexão PPPoE
      ├── services.nix    # Outros serviços
      ├── nftables.nft    # Configuração de Firewall com NFTables
      └── dhcp_server.kea # Configuração do servidor DHCP 
```

### 1. Arquivos e pastas de configuração

Crie todos as pastas e arquivos necessários:

```bash
mkdir -p /etc/nixos/modules
touch /etc/nixos/modules/{{networking,pppoe,services}.nix,nftables.nft,dhcp_server.kea}
```

### 2. Configuração básica

Dividiremos nosso `configuration.nix` em módulos separados para manter a organização e facilitar a manutenção.
Não substitua o arquivo todo, mas apenas insira as partes destacadas.

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
  ...
  boot = {
    ...
    kernel.sysctl = {
      "net.ipv4.conf.all.forwarding" = true;
      "net.ipv6.conf.all.forwarding" = false;
    };
  };

  ...

  imports = [
    ./modules/networking.nix
    ./modules/services.nix
    ./modules/pppoe.nix
  ];

  environment.systemPackages = with pkgs; [
    bind
    conntrack-tools
    ethtool
    htop
    ppp
    openssl
    tcpdump
    vim
  ];

  ...

}
```

### 3. Rede

Nossa configuração de rede será no `modules/networking.nix`.
Como mencionado antes, como esse *Mac Mini* só tem uma placa de rede, esta configuração se baseará em **VLANs** para que que essa interface sirva as redes pretendidas: VLANs 1, 30 e 90.

No exemplo, utilizo o adaptador de rede do Macmini `enp4s0f0`. Verifique o nome correto do seu adaptador de rede com o comando:

```bash
ip link
```

```txt
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: enp4s0f0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP mode DEFAULT group default qlen 1000
    link/ether c4:2c:90:65:50:13 brd ff:ff:ff:ff:ff:ff
3: wlp3s0b1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 60:34:4c:13:41:f0 brd ff:ff:ff:ff:ff:ff
```

`/etc/nixos/modules/networking.nix`

```nix
{ config, pkgs, ... }:
let nic = "enp4s0f0"; # Seu adaptador de rede
in
{
  networking = {
    useDHCP = false;
    hostName = "macmini";
    nameservers = [ "1.1.1.1" "8.8.8.8" ];
   
    # Define VLANS
    vlans = {
      wan = { id = 2; interface = "${nic}"; };
      guest = { id = 30; interface = "${nic}"; };
      iot = { id = 90; interface = "${nic}"; };
    };
    #Lan will be a bridge to the main adapter.
    bridges = {
      "lan" = { interfaces = [ "${nic}" ]; };
    };
    interfaces = {
      "${nic}".useDHCP = false;
      # Handle VLANs
      wan.useDHCP = false;
      lan = { ipv4.addresses = [{ address = "10.1.1.1";  prefixLength = 24; } ]; };
      guest = { ipv4.addresses = [{ address = "10.1.30.1"; prefixLength = 24; }]; };
      iot = { ipv4.addresses = [{ address = "10.1.90.1"; prefixLength = 24; } ]; };
    };
  };
}
```

### 5. Conexão PPPoE

Configuraremos a conexão PPPoE (protocolo de conexão ponto a ponto pela Ethernet) para acecsso à internet. Essa configuração está no arquivo `modules/pppoe.nix`.

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

A configuração do Firewall é feita com `nftables`. Inicialmente será uma configuração básica, mas segura, no arquivo `nftables.nft`. Esta configuração não permitirá novas conexões vindas da internet, bem como das redes `guest` e `iot`, enquanto permitirá a entrada de conexões na rede `lan`.
A regra `flow offloading`, que tem o objetivo de melhorar o desempenho da ligação entre as redes e a internet não funcionou a contento no meu caso. Deixei comentado para caso você queira experimentar. [Maiores detalhes aqui](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3).:

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  # Flow offloading para melhor performace. Remova se tiver problemas gerar o build.
  flowtable f {
    hook ingress priority 0
    devices = { ppp0, lan }
  }

  chain input {
    type filter hook input priority filter
    policy drop

    # Permite todo o tráfego na rede local
    iifname {"lan", } counter accept

    # Permite conexões de retorno e bloqueia todo o resto
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }

  chain output {
    type filter hook output priority 100
    policy accept
  }

  chain forward {
    type filter hook forward priority filter 
    policy drop

    # flow offloading para melhor performace
    ip protocol { tcp, udp } flow offload @f

    # Permite acesso a rede local a intenret
    iifname { "lan",} oifname "ppp0" counter accept comment "Allow trusted LAN to WAN"

    # Permite conexões de retorno da wan
    iifname "ppp0" oifname {"lan",} ct state established,related counter accept comment "Allow established back to LANs"
    # https://samuel.kadolph.com/2015/02/mtu-and-tcp-mss-when-using-pppoe-2/
    # Clamp MSS to PMTU for TCP SYN packets
    oifname "ppp0" tcp flags syn tcp option maxseg size set rt mtu
  }
}

table ip nat {
  chain prerouting {
    type nat hook prerouting priority filter
    policy accept
  }
  # Masquerade de pacotes enviados para a internet
  chain postrouting {
    type nat hook postrouting priority filter
    policy accept
    oifname "ppp0" masquerade
  }
}
```

### 7. Servidor DHCP

A configuração do serviço **DHCP** será feita pelo `kea.dhcp4`.

`/etc/nixos/modules/dhcp_server.kea`

```json
{
  "Dhcp4": {
    "valid-lifetime": 4000,
    "renew-timer" : 1000,
    "rebind-timer": 200,

    "interfaces-config" : { 
      "interfaces": [ "lan", "guest", "iot" ]
    },

    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/dhcp4.leases"
    },
    
    "subnet4" : [
      {
        "id": 1,
        "interface" : "lan",
        "subnet": "10.1.1.0/24",
        "pools": [ { "pool": "10.1.1.100 - 10.1.1.200" } ],
        "option-data": [
          { "name": "routers", "data": "10.1.1.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8" },
          { "name": "domain-search", "data": "example.com" }
        ]
      },
      {
        "id": 2,
        "interface" : "guest",
        "subnet": "10.1.30.0/24",
        "pools": [ { "pool": "10.1.30.100 - 10.1.30.200" } ],
        "option-data": [
          { "name": "routers", "data": "10.1.30.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8" },
        ]
      },
      {
        "id": 3,
        "interface" : "iot",
        "subnet": "10.1.90.0/24",
        "pools": [ { "pool": "10.1.90.100 - 10.1.90.200" } ],
        "option-data": [
          { "name": "routers", "data": "10.1.90.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8" },
        ]
      }
    ]
  }
}
```

### 8. Serviços

No arquivo `services.nix` encontraremos os principais serviços necessários para o funcionamento do sistema. Vamos habilitar o **serviço SSH** e também o **Servidor DHCP** do **Kea**.
Como uma medida temporária, permitiremos o acesso do usuário `root` via SSH usando autenticação por senha.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    # Habilitar serviço SSH
    openssh = {
      enable = true;
      settings.PermitRootLogin = "yes"; # Permitir login root (opcional, por razões de segurança você pode querer desativar isso)
      settings.PasswordAuthentication = true; # Habilita autenticação por senha
    };
  };
}
```

### 9. Aplicar mudanças

Como originalmente não haviámos configurado a partição `boot`, precisamos monta-la primeiro:

```bash
mount /dev/sda2 /boot
```

Para as mudanças surtirem efeito, é necessário aplica-las com o comando:

```bash
nixos-rebuild switch
```

## Conclusão

Isso é tudo por enquanto! Na próxima parte, vamos focar em melhorar a segurança desativando o login da conta root, habilitando o acesso SSH via autenticação por chave e reforçando ainda mais o firewall com regras e permissões mais granulares.

- Parte 3: [Usuários, segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
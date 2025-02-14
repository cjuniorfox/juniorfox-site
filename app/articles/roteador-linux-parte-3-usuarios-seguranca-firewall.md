---
title: "Roteador Linux - Parte 3 - Usuários, Segurança e Firewall"
articleId: "roteador-linux-parte-3-usuarios-seguranca-firewall"
date: "2024-10-08"
author: "Carlos Junior"
category: "Linux"
brief: "Nesta terceira parte da nossa série, vamos aumentar a segurança criando usuários, alterando a autenticação SSH e reforçando a configuração do firewall"
image: "/assets/images/diy-linux-router/fire-of-wall.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-3-users-security-firewall"}]
---

Esta é a terceira parte de uma série de artigos descrevendo como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)
- Parte 7: [Compartilhamento de Arquivos](/article/roteador-linux-parte-7-compartilhamento-de-arquivos)
- Parte 8: [Backup](/article/roteador-linux-parte-8-backup)
- [Armazenamento não permanente](/article/roteador-linux-armazenamento-nao-permanente)

Na primeira e segunda partes, instalamos o sistema operacional, configuramos a rede e configuramos o **Mac Mini** para funcionar como um roteador.  
Nesta parte, aumentaremos a segurança criando usuários, alterando a autenticação SSH e reforçando a configuração do firewall.

![Fire of wall](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Wall of Fire](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Tabela de Conteúdos

- [Usuários](#usuários)
  1. [Gerar Senha Criptografada (opcional)](#1-gerar-senha-criptografada-opcional)
  2. [Chaves SSH](#2-chaves-ssh)
  3. [Criar o arquivo `users.nix` em `/etc/nixos/modules/`](#3-criar-o-arquivo-usersnix-em-etcnixosmodules)
  4. [Desativar autenticação por senha via SSH](#4-desativar-autenticação-por-senha-via-ssh)
  5. [Atualizar a configuração e tentar fazer login](#5-atualizar-a-configuração-e-tentar-fazer-login)
  6. [Criar configuração para acesso SSH](#6-criar-configuração-para-acesso-ssh)
  7. [Bloquear a conta root (opcional)](#7-bloquear-a-conta-root-opcional)
- [Firewall](#firewall)
  - [Configuração Atual](#configuração-atual)
  - [Melhorias Planejadas](#melhorias-planejadas)
  - [Organizando a Configuração do Firewall](#organizando-a-configuração-do-firewall)
  - [Configuração dos Arquivos](#configuração-dos-arquivos)
    1. [Remova o arquivo nftables.nft](#1-remova-o-arquivo-nftablesnft)
    2. [Crie os Arquivos de Configuração do NFTables](#2-crie-os-arquivos-de-configuração-do-nftables)
    3. [Atualize o Arquivo de Configuração networking.nix](#3-atualize-o-arquivo-de-configuração-networkingnix)
    4. [Reconstrua a configuração e teste](#4-reconstrua-a-configuração-e-teste)
- [Conclusão](#conclusão)

## Usuários

Crie os usuários desejados. Você pode criar qualquer usuário que precisar. No meu caso, criarei três: um para atuar como usuário **administrador** chamado `admin`, outro para os **contêineres rootless** como `podman`, e um último chamado `git` para ter um repositório **Git** pessoal e privado.

Para o usuário `podman`, se estiver utilizando o modo de [armazenamento não permanente](/article/roteador-linux-armazenamento-nao-permanente), você precisa alocar os `subuid` e `subgid` para o usuário de forma estática.

### 1. Gerar Senha Criptografada (opcional)

Este passo é opcional, já que a única forma para se autenticar no servidor será via SSH usando `Chaves SSH`, mas você pode criar uma senha se quiser que ela seja solicitada ao usar `sudo` ou ao autenticar localmente.

Crie as senhas para seus usuários:

```bash
mkpasswd --method=SHA-512
Password: #Digite a senha (hackme00)
```

```txt
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

#### 2. Chaves SSH  

Gere um par de chaves privadas e públicas ou use uma já existente. Maiores detalhes neste [artigo do GitHub](https://docs.github.com/pt/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).  

Siga os passos abaixo para gerar a chave SSH no seu computador:  

```bash  
ssh-keygen -t ed25519 -C "seu_email@exemplo.com" -f ~/.ssh/router-admin  
```  

```txt
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase): 
Enter the same passphrase again: 
Your identification has been saved in /root/.ssh/router-admin
Your public key has been saved in /root/.ssh/router-admin.pub
The key fingerprint is...
```

Recupere sua chave pública SSH e copie o conteúdo:

```bash
cat ~/.ssh/router-admin.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... seu_email@exemplo.com
```

Mantenha sua chave privada em segurança e não a compartilhe com ninguém.

Repita o mesmo processo para cada usuário que você deseja criar.

### 3. Criar o arquivo `users.nix` em `/etc/nixos/modules/`

Acesse o servidor via SSH usando o usuário `root` e a `senha` definida durante a instalação na [parte 1](/article/roteador-linux-parte-1-confitguracao-inicial) deste tutorial e faça o seguinte:

Defina os usuários desejados substituindo os valores de `openssh.authorizedKeys.keys`. No exemplo, a chave para o usuário `admin` deve ser preenchida com o valor de `~/.ssh/router-admin.pub`.

`/etc/nixos/modules/users.nix`

```nix
{ config, pkgs, ... }: {
  users.users.root.initialHashedPassword = "##HashedPa$$word"; # Você pode remover esta linha se não quiser fazer login diretamente como root.
  users.users = {
    # Usuário Admin
    admin = {
      uid = 1000;
      isNormalUser = true;
      description = "Usuário Administrador";
      home = "/home/admin"; # Diretório home
      extraGroups = [ "wheel" ]; # Adicione o usuário ao grupo 'wheel' para acesso sudo
      initialHashedPassword = "$6$rounds=656000$example$hashedpassword"; # Senha, opcional
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Substitua pela chave pública real
      ];
    };

    # Usuário Podman para containers podman rootless
    podman = {
      uid = 1001;
      subUidRanges = [{ startUid = 100000; count = 65536; }];
      subGidRanges = [{ startGid = 100000; count = 65536; }];
      isNormalUser = true;
      description = "Podman Rootless";
      home = "/home/podman";
      group = "containers";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Substitua pela chave pública real
      ];
      linger = true; # Lingering permite que serviços de usuário systemd iniciem sem necessidade de login.
    };

    # Usuário Git
    git = {
      uid = 1002;
      isNormalUser = true;
      description = "Git";
      home = "/home/git";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Substitua pela chave pública real
      ];
    };
  };
  users.groups.containers = {
    gid = 993;
    members = [ "podman" ];
  }

  # Habilitar sudo para usuários no grupo 'wheel'
  security.sudo = {
    enable = true;
    wheelNeedsPassword = false;  # Opcional: Requer que uma senha seja inserida para o comando sudo. Defina como true se optar por criar o usuário admin com senha.
  };
}
```

### 4. Desativar autenticação por senha via SSH

Desative a autenticação por senha e o login de `root` via **SSH**.

`/etc/nixos/modules/services.nix`

```nix
  services = { 
  ...
    openssh = {
      enable = true;
      settings.PermitRootLogin = "no"; # Era "yes". Altere para "no" para desativar
      settings.PasswordAuthentication = false;
    };
  ...
  };
```

### 5. Atualizar a configuração e tentar fazer login

Reconstrua a configuração:

```bash
nixos-rebuild switch
```

Tente fazer login no servidor usando o `admin` com a chave privada gerada anteriormente.

```bash
ssh -i ~/.ssh/router-admin admin@10.1.78.1
```

### 6. Criar configuração para acesso SSH

Se você não quiser digitar `ssh -i ~/.ssh/router-admin admin@10.1.78.1` toda vez para se autenticar no servidor, no seu computaor, configure o arquivo `~/.ssh/config` da seguinte forma:

```yaml
Host router-admin
  Hostname 10.1.78.1
  user admin
  IdentityFile ~/.ssh/router-admin

Host router-podman
  Hostname 10.1.78.1
  user podman
  IdentityFile ~/.ssh/router-podman

Host router-git
  Hostname 10.1.78.1
  user git
  IdentityFile ~/.ssh/router-git
```

Tente acessar o servidor via **ssh** sem fornecer o **arquivo de identidade** como parâmetro.

```bash
ssh router-admin
```

### 7. Bloquear a conta root (opcional)

Como o serviço **SSH** está configurado para impedir logins de `root`, não vejo necessidade de bloquear a conta `root` localmente, mas você pode fazer isso se quiser.  
Se você configurou seu servidor com [armazenamento não permanente](/articles/roteador-linux-armazenamento-nao-permanente), basta apenas remover a linha `users.users.root.initialHashedPassword = "##HashedPa$$word"` do arquivo `users.nix` para desativar a senha do root sem etapas adicionais.

**ATENÇÃO** Esteja ciente de que bloquear a senha do `root` sem uma senha configurada para a conta `admin`, o impedirá autênticar-se no servidor localmente, permitindo apenas via **SSH**. Certifique-se também de ter criado a conta `admin` e adicionado-a ao grupo `wheel`.

```bash
passwd -l root
```

## Firewall

Com as configurações do usuário concluídas, é hora de melhorar a segurança do nosso firewall.

### Configuração Atual

Até agora, nossa configuração de firewall inclui:

- Permitir todo o tráfego de entrada da rede **LAN**.
- Bloquear todo o tráfego de entrada das redes **WAN/PPPoE**, **Guest** e **IoT**, exceto para acesso à internet.

Embora essa configuração forneça um nível básico de segurança, podemos alcançar uma proteção melhor por meio de um controle mais granular do tráfego. Isso garante que, se algum serviço abrir portas adicionais no servidor de forma não intencional, o tráfego não autorizado não será permitido.

### Melhorias Planejadas

Vamos refinar nosso firewall para permitir apenas o tráfego necessário para cada rede:

- **LAN**: Permitir os serviços **DHCP** e **SSH**.
- **Guest** e **IoT**: Permitir apenas o serviço **DHCP**.
- **WAN**: Habilitar **SSH** para acesso remoto.

### Organizando a Configuração do Firewall

Para simplificar o gerenciamento e garantir escalabilidade, estruturaremos a configuração do firewall em seções lógicas. Essa abordagem divide as interfaces, regras e serviços em **zonas** e organiza a configuração em vários arquivos. A estrutura será a seguinte:

#### **Tabela INET** (Regras principais do firewall)

- **`sets.nft`**: Mapeia **interfaces** para suas respectivas **zonas**.
- **`services.nft`**: Define cadeias para portas de **serviços**, como **SSH** e **HTTP**.
- **`zones.nft`**: Especifica quais **serviços** são permitidos em cada **zona**.
- **`rules.nft`**: Configura as **regras** para zonas e gerencia o fluxo de tráfego.

#### **Tabela NAT** (Regras de Tradução de Endereços de Rede)

- **`nat_sets.nft`**: Mapeia **interfaces** para suas respectivas **zonas**.
- **`nat_chains.nft`**: Define cadeias NAT para tarefas como redirecionamento de portas.
- **`nat_zones.nft`**: Associa cadeias NAT às **zonas**.
- **`nat_rules.nft`**: Configura regras NAT para zonas.

Essa abordagem modular tornará a configuração do firewall mais organizada, fácil de entender e simples de manter ou estender no futuro.

### Configuração dos Arquivos

#### 1. Remova o arquivo `nftables.nft`

Como dividiremos o `nftables` em arquivos separados, não será mais necessário usar este arquivo. Você pode deletá-lo ou apenas deixá-lo inativo.

```bash
rm /etc/nixos/modules/nftables.nft
```

#### 2. Crie os Arquivos de Configuração do NFTables

Crie o diretório e todos os arquivos necessários para o **NFTables**.

```bash
mkdir -p /etc/nixos/nftables
touch /etc/nixos/nftables/{nat_chains,nat_rules,nat_sets,nat_zones,rules,services,sets,zones}.nft
```

Configure cada arquivo **NFTables** conforme necessário.

##### sets.nft

Utilizaremos variáveis para atribuir dinamicamente os valores das interfaces.

```bash
cat << EOF > /etc/nixos/nftables/sets.nft 
table inet filter {
  set WAN {
    type ifname;
    elements = { \$if_wan }
  }

  set LAN {
    type ifname;
    elements = { \$if_lan }
  }

  set GUEST {
    type ifname;
    elements = { \$if_guest }
  }

  set IOT {
    type ifname;
    elements = { \$if_iot }
  }
}
EOF
```

##### services.nft

```bash
cat << EOF > /etc/nixos/nftables/services.nft
table inet filter {
  chain dhcp_input {
    udp dport 67 ct state { new, established } counter accept comment "Permitir DHCP"
  }

  chain echo_input {
    icmp type echo-request accept
    icmp type echo-reply accept
  }

  chain public_ssh_input {
    tcp dport ssh ct state { new, established } limit rate 10/minute burst 50 packets counter accept comment "Permitir tráfego SSH com limite de retentativas"
  }

  chain ssh_input {
    tcp dport ssh ct state { new, established } counter accept comment "Permitir SSH"
  }
}
EOF 
```

##### zones.nft

```bash
cat << EOF > /etc/nixos/nftables/zones.nft
table inet filter {
  chain LAN_INPUT {
    jump dhcp_input
    jump echo_input
    jump ssh_input
  }

  chain GUEST_INPUT {
    jump dhcp_input
    jump echo_input
  }

  chain IOT_INPUT {
    jump dhcp_input
    jump echo_input
  }

  chain WAN_INPUT {
    jump public_ssh_input
  }
}
EOF 
```

##### rules.nft

```bash
cat << EOF > /etc/nixos/nftables/rules.nft
table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;
    iifname "lo" counter accept

    iifname @LAN jump LAN_INPUT 
    iifname @GUEST jump GUEST_INPUT
    iifname @IOT jump IOT_INPUT
    iifname @WAN jump WAN_INPUT
 
  
    # Permitir tráfego de retorno da ppp0 e descartar todo o resto
    iifname @LAN ct state { established, related } counter accept
    iifname @WAN ct state { established, related } counter accept
  }

  chain output {
    type filter hook output priority 100; policy accept;
  }

  chain forward {
    type filter hook forward priority filter; policy drop;
    iifname @LAN  oifname @WAN counter accept comment "Permitir trafego confiável LAN para WAN"
    iifname @WAN oifname @LAN ct state established,related counter accept comment "Permitir tráfego estabelecido de volta para LANs"
    
    iifname @GUEST  oifname @WAN counter accept comment "Permitir trafego confiável de GUEST para WAN"
    iifname @WAN oifname @GUEST ct state established,related counter accept comment "Permitir tráfego estabelecido de volta para GUEST"
  
    iifname @IOT  oifname @WAN counter accept comment "Permitir tráfego confiável de IOT para WAN"
    iifname @WAN oifname @IOT ct state established,related counter accept comment "Permitir tráfego estabelecido de volta para IOT"

    # Bloquear tráfego entre redes
    iifname @GUEST oifname @LAN drop comment "Bloquear conexões de GUEST para LAN"
    iifname @IOT oifname @LAN drop comment "Bloquear conexões de IOT para LAN"
    iifname @GUEST oifname @IOT drop comment "Bloquear conexões de GUEST para IOT"
    iifname @IOT oifname @GUEST drop comment "Bloquear conexões de IOT para GUEST"
    
    # MSS Clamp
    oifname @WAN tcp flags syn tcp option maxseg size set 1452
  }
}
EOF 
```

##### nat_sets.nft

```bash
cat << EOF > /etc/nixos/nftables/nat_sets.nft
table nat {
  set WAN {
    type ifname;
    elements = { \$if_wan }
  }

  set LAN {
    type ifname;
    elements = { \$if_lan }
  }

  set GUEST {
    type ifname;
    elements = { \$if_guest }
  }

  set IOT {
    type ifname;
    elements = { \$if_iot }
  }
}
EOF
```

##### nat_chains.nft

As **cadeias NAT** serão criadas vazias por enquanto.

```bash
cat << EOF > /etc/nixos/nftables/nat_chains.nft 
table ip nat {
}
EOF
```

##### nat_zones.nft

Como não há **cadeias de redirecionamento**, as **zonas NAT** serão criadas com cadeias vazias por enquanto.

```bash
cat << EOF > /etc/nixos/nftables/nat_zones.nft
table ip nat {
  chain LAN_PREROUTING {
  }

  chain GUEST_PREROUTING {
  }

  chain IOT_PREROUTING {
  }

  chain WAN_PREROUTING {
  }
}
EOF
```

##### nat_rules.nft

```bash
cat << EOF > /etc/nixos/nftables/nat_rules.nft
table ip nat {
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    iifname @LAN jump LAN_PREROUTING 
    iifname @GUEST jump GUEST_PREROUTING 
    iifname @IOT jump IOT_PREROUTING 
    iifname @WAN jump WAN_PREROUTING 
  }

  chain postrouting {
    type nat hook postrouting priority filter; policy accept;
    oifname @WAN tcp flags syn tcp option maxseg size set 1452
    oifname @WAN masquerade
  }
}
EOF
```

#### 3. Atualize o arquivo de configuração networking.nix

Edite a seção **network** do arquivo de configuração **networking.nix** como a seguir:  
*Atualize apenas a seção **networking**. Deixe o restante do arquivo como está.*

`/etc/nixos/modules/networking.nix`

```nix
...
  networking = {
    useDHCP = false;
    firewall.enable = false;
    nftables = {
      enable = true;
      rulesetFile = pkgs.writeText "ruleset.conf" ''
        define if_wan = "ppp0"
        define if_lan = "${lan}"
        define if_guest = "${guest}"
        define if_iot =  "${iot}"
        define ip_lan = "${ip_lan}"
        define ip_guest = "${ip_guest}"
        define ip_iot = "${ip_iot}"
        
        # Inet filter, serviços e regras
        include "${../nftables/sets.nft}"
        include "${../nftables/services.nft}"
        include "${../nftables/zones.nft}"
        include "${../nftables/rules.nft}"

        # Nat & redirecionamento
        include "${../nftables/nat_sets.nft}"
        include "${../nftables/nat_chains.nft}"
        include "${../nftables/nat_zones.nft}"
        include "${../nftables/nat_rules.nft}"
      '';
      flattenRulesetFile = true;
    };
  };
...
```

#### 4. Reconstrua a configuração e teste

```bash
nixos-rebuild switch
```

## Conclusão

Com esta configuração, melhoramos a segurança deste firewall. O que foi feito até agora:

- Reduzimos a necessidade de usar a conta `root` para certas tarefas.
- Dividimos nosso firewall em zonas, tornando-o mais fácil de gerenciar.
- Criamos um controle mais granular sobre o tráfego em nosso servidor.

Na próxima parte, é hora de instalar o **Podman** e configurar nosso **Servidor DNS** com o Unbound.

- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)

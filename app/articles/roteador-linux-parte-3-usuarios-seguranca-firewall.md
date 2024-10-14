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

Nas primeiras e segundas partes, instalamos o sistema operacional, configuramos a rede e configuramos o Mac Mini para funcionar como um roteador.
Nesta parte, vamos aumentar a segurança criando usuários, alterando a autenticação SSH e reforçando a configuração do firewall.

![Parede de fogo](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Parede de fogo](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Índice

- [Usuários](#usuários)
  - [1. Gerar Senha Hashed (opcional)](#1-gerar-senha-hashed-opcional)
  - [2. Criar `users.nix` em `/etc/nixos/modules/`](#2-criar-usersnix-em-etcnixosmodules)
  - [3. Desabilitar autenticação por senha no SSH](#3-desabilitar-autenticação-por-senha-no-ssh)
  - [4. Atualize a configuração e tente fazer login](#4-atualize-a-configuração-e-tente-fazer-login)
- [Firewall](#firewall)
- [Conclusão](#conclusão)

## Usuários

Vamos criar os usuários esperados. No meu caso, preciso de dois. Um para atuar como usuário administrador chamado `admin` e outro com o nome de `git` para ter um repositório **Git** pessoal e privado.

### 1. Gerar Senha Hashed (opcional)

Este passo é opcional, pois a forma pretendida de autenticação no servidor é através de SSH usando `ssh keys`, mas pode ser criada se você quiser que o console solicite inserir uma senha ao usar `sudo` ou autenticar localmente.

Crie uma senha para o usuário `admin`. A senha para o usuário `git` não é necessária, pois será autenticado usando uma `chave ssh`.

```bash
mkpasswd --method=SHA-512
Senha: #digite a senha (hackme00)
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

Gere suas chaves SSH públicas digitando no seu computador local. Mais detalhes sobre como gerar chaves podem ser encontrados [neste link](https://docs.github.com/pt/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

```bash
ssh-keygen -C "usuario@nome_da_maquina"
Digite o arquivo no qual salvar a chave (/home/meuusuario/.ssh/id_rsa):
Digite a senha (vazia para sem senha):
Digite a mesma senha novamente:
...
```

Recupere suas chaves públicas SSH e copie o conteúdo:

```bash
cat ~/.ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... usuario@nome_da_maquina
```

### 2. Criar `users.nix` em `/etc/nixos/modules/`

Crie seus usuários. Substitua as `authorization.keys` pela chave gerada acima.

`/etc/nixos/modules/users.nix`

```nix
{ config, pkgs, ... }: {
  users.users = {
    # Usuário Admin
    admin = {
      isNormalUser = true;
      description = "Usuário Administrador";
      home = "/home/admin"; # Diretório Home
      extraGroups = [ "wheel" ]; # Adiciona o usuário ao grupo 'wheel' para acesso sudo
      hashedPassword = "$6$rounds=656000$example$hashedpassword"; # Senha, opcional
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Substitua pela chave pública real
      ];
    };

    # Usuário Git
    git = {
      isNormalUser = true;
      description = "Usuário Git";
      home = "/home/git";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Substitua pela chave pública real
      ];
    };
  };

  # Habilitar sudo para usuários no grupo 'wheel'
  security.sudo = {
    enable = true;
    wheelNeedsPassword = true;
  };
}
```

Adicione o arquivo `users.nix` ao `configuration.nix`.

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
...
  imports = [
    ./modules/networking.nix
    ./modules/firewall.nix
    ./modules/services.nix
    ./modules/pppoe.nix
    ./modules/dhcp_server.nix
    ./modules/users.nix
  ];
...
}
```

### 3. Desabilitar autenticação por senha no SSH

Desabilitar a autenticação por senha aumenta a segurança, pois o usuário só poderá fazer login através de `ssh keys`. Além disso, desabilitar a autenticação de `root` é uma boa medida.

`/etc/nixos/modules/services.nix`

```nix
{config, pkgs, ... }: {
  # Habilitar serviço SSH
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = false;
    };
  };
}
```

### 4. Atualize a configuração e tente fazer login

Reconstrua a configuração:

```bash
nixos-rebuild switch
```

## Firewall

Configuramos nossos usuários e agora vamos aumentar a segurança do Firewall.

Até agora, o que fizemos no nosso firewall foi:

- Permitir todo o tráfego vindo da rede `lan`.
- Bloquear qualquer tráfego vindo de `wan pppoe` e `guest`.

Está razoavelmente seguro dessa forma, mas ter um controle mais granular sobre o tráfego de entrada é melhor, pois garante que, se algum serviço não intencional iniciar no nosso servidor, ele não permitirá tráfego de entrada. Então, em vez de permitir todo o tráfego da `lan`, vamos permitir apenas as portas de serviço `ssh` e `dhcp-client`. Aumentaremos essa lista ao longo do tempo, à medida que habilitamos outros serviços como `dns` usando **Unbound**, **samba**, e **NFS** para compartilhamento de arquivos ou **jellyfin** para Serviço de Mídia. No NixOS, é bastante fácil configurar nosso firewall apenas atualizando o arquivo `nftables.nft`.

`/etc/nixos/modules/nftables.nft`

```nix
table inet filter {
  chain ssh_input {
      iifname "lan" tcp dport 22 ct state { new, established } counter accept 
        comment "Permitir SSH na LAN"

      iifname "ppp0" tcp dport 22
        limit rate 10/minute burst 50 packets 
        ct state { new, established } accept
        comment "Permitir tráfego SSH da interface ppp0 com limitação de taxa";
  }

  chain dhcp_input {
      iifname { "lan", "guest" } udp dport 67 
        ct state { new, established }
        counter accept comment "Permitir DHCP na LAN e Convidados"
    }

  chain input {
    type filter hook input priority filter; policy drop;

    jump ssh_input;
    jump dhcp_input;

    # Permitir tráfego de retorno de ppp0 e bloquear todo o resto
    iifname "ppp0" ct state { established, related } counter accept;
    iifname "ppp0" drop;
  }
...
}
```

Abrimos as portas para os serviços habilitados no nosso servidor. Nesse caso, ele permite apenas o serviço `DHCP` para as redes `lan` e `guest`, e habilita `ssh` tanto para `lan` quanto para `ppp0`. Você pode pensar que permitir tráfego SSH para o nosso servidor na internet é uma brecha de segurança, mas desde que aumentamos a segurança no `SSH` bloqueando os usuários de fazer login com senha, estamos dentro dos padrões esperados de segurança. Além disso, para dificultar qualquer tentativa de força bruta para quebrar a criptografia de segurança do nosso servidor, configuramos uma regra para permitir apenas **10 novas conexões por minuto**.

## Conclusão

Melhoramos a segurança de nosso servidor. Na próxima parte, instalaremos o `podman` e configuraremos nosso Servidor DNS com **Unbound**.

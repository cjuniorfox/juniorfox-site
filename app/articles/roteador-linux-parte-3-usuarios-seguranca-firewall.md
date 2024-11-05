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

Nas primeiras e segundas partes, instalamos o sistema operacional, configuramos a rede e configuramos o Mac Mini para funcionar como um roteador.
Nesta parte, vamos aumentar a segurança criando usuários, alterando a autenticação SSH e reforçando a configuração do firewall.

![Parede de fogo](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Parede de fogo](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Índice

- [Usuários](#usuários)
- [Firewall](#firewall)
- [Conclusão](#conclusão)

## Usuários

Vamos criar os usuários esperados. Você pode criar qualquer usuário que tenha necessidade. No meu caso, preciso de dois. Um para atuar como usuário administrador chamado `admin` e outro com o nome de `git` para ter um repositório **Git** pessoal e privado.

### 1. Gerar Senha Hashed (opcional)

Este passo é opcional, pois a forma pretendida de autenticação no servidor é através de SSH usando `ssh keys`, mas pode ser criada se você quiser que o console solicite inserir uma senha ao usar `sudo` ou autenticar localmente.

Crie uma senha para o usuário `admin`. A senha para o usuário `git` não é necessária, pois será autenticado usando uma `chave ssh`.

```bash
mkpasswd --method=SHA-512
Senha: #digite a senha (hackme00)
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

### 2. Chaves SSH

Gere suas chaves SSH privadas e publicas ou use um par de chaves que você já tenha. Por exemplo, se você possuir uma conta no Github, poderá usar as chaves geradas quando você [criou uma nova chave SSHH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

Realize esse procedimento em seu computador local, não no servidor.

```bash
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/router-admin
```

```txt
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase): 
Enter same passphrase again: 
Your identification has been saved in /root/.ssh/router-admin
Your public key has been saved in /root/.ssh/router-admin.pub
The key fingerprint is...
```

Copie o conteúdo das chaves SSH geradas:

```bash
cat ~/.ssh/router-admin.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... your_email@example.com
```

Tenha ciência que manter as chave privada de seu roteador pode acarretar em riscos de segurança. Se você perder a chave privada, você não poderá mais acessar o servidor. Você precisa armazenar essas chaves em local seguro e não as compartilhar com ninguém.

Repita o processo para cada usuário que desejar criar. No meu caso, repeti o processo para o usuário `git`. Se quiser, você pode usar o mesmo par de chaves para vários usuários, mas eu considero isso um risco a segurança.

### 3. Criar `users.nix` em `/etc/nixos/modules/`

Acesse o servidor via SSH usando através do usuário `root` e a senha na [parte 1](/article/roteador-linux-parte-1-configuracao-inicial) desse tutorial.

Crie seus usuários. Substitua as `authorization.keys` pela chave gerada acima em `~/.ssh/router-admin.pub`.

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
    wheelNeedsPassword = true; # Opcional: exigir senha ao usar sudo. Use false para permitir sudo sem senha ou se não definiu uma senha para o usuário admin.
  };
}
```

Adicione o arquivo `users.nix` ao `configuration.nix`.

`/etc/nixos/configuration.nix`

```nix
...
  imports = [
    ...
    ./modules/users.nix
  ];
...
```

### 4. Desabilitar autenticação por senha no SSH

Desabilitar a autenticação por senha aumenta a segurança, pois o usuário só poderá fazer login através de `ssh keys`. Além disso, desabilitar a autenticação de `root` é uma boa medida.

`/etc/nixos/modules/services.nix`

```nix
  services = { 
  ...
    openssh = {
      enable = true;
      settings.PermitRootLogin = "no";
      settings.PasswordAuthentication = false;
    };
  ...
  };
```

### 5. Atualize a configuração e tente fazer login

Reconstrua a configuração:

```bash
nixos-rebuild switch
```

Teste a autenticação ao servidor com o usuário `admin`, usando  a chave privada gerada para o mesmo nas etapas anteriores.

```bash
ssh -i ~/.ssh/router-admin admin@10.1.1.1
```

### 6. Adicionar configuração de SSH

Para não precisar digitar toda a vez `ssh -i ~/.ssh/router-admin admin@10.1.1.1` para se autênticar, adicione ao arquivo `~/.ssh/config`:

```yaml
Host macmini
  Hostname 10.1.1.1
  user admin
  IdentityFile ~/.ssh/router-admin

Host macmini
  Hostname 10.1.1.1
  user admin
  IdentityFile ~/.ssh/router-git
```

Teste o acesso **SSH** sem informar o arquivo de chaves.

```bash
ssh admin@macmini
```

### 7. Trancar conta root (opcional)

Desabilitar o login do usuário `root` aumenta a segurança do servidor. Não é mandatório, mas é uma boa prática.

**ATENÇÃO!** Caso não tenha configurado uma senha para o usuário `admin`, ao travar a senha do `root`, não será mais possível se autenticar no servidor localmente, mas apenas via `ssh`. Lembre-se de se certificar que o usuário `admin` foi criado e seja parte do grupo `wheel` para usar `sudo`.

```bash
passwd -l root
```

## Firewall

Configuramos nossos usuários e agora vamos aumentar a segurança do Firewall.

Até agora, o que fizemos no nosso firewall foi:

- Permitir todo o tráfego vindo da rede `lan`.
- Bloquear qualquer tráfego vindo de `wan pppoe`, `iot` e `guest`, a não ser a internet

O servidor está bastante seguro dessa forma, mas um controle mais granular sobre o tráfego é desejável, pois garante que caso algum dos serviços configurados levante alguma porta adicional em nosso servidor, o tráfego para tal porta não será iniciado automaticamente. Com isso em mente, vamos atualizar nosso firewall para permitir apenas o tráfego necessário para nosso servidor. Para a rede `lan`, `guest`
 e `iot`, habilitaremos apenas o serviço `dhcp`. Para a rede `lan` além do `dhcp` vamos permitir acesso ao `ssh`. Habilitaremos també o `ssh` em `ppp0` para permitir acesso remoto. Conforme habilitarmos novos serviços ao nosso servidor, abrimos novas portas. No NixOS, é bastante fácil configurar nosso firewall apenas atualizando o arquivo `nftables.nft`.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  # Mantenha `flowtable` e demais regras do firewall.

  # Adicione esses `chains` a tabela `inet filter`.
  chain ssh_input {
    iifname "lan" tcp dport 22 ct state { new, established } counter accept comment "Allow SSH on LAN"
    iifname "ppp0" tcp dport 22 ct state { new, established } limit rate 10/minute burst 50 packets counter accept comment "Allow SSH traffic from ppp0 interface with rate limiting"
  }

  chain dhcp_input {
    iifname { "lan", "guest", "iot" } udp dport 67 ct state { new, established } counter accept comment "Allow DHCP on LAN, Guest and IoT networks"
  }

  # Substituia todo o `chain input` por esses valores.
  chain input {
    type filter hook input priority filter
    policy drop

    jump ssh_input
    jump dhcp_input

    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" counter drop
  }
  # Deixe `chain output`, `chain forward` e `table ip nat` como estão.
...
}
```

Abrimos as portas para os serviços habilitados no nosso servidor. Nesse caso, ele permite apenas o serviço `DHCP` para as redes `lan`, `guest` e `iot`, e habilita `ssh` tanto para `lan` quanto para `ppp0`. Você pode pensar que permitir tráfego **SSH** para o nosso servidor na internet é uma brecha de segurança, mas desde que aumentamos a segurança no `SSH` bloqueando os usuários de fazer login com senha, estamos dentro dos padrões esperados de segurança. Além disso, para dificultar qualquer tentativa de força bruta para quebrar a criptografia de segurança do nosso servidor, configuramos uma regra para permitir apenas **10 novas conexões por minuto**.

### Recostruir a configuração

```bash
nixos-rebuild switch
```

Faça logout fazer login no servidor com o usuário `admin` usando a chave privada gerada anteriormente.

## Conclusão

Melhoramos a segurança de nosso servidor. Na próxima parte, instalaremos o `podman` e configuraremos nosso **Servidor DNS** com **Unbound**.

- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)

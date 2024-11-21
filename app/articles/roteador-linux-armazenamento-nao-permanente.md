---
title: "Roteador Linux - Armazenamento Não Permanente"
articleId: "roteador-linux-armazenamento-nao-permanente"
date: "2024-10-05"
author: "Carlos Junior"
category: "Linux"
brief: "Dando uma nova vida a um antigo Mac Mini como um roteador Linux e homelab. Configurando armazenamento para não permanência."
image: "/assets/images/diy-linux-router/hard-disk.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-impermanence-storage"}]
---

Esta é parte de uma série multi-parte que descreve como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 3: [Usuários, Segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)

Neste artigo, estamos na parte 6 da série, onde continuamos a construir nosso roteador Linux. Na parte anterior, configuramos o armazenamento persistente usando o ZFS e o NFS. Nesta parte, vamos focar em uma característica interessante do **NixOS**, que é a capacidade de tornar o sistema de arquivos raiz temporário, ou seja, não permanente.

![Macmini como Roteador](/assets/images/diy-linux-router/hard-disk.webp)

## Sumário

- [Armazenamento Não Permanente](#armazenamento-não-permanente)
- [Vantagens](#vantagens)
- [Desvantagens](#desvantagens)
- [Configuração](#configuração)
  1. [Crie o arquivo de configuração impermanence.nix](#1-crie-o-arquivo-de-configuração-impermanencenix)
  2. [Adicione o novo arquivo ao configuration.nix](#2-adicione-o-novo-arquivo-ao-configurationnix)
  3. [Defina o ponto de montagem raiz como tmpfs no arquivo hardware-configuration.nix](#3-defina-o-ponto-de-montagem-raiz-como-tmpfs-no-arquivo-hardware-configurationnix)
  4. [Recompile o sistema](#4-recompile-o-sistema)
  5. [Reinicie](#5-reinicie)
- [Conclusão](#conclusão)

## Armazenamento Não Permanente

Como a maioria das distribuições Linux segue a estrutura **POSIX**, Isso significa que há um sistema de arquivos **root** identificado pelo caminho `/` e nesse path são esperadas determinadas pastas, como por exemplo:

- `/bin` - Contendo comandos gerais.
- `/dev` - **Dispositivos**, como **blocos de armazenamento**, **placas de vídeo** e **portas seriais**.
- `/etc` - Arquivos de configuração gerenciados pelo administrador do sistema.
- `/home` - Pasta **home** para os usuários.
- `/lib` - Bibliotecas usadas por programas.
- `/var` - Arquivos de configuração gerenciados por programas.
- `/sbin` - Comandos de administrador.
- `/sys` - Drivers e caminhos de dispositivos.

O **NixOS** não segue a estrutura **POSIX**. Em vez disso, seus arquivos são armazenados na pasta `/nix` em modo **somente leitura** e os caminhos padrão são apenas **links simbólicos** para caminhos dentro de `/nix` para fins de usabilidade e compatibilidade.
Os principais caminhos para o **NixOS** são:

- `/nix` - Onde o **NixOS** está realmente instalado.
- `/etc/nixos` - Arquivos de configuração do **NixOS**.
- `/var/lib/nixos` - Configuração de tempo de execução do **NixOS**.

Para inicializar o sistema, excluindo o diretório `/nix`, tudo pode ser montado como temporário. Dessa forma, se garante que a cada reinicialização teremos uma instalação limpa do sistema e isso é uma boa medida de segurança.

Aqui, vamos configurar o sistema de arquivos raiz como não permanente, apenas persistindo o que é necessário para ter nosso servidor funcional com os serviços desejados. O que precisamos persistir é:

- Configuração do NixOS `/etc/nixos` e `/var/lib/nixos`
- Chaves SSH `/etc/ssh/keys*`
- Pontos de montagem no pool de armazenamento `zdata`, como pastas `home` e arquivos do **Podman**.

## Vantagens

- Cada reinicialização é uma instalação nova. Se algo der errado, basta reiniciar.

## Desvantagens

- Você pode perder configurações necessárias para certos programas ou serviços. Certifique-se de criar o **Datapool ZFS** ou configurar os todos os caminhos necessários no arquivo `impermanence.nix` para garantir a persistência dos mesmos.
- Como o sistema de arquivos **raiz** como sistema de arquivos temporário em RAM e muitos arquivos armazenados nesse sistema de arquivos, há um custo adicional de RAM no armazenamento dos mesmos.

## Configuração

### 1. Crie o arquivo de configuração impermanence.nix

Crie o arquivo de configuração impermanence.nix conforme descrito na [Wiki do NixOS](https://nixos.wiki/wiki/Impermanence)

`/etc/nixos/modules/impermanence.nix`

```nix
{ config, pkgs, ... }:

let
  impermanence = builtins.fetchTarball "https://github.com/nix-community/impermanence/archive/master.tar.gz";
in
{
  imports = [ "${impermanence}/nixos.nix" ];

  environment.persistence."/nix/persist/system" = {
    hideMounts = true;
    directories = [
      "/var/lib/nixos"
    ];
    files = [
      "/etc/machine-id"
      "/etc/ssh/ssh_host_ed25519_key"
      "/etc/ssh/ssh_host_rsa_key"
      { file = "/etc/nix/id_rsa"; parentDirectory = { mode = "u=rwx,g=,o="; }; }
    ];
  };
}
```

### 2. Adicione o novo arquivo ao configuration.nix

`/etc/nixos/configuration.nix`

```nix
{ config, lib, pkgs, ... }:

{
  imports =
    [ 
      ...
      ./modules/impermanence.nix
      ...
    ];
    ...
}
```

### 3. Defina o ponto de montagem raiz como tmpfs no arquivo hardware-configuration.nix

Edite `hardware-configuration.nix` substituindo a configuração do sistema de arquivos raiz do conjunto de dados ZFS por `tmpfs` e remova quaisquer pontos de montagem `tmpfs` apontando para `/tmp` e `/var/tmp`. Aqui está um exemplo:

 `/etc/nixos/hardware-configuration.nix`

 ```nix
 { config, lib, pkgs, modulesPath, ... }:

{
  ...
  fileSystems."/" =
    { device = "tmpfs";
      fsType = "tmpfs";
      options = [ "defaults" "size=2G" "mode=755" ];
  }; 
  fileSystems."/nix" =
    { device = "zroot/nix";
      fsType = "zfs";
    };

  fileSystems."/boot" =
    { device = "/dev/disk/by-uuid/EA49-B54F";
      fsType = "vfat";
      options = [ "fmask=0022" "dmask=0022" ];
    };
 
  swapDevices =
    [ { device = "/dev/disk/by-uuid/449dec38-ef32-44b1-8193-ea19dea4b324"; }
    ];
  ...
}
 ```

### 4. Recompile o sistema

Certifique-se de ter uma conexão de internet ativa antes de recompilar.

```bash
nixos-rebuild switch
```

### 5. Reinicie

Reinicie o computador e veja se tudo está funcionando corretamente. Salve algo em `/`, reinicie e veja se o arquivo desaparece após o reinício.

## Conclusão

Este conclui esta parte extra sobre o armazenamento não permanente. É uma capacidade interessante que o **NixOS** oferece, aumentando a segurança e resiliência de nosso servidor. Se você optar por usá-lo, certifique-se de que todos os caminhos que precisam ser persistidos realmente sejam persistidos.

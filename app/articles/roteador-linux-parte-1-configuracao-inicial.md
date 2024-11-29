---
title: "Roteador Linux - Parte 1 - Configuração Inicial"
articleId: "roteador-linux-diy-parte-1-configuracao-inicial"
date: "2024-10-05"
author: "Carlos Junior"
category: "Linux"
brief: "Dando uma nova vida a um antigo Mac Mini como um roteador Linux e homelab"
image: "/assets/images/what-is-cloudflare/macmini.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-1-initial-setup"}]
---
Esta é a primeira parte de uma série de várias partes que descrevem como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 3: [Usuários, segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)
- Parte 7: [Compartilhamento de Arquivos](/article/roteador-linux-parte-7-compartilhamento-de-arquivos)
- Parte 8: [Backup](/article/roteador-linux-parte-8-backup)

Com este velho **Mac Mini**, que está atualmente parado no canto, e transformá-lo em um Roteador Linux daria a ele uma nova vida. É uma máquina capaz e estável. Então, vamos lá.

![Macmini como Roteador](/assets/images/what-is-cloudflare/macmini.webp)

## Table of Contents

- [Ideia](#ideia)
- [Hardware](#hardware)
  - [MacMini Core 2 Duo de 2010](#macmini-core-2-duo-de-2010)
  - [Switch gerenciável TP-Link TL-SG108E](#switch-gerenciável-tp-link-tl-sg108e)
  - [Ubiquiti Unifi C6 Lite](#ubiquiti-unifi-c6-lite)
- [Configuração do Linux](#configuração-do-linux)
  1. [Baixe o NixOS](#1-baixe-o-nixos)
  2. [Habilite o serviço SSH](#2-habilite-o-serviço-ssh)
  3. [SSH no Mac Mini](#3-ssh-no-mac-mini)
  4. [Particione o disco](#4-particione-o-disco)
  5. [Crie os Pools ZFS](#5-crie-os-pools-zfs)
  6. [Crie e montar o sistema de arquivos Boot](#6-crie-e-monte-o-sistema-de-arquivos-boot)
  7. [Gere configuração do NixOS](#7-gere-a-configuração-do-nixos)
  8. [Crie uma senha para o usuário root](#8-crie-uma-senha-para-o-usuário-root)
  9. [Edite a configuração](#8-edite-a-configuração)
  10. [Instale o NixOS](#9-instale-o-nixos)
  11. [Desmonte o sistema de arquivos](#10-desmonte-o-sistema-de-arquivos)
  12. [Configuração pós-instalação](#11-post-installation-configuration)
- [Conclusão](#conclusão)

## Ideia

O que desejo fazer com esse Mac Mini:

- **Gateway Internet**: O Mac Mini atuará como o roteador principal, gerenciando o tráfego entre a rede interna e a internet.
- **Servidor de arquivos**: Configuraremos um servidor de arquivos para armazenar e compartilhar arquivos pela rede.
- **Armazenamento em nuvem privada com Nextcloud**: O Nextcloud fornecerá uma solução de armazenamento em nuvem auto-hospedada, permitindo que você acesse seus arquivos de qualquer lugar.
- **Rede Wifi**: O Unifi C6 Lite fornecerá acesso sem fio à rede.
- **Unbound DNS com Adblocks**: Configuraremos o Unbound DNS com bloqueio de anúncios, melhorando a privacidade e reduzindo o uso da largura de banda.
- **Servidor de mídia**: Um servidor de mídia permitirá que você transmita conteúdo para dispositivos na rede.
- **VPN privada**: Uma VPN será configurada para permitir acesso remoto seguro à rede.

## O Hardware

Para este projeto, usaremos:

### MacMini Core 2 Duo de 2010

![Imagem Wikimedia do Macmini](/assets/images/diy-linux-router/macmini.webp)
*Imagem Wikimedia: [Fonte](https://commons.wikimedia.org/wiki/File:Mac_mini_mid2010_back.jpg)*

Este Mac Mini é antigo e ha muito tempo foi aposentado. Como um computador de mesa, ele não faz muita coisa, mas como um servidor, ainda é uma ótima máquina tendo as seguintes especificações:

- Intel Core 2 Duo 8600 com 2,6 GHz.
- 6 GB de RAM.
- SSD de 2 TB.

### Switch gerenciável TP-Link TL-SG108E

![TL-SG108E - de www.redeszone.net](/assets/images/diy-linux-router/tl-sg108e.webp)
*redeszone.net*

O TP-Link TL-SG108E é uma ótima escolha para este projeto porque ele suporta VLANs para dividir a rede em diferentes segmentos. Maior detalhamento sobre VLANs Parte 2 desta série.

### Ubiquiti Unifi C6 Lite

![Logotipo Unifi de Stephen Herber como um prato de jantar](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Postagem antiga do blog de Stephen Herber sobre [DIY Linux como um roteador: link arquivado na Web](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

O Unifi C6 Lite é um AP (ponto de acesso sem fio) confiável com bom alcance e desempenho.

## Configuração do Linux

Para este projeto, pretendo utilizar o NixOS.
O NixOS é uma ótima escolha devido ao seu modelo de **configuração declarativa**. Ao definir toda a configuração do sistema arquivos `.nix`, é fácil reproduzir a configuração em outra máquina ou reverter as alterações se algo der errado. Isso torna o NixOS ideal para ser usado em um servidor onde estabilidade e reprodutibilidade são importantes. Todo este projeto está disponível no meu GitHub (links abaixo).

### 1. Baixe o NixOS

- Baixe o ISO do NixOS do [site oficial](https://nixos.org/download/).
- Crie uma unidade USB inicializável usando uma ferramenta como `dd` ou `Etcher`.
- Inicialize o Mac Mini a partir da unidade USB segurando a tecla `Option` durante a inicialização e selecionando a unidade USB.

### 2. Habilite o serviço SSH

Habilitar o SSH permitirá que você gerencie o Mac Mini remotamente do seu computador desktop, o que é especialmente útil, pois este Mac Mini funcionará sem monitor ou teclado conectados.

```sh
passwd
# Digite sua senha duas vezes.
sudo systemctl start sshd

# Verifique seu IP
ip --brief addr
```

### 3. SSH no Mac Mini

Acesse o Mac Mini usando `ssh` com `Putty` ou similar, usando o usuário `nixos` e a senha que você definiu na etapa anterior.

### 4. Particione o disco

Nesta configuração, usarei o sistema de arquivos ZFS. É um sistema de arquivos que consome bastante recurso de hardware, mas é resiliente, rápido e oferece ótimas opções de backup.

Embora o ZFS consuma muitos recursos, ele oferece várias vantagens que fazem valer a pena a troca. O ZFS fornece excelente integridade de dados por meio de rotinas de validação de checksum, suporta snapshots para realização de backups e é altamente escalável, o que o torna uma ótima escolha para um servidor de arquivos. No entanto, se considerar o **ZFS** muito para suas necessidades, o **BTRFS** é uma alternativa mais leve que ainda suporta muitos dos recursos do **ZFS**, como snapshots e backups fáceis. O BTRFS também consome menos recursos, o que o torna uma boa opção para hardwares mais antigos. O esquema de particionamento a ser apresentado, funciona tanto para sistemas **BIOS** quanto para  **UEFI**.

```bash
sudo -i
```

Defina o armazenamento de destino. Você pode verificar seu dispositivo de armazendo listando o conteúdo de `/dev/disk/by-id/`

```bash
DISK=/dev/disk/by-id/DISK=/dev/disk/by-id/scsi-ID_DO_ARMAZENAMENTO
MNT=$(mktemp -d)
```

Defina o nome do Pool de armazenamento. Para este tutorial, usarei o nome `rpool`.

```bash
ZROOT=zroot
ZDATA=zdata
```

Exclua todas as partições do dispositivo. Esteja ciente de que isso apagará todos os dados existentes.

```bash
wipefs -a ${DISK}
```

Para armazenamento baseado em flash, se o disco foi usado anteriormente, aplique o discard de dados (TRIM/UNMAP).

```bash
blkdiscard -f ${DISK}
```

Crie o esquema de partição. Neste exemplo, criarei dois pools de armazenamento:

- `zroot` com **8 Giga** de armazenamento.
- `zdata` ocupando o restante do dispositivo de armazenamento.

Eu prefiro ter um **Pool ZFS** independente para `root` e outro para dados, facilita a manutenção, mas se você preferir manter tudo no mesmo pool, basta criar apenas o `zroot` com `100%` de armazenamento.

```bash
parted ${DISK} mklabel gpt \
mkpart primary 1MiB 2MiB \
set 1 bios_grub on \
mkpart EFI 2MiB 514MiB \
set 2 esp on \
mkpart Swap 514MiB 8GiB \
mkpart ZFS-Root 8GiB 16GiB \
mkpart ZFS-Data 16GiB 100%

sleep 1
mkfs.msdos -F 32 -n EFI ${DISK}-part2
```

Obtenha o `UUID` para partições

```bash
BOOT="/dev/disk/by-uuid/"$(blkid -s UUID -o value ${DISK}-part2)
SWAP="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o valor ${DISK}-part3)
ROOT="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o valor ${DISK}-part4)
DATA="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o valor ${DISK}-part5)
```

### 5. Crie os Pools ZFS

Tanto no **ZFS** quanto no **BTRFS**, não se costuma separar os blocos de dados em partições, mas sim em **datasets** no caso do **ZFS** ou **Volumes** no caso do **BTRFS**. Eles atuam como se fossem partições, mas compartilhando o mesmo espaço de armazenamento e, muitas vezes, a mesma estrutura de arquivos e diretórios.

Nesse tutoral, abordarei apenas a criação do **Pools ZFS**, já que o processo equivalente em **BTRFS** é mais simples e intuitivo.

Para a criação dos pools de armazenamento, aplicaremos vários parâmetros. São eles:

- **`ashift=12`**: melhora o desempenho quando utilizados SSDs
- **`atime=off`**: Conforme mencionado [neste artigo](https://www.unixtutorial.org/atime-ctime-mtime-in-unix-filesystems/), os sistemas operacionais Unix modernos têm opções especiais de montagem para otimizar o uso de `atime`.
- **compression=lz4**: otimiza o espaço de armazenamento compactando dados com o algoritmo `lz4` sem sacrificar o desempenho.
- **zattr=sa**: configurações avançadas de atributos. Necessário para instalar sistemas operacionais baseados em Linux.
- **acltype=posixacl**: requisito para instalar o Linux em um sistema formatado em ZFS.

```bash
zpool create -O canmount=off -O mountpoint=/ \
  -o ashift=12 -O atime=off -O compression=lz4 \
  -O xattr=sa -O acltype=posixacl \
  ${ZROOT} ${ROOT} -R ${MNT}

zpool create -O canmount=off -O mountpoint=/mnt \
  -o ashift=12 -O atime=off -O compression=lz4 \
  -O xattr=sa -O acltype=posixacl \
  ${ZDATA} ${ROOT} -R ${MNT}
```

### Crie o sistema de arquivos

No **NixOS**, o sistema operacional é instalado no diretório `/nix`. O **NixOS** faz referência a esse diretório e cria os outros diretórios durante a inicialização para compatibilidade. Então você pode ter o sistema de arquivos **root** como **armazenamento impermanente**. Você pode ler mais sobre isso no [wiki do NixOS](https://nixos.wiki/wiki/Impermanence). Há um artigo alternativo sobre a abordagem de armazenamento impermanente no link [DIY Linux Router with Impermanence](/articles/diy-linux-router-impermanence-storage).

Este tutorial aborda a instalação usando um sistema de arquivos **root** persistente.

```bash
zfs create -o mountpoint=none -o canmount=off ${ZROOT}/root
zfs create -o mountpoint=/ -o canmount=noauto ${ZROOT}/root/nixos
zfs mount ${ZROOT}/root/nixos
```

Ter um conjunto de dados discreto `/nix` é uma boa prática porque separa a instalação do NixOS do resto do sistema.

```bash

zfs create -o canmount=noauto ${ZROOT}/nix
zfs mount ${ZROOT}/nix

```

Opcionalmente, você pode ter sua **configuração do NixOS** e efetuar login em seu próprio conjunto de dados.

```bash
zfs create -o canmount=off ${ZROOT}/etc
zfs create ${ZROOT}/etc/nixos
zfs create -o canmount=off ${ZROOT}/var
zfs create ${ZROOT}/var/log
```

O sistema de arquivos home será criado no pool `zdata`.

```bash
zfs create -o mountpoint=/home ${ZDATA}/home
```

Você pode usar `tmpfs` ou um **conjunto de dados ZFS** para **arquivos temporários**. Lembre-se de que se quiser usar o sistema de arquivos `root` impermanente, não faz sentido montar **diretórios temporários** como sistema de arquivos, então, nesse caso, pule para a etapa **Swap** se quiser usar swap.

#### Como um Dataset ZFS

```bash
zfs create -o com.sun:auto-snapshot=false ${ZROOT}/tmp
zfs create -o canmount=off ${ZROOT}/var
zfs create -o com.sun:auto-snapshot=false ${ZROOT}/var/tmp
chmod 1777 ${MNT}/var/tmp
chmod 1777 ${MNT}/tmp
```

Se você quiser usar `tmpfs`, faça o seguinte:

```bash
mkdir ${MNT}/tmp
mkdir -p ${MNT}/var/tmp
mount -t tmpfs tmpfs ${MNT}/tmp
mount -t tmpfs tmpfs ${MNT}/var/tmp
```

#### Partição de swap

Usar um swap em um **SSD** pode reduzir a vida útil da unidade, mas em alguns onde a memória RAM é bastante limitada, se faz necessário.

Considerando que foi criada uma partição para Swap.

```bash
mkswap -f ${SWAP}
swapon ${SWAP}
```

### 6. Crie e monte o sistema de arquivos Boot

Como a instalação do sistema operacional fica no diretório `/nix`, o que é basicamente `/boot/efi` em outras distribuições Linux é apenas `/boot` no **NixOS**.

```bash
mkdir ${MNT}/boot
mount ${BOOT} ${MNT}/boot
```

### 7. Gere a configuração do NixOS

```bash
nixos-generate-config --root ${MNT}
```

### 8. Crie uma senha para o usuário root

Esta etapa só é necessária se você usar o sistema de arquivos **root** impermanente.

```bash
PASS=$(mkpasswd --method=SHA-512)
```

Digite a senha. Ela será armazenada na variável `PASS` para uso posterior.

### 9. Edite a configuração

Abra o arquivo `${MNT}/etc/nixos/configuration.nix` e certifique-se de habilitar o suporte **ZFS**. Existem duas versões deste arquivo de configuração. Uma para `BIOS` e a outra para `UEFI`.

Para o **Mac Mini 2010**, há alguns problemas de compatibilidade de hardware referente a drivers proprietários que precisam ser endereçados. Felizmente, o NixOS fornece esquemas de **configuração de hardware**, o que ajuda a resolver esses problemas facilmente. No arquivo **UEFI**, há uma referência sobre importações para importar o perfil para minha máquina. Mas primeiro preciso adicionar esses canais. Mais detalhes em [github.com/NixOS/nixos-hardware](https://github.com/NixOS/nixos-hardware).

Faça esta etapa somente se você pretende usar o esquema de **configuração de hardware**.

```bash
sudo nix-channel --add https://github.com/NixOS/nixos-hardware/archive/master.tar.gz nixos-hardware
sudo nix-channel --update
```

<!-- markdownlint-disable MD033 -->
<details>
  <summary>UEFI <b>configuration.nix</b>.</summary>

```bash
cat << EOF > ${MNT}/etc/nixos/configuration.nix

{ config, lib, pkgs, ... }:

{
  imports =
    [ 
      <nixos-hardware/apple/macmini/4> #Specific for the Mac Mini 2010
      ./hardware-configuration.nix
      ./modules/users.nix
    ];

  # Use o bootloader systemd-boot para EFI.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  i18n.defaultLocale = "pt_BR.UTF-8";
   console = {
     font = "Lat2-Terminus16";
     useXkbConfig = true; # use xkb.options in tty.
   };
  time.timeZone = "America/Sao_Paulo";
  system.stateVersion = "24.05";
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "yes";
      PasswordAuthentication = true;
    };
  };
  nixpkgs.config.allowUnfree = true; 
  environment.systemPackages = with pkgs; [ vim ];

  # Set the hostId for ZFS
 networking.hostId = "$(head -c 8 /etc/machine-id)";
}
EOF
```

</details><!-- markdownlint-enable MD033 -->

<!-- markdownlint-disable MD033 -->
<details>
  <summary>BIOS <b>configuration.nix</b>.</summary>

```bash
cat << EOF > ${MNT}/etc/nixos/configuration.nix
{ config, pkgs, ... }:

{
  imports =
    [ 
      <nixos-hardware/apple/macmini/4> #Specific for the Mac Mini 2010
      ./hardware-configuration.nix
      ./modules/users.nix
    ];
  system.stateVersion = "24.05";
  boot = {
    loader = {
      grub.enable = true;
      grub.device = "${DISK}";
    };
    supportedFilesystems = [ "zfs" ];
  };

  i18n.defaultLocale = "pt_BR.UTF-8";
   console = {
     font = "Lat2-Terminus16";
     useXkbConfig = true; # use xkb.options in tty.
   };
  time.timeZone = "America/Sao_Paulo";
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "yes";
      PasswordAuthentication = true;
    };
  };
  nixpkgs.config.allowUnfree = true; 
  environment.systemPackages = with pkgs; [ vim ];

  # Set the hostId for ZFS
 networking.hostId = "$(head -c 8 /etc/machine-id)";
}
EOF
```

</details><!-- markdownlint-enable MD033 -->

#### users.nix

O arquivo `users.nix` criará os usuários pretendidos para o servidor. Por enquanto, vamos apenas definir a senha root com ele e proteger o arquivo contra leitura para outros usuários além do root. Esteja ciente de que esta etapa é fundamental para garantir que você seja capaz de acessar o servidor após sua reinicialização.

```bash
mkdir -p /etc/nixos/modules
cat << EOF > /etc/nixos/modules/users.nix
{ config, pkgs, ... }:
{
  users.users.root.initialHashedPassword = "${PASS}";
}
EOF
chmod 600 /etc/nixos/modules/users.nix 
```

#### Configuração de Hardware

O comando `nixos-generate-config` escaneia seu hardware e cria todos os pontos de montagem que seu sistema precisa. Você pode verificar se está tudo ok com ele.

Você não precisa manter os pontos de montagem gerenciados pelo **ZFS** com exceção do `/nix`. Mantenha também configurados os seguintes pontos de montagem:

- `/`: Deixe como está.
- `/nix`: Deixe como está.
- `/boot`: Como não é um sistema de arquivos **ZFS**, mas um **FAT32** para inicialização, deixe-o no arquivo de configuração também.
- `/tmp` e `/var/tmp`: Se você escolheu criá-los como `tmpfs`.

Como o **ZFS** gerencia seus pontos de montagem, você pode remover todos os pontos de montagem ZFS restantes.

Além disso, é necessário configurar o **NixOS** para importar o pool `zdata`. Complemente o arquivo de configuração com `boot.zfs.extraPools = ["zdata" ];` conforme descrito abaixo.

`${MNT}/etc/nixos/hardware-configuration.nix`

```nix
{
...

boot.zfs.extraPools = [ "zdata" ]; # Verifique se esta linha existe. Se não, adicione-a.

fileSystems."/" =
  { device = "zroot/root/nixos";
    fsType = "zfs";
  };

fileSystems."/nix" =
  { device = "zroot/nix";
    fsType = "zfs";
  };

fileSystems."/boot/" =
  { device = "/dev/disk/by-uuid/3E83-253D";
  fsType = "vfat";
  options = [ "fmask=0022" "dmask=0022" ];
};

...
}
```

### 10. Instale o NixOS

Execute o comando de instalação:

```bash
nixos-install --root ${MNT}
```

### 11. Desmonte o sistema de arquivos

```bash
cd /
swapoff ${SWAP}
umount ${MNT}/boot/
umount -Rl ${MNT}
zpool export -a
```

Após verificar se tudo foi desconectado com sucesso, você pode reiniciar seu sistema:

```bash
reboot
```

### 12. Configuração pós-instalação

Depois que o **NixOS** estiver instalado, você pode configurar os serviços que serão executados no seu roteador. Aqui estão alguns dos principais serviços que configuraremos nessa série:

- **Nextcloud**: para armazenamento em nuvem privada.
- **DNS não vinculado com Adblock**: para bloquear anúncios na rede.
- **VPN**: Para permitir acesso remoto seguro à sua rede.

## Conclusão

Ao reutilizar um Mac Mini antigo e usar o NixOS, você criou um roteador Linux poderoso e flexível que pode gerenciar sua rede, fornecer armazenamento em nuvem, bloquear anúncios e muito mais. Esta configuração é altamente personalizável e pode ser expandida com serviços adicionais. Quer você esteja procurando melhorar sua rede doméstica ou apenas queira experimentar o NixOS, este projeto é uma ótima maneira de dar vida nova ao hardware antigo.
Isso conclui a primeira parte deste artigo. Na segunda parte, configuraremos nossa rede, incluindo a configuração de VLAN para dividir nossa rede em **Casa**, **Convidado**, **IoT** e configurar uma **conexão PPPoE** com regras básicas de firewall usando `nftables` para segurança.

- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)

---
title: "Roteador Linux DIY - Parte 1 - Configuração Inicial"
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

Esta é a primeira parte de uma série de artigos descrevendo como construir seu próprio roteador Linux.

* Parte 2: [Rede e Internet](/articles/roteador-linux-diy-parte-2-rede-e-internet)

Tendo este velho Mac Mini sem uso no meu armário, transformá-lo em um servidor Linux daria uma nova vida a ele. É uma máquina capaz, estável e longe de ser feia. Então, vamos fazer isso.

![Macmini como Roteador](/assets/images/what-is-cloudflare/macmini.webp)

## Índice

* [A Ideia](#a-ideia)
* [O Hardware](#o-hardware)
  * [MacMini Core 2 Duo de 2010](#macmini-core-2-duo-de-2010)
  * [Switch Gerenciável TP-Link TL-SG108E](#switch-gerenciável-tp-link-tl-sg108e)
  * [Ubiquiti Unifi C6 Lite](#ubiquiti-unifi-c6-lite)
* [Configuração do Linux](#configuração-do-linux)
  * [1. Baixar o NixOS](#1-baixar-o-nixos)
  * [2. Habilitar o Serviço SSH](#2-habilitar-o-serviço-ssh)
  * [3. Acessar o Mac Mini via SSH](#3-acessar-o-mac-mini-via-ssh)
  * [4. Particionar o Disco](#4-particionar-o-disco)
  * [5. Criar Datasets ZFS](#5-criar-datasets-zfs)
  * [6. Montar os Sistemas de Arquivos](#6-montar-os-sistemas-de-arquivos)
  * [7. Gerar a Configuração do NixOS](#7-gerar-a-configuração-do-nixos)
  * [8. Editar a Configuração](#8-editar-a-configuração)
  * [9. Instalar o NixOS](#9-instalar-o-nixos)
  * [10. Configuração Pós-Instalação](#10-configuração-pós-instalação)
* [Conclusão](#conclusão)

## A Ideia

Vamos definir algumas premissas para o nosso projeto. Esse servidor será:

* **Gateway de Internet**: O Mac Mini atuará como o roteador principal, gerenciando o tráfego entre a rede interna e a internet.
* **Servidor de Arquivos**: Configuraremos um servidor de arquivos para armazenar e compartilhar arquivos pela rede.
* **Armazenamento em Nuvem Privado com Nextcloud**: O Nextcloud fornecerá uma solução de armazenamento em nuvem auto-hospedada, permitindo que você acesse seus arquivos de qualquer lugar.
* **Acesso Sem Fio**: O Unifi C6 Lite fornecerá acesso sem fio à rede.
* **DNS Unbound com Bloqueio de Anúncios**: O DNS Unbound será configurado para bloquear anúncios em toda a rede, melhorando a privacidade e reduzindo o uso de largura de banda.
* **Servidor de Mídia**: Um servidor de mídia permitirá você montar seu "Netflix" caseiro.
* **VPN Privada**: Uma VPN será configurada para permitir acesso remoto seguro à rede.

## O Hardware

Para este projeto, vamos usar:

### MacMini Core 2 Duo de 2010

![Imagem do Macmini Wikimedia](/assets/images/diy-linux-router/macmini.webp)
*Imagem da Wikimedia: [Fonte](https://commons.wikimedia.org/wiki/File:Mac_mini_mid2010_back.jpg)*

Este Mac Mini é antigo e como computador de mesa não tem muita utilidade, mas como servidor, é uma excelente máquina com as seguintes especificações:

* Intel Core 2 Duo 8600 com 2.6GHz.
* 6GB de RAM.
* SSD de 2TB.

### Switch Gerenciável TP-Link TL-SG108E

![TL-SG108E - de www.redeszone.net](/assets/images/diy-linux-router/tl-sg108e.webp)
*redeszone.net*

O TP-Link TL-SG108E é uma ótima escolha para este projeto porque suporta VLANs, que são essenciais para dividir a rede em diferentes segmentos que entraremos mais a fundo na parte 2 desse projeto.

### Ubiquiti Unifi C6 Lite

![Logo do Unifi de Stephen Herber como um prato de jantar](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Antigo post de blog de Stephen Herber sobre [Linux DIY como roteador: Link arquivado na Web](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

O Unifi C6 Lite é um ponto de acesso sem fio confiável com bom alcance e desempenho, tornando-o perfeito para fornecer acesso sem fio à rede.

## Configuração do Linux

Para este projeto, minha ideia é usar o NixOS.
O NixOS é uma ótima escolha por causa de seu modelo de configuração declarativa. Definindo toda a configuração do sistema em um único arquivo `.nix`, é fácil reproduzir a configuração em outra máquina ou reverter alterações se algo der errado. Isso torna o NixOS ideal para um ambiente de servidor onde estabilidade e reprodutibilidade são importantes. Todo este projeto está disponível no meu GitHub (links abaixo).

### 1. Baixar o NixOS

* Baixe o ISO do NixOS no [site oficial](https://nixos.org/download/).
* Crie um pendrive bootável usando uma ferramenta como `dd` ou `Etcher`.
* Inicialize o Mac Mini a partir do pendrive segurando a tecla `Option` durante a inicialização e selecionando o pendrive.

### 2. Habilitar o Serviço SSH

Habilitar o SSH permitirá que você gerencie o Mac Mini remotamente a partir do seu computador desktop, o que é especialmente útil, já que o Mac Mini estará rodando sem monitor ou teclado.

```sh
passwd
# Digite sua senha duas vezes.
sudo systemctl start sshd

# Verifique seu IP
ip --brief addr
```

### 3. Acessar o Mac Mini via SSH

Acesse o Mac Mini usando `ssh` com `Putty` ou algo semelhante, usando o usuário `nixos`.

### 4. Particionar o Disco

Neste setup, vou usar o sistema de arquivos ZFS. É um sistema de arquivos que consome muitos recursos, mas é resiliente, rápido e oferece ótimas opções de backup.

Embora o ZFS consuma muitos recursos, ele oferece várias vantagens que o tornam uma boa escolha. O ZFS fornece excelente integridade de dados por meio de checksumming, suporta snapshots para backups fáceis e é altamente escalável, tornando-o uma ótima escolha para um servidor de arquivos. No entanto, se você achar que o ZFS é mais do que você precisa, **BTRFS** é uma alternativa mais leve que ainda suporta muitos dos recursos do ZFS, como snapshots e backups fáceis. O BTRFS também consome menos recursos, tornando-o uma boa opção para hardware mais antigo.

```bash
sudo -i
parted /dev/sda mklabel gpt
parted /dev/sda mkpart EFI 1MiB 4GiB
parted /dev/sda set 1 esp on
parted /dev/sda mkpart ZFS 4GiB 100%
mkfs.msdos -F 32 -n EFI /dev/sda1
```

### 5. Criar Datasets ZFS

No ZFS, não se usa muito o termo "partição" porque realmente não é. O equivalente é "Datasets", que tem uma abordagem semelhante aos **Volumes BTRFS** no sistema de arquivos BTRFS.
Há uma série de comandos que usaremos para criar nosso zpool e datasets.

* **`ashift=12`**: melhora o desempenho ao trabalhar com SSDs
* **`atime=off`**: Como mencionado neste [artigo](https://www.unixtutorial.org/atime-ctime-mtime-in-unix-filesystems/), sistemas operacionais Unix modernos têm opções de montagem especiais para otimizar o uso de atime.
* **compression=lz4**: Otimiza o espaço de armazenamento comprimindo dados com o algoritmo `lz4` sem sacrificar o desempenho.
* **zattr=sa**: Configurações avançadas de atributos. Necessário para instalar sistemas operacionais baseados em Linux.
* **acltype=posixacl**: Requisito para instalar Linux em um sistema formatado com ZFS.

```bash
zpool create -f -o ashift=12 -O atime=off -O compression=lz4 -O xattr=sa -O acltype=posixacl rpool /dev/sda2
zfs create -o mountpoint=none rpool/root
zfs create -o mountpoint=legacy rpool/root/nixos
zfs create -o mountpoint=legacy rpool/home
```

### 6. Montar os Sistemas de Arquivos

```bash
mount -t zfs rpool/root/nixos /mnt
mkdir /mnt/boot
mount /dev/sda1 /mnt/boot
```

### 7. Gerar a Configuração do NixOS

```bash
nixos-generate-config --root /mnt
```

### 8. Editar a Configuração

Abra o arquivo `/mnt/etc/nixos/configuration.nix` e certifique-se de habilitar o suporte ao ZFS. Adicione as seguintes linhas:

```bash
cat << EOF > /mnt/etc/nixos/configuration.nix
{ config, pkgs, ... }:

{
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.supportedFilesystems = [ "zfs" ];

  fileSystems."/" = {
    device = "rpool/root/nixos";
    fsType = "zfs";
  };

  fileSystems."/boot" = {
    device = "/dev/sda1";
    fsType = "vfat";
  };

  # Definir o hostId para o ZFS
  networking.hostId = "$(head -c 8 /etc/machine-id)";
}
EOF
```

### 9. Instalar o NixOS

Execute o comando de instalação:

```bash
nixos-install
```

### 10. Configuração Pós-Instalação

Uma vez que o NixOS esteja instalado, você pode começar a configurar os serviços que rodarão no seu roteador. Aqui estão alguns dos principais serviços que você vai querer configurar:

* **Nextcloud**: Para armazenamento em nuvem privado.
* **DNS Unbound com Bloqueio de Anúncios**: Para bloquear anúncios em toda a rede.
* **VPN**: Para permitir acesso remoto seguro à sua rede.

Cada um desses serviços pode ser configurado no arquivo de configuração do NixOS (`/etc/nixos/configuration.nix`), facilitando o gerenciamento e a reprodução da sua configuração.

## Conclusão

Ao reutilizar um antigo Mac Mini e usar o NixOS, você criou um roteador Linux poderoso e flexível que pode gerenciar sua rede, fornecer armazenamento em nuvem, bloquear anúncios e muito mais. Esta configuração é altamente personalizável e pode ser expandida com serviços adicionais conforme necessário. Quer você esteja procurando melhorar sua rede doméstica ou apenas queira experimentar o NixOS, este projeto é uma ótima maneira de dar uma nova vida a um hardware antigo.
Isso encerra a primeira parte deste artigo. Na segunda parte, configuraremos nossa rede, incluindo a configuração de VLAN para dividir nossa rede em `privada`, `convidado` e `wan`, além de configurar uma conexão PPPoE e regras básicas de firewall usando `nftables`.
Sinta-se à vontade para conferir o projeto completo no meu [GitHub](http://github.com/cjuniorfox) e compartilhar suas próprias experiências nos comentários!
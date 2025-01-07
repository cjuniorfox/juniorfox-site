---
title: "Roteador Linux DIY - Parte 7 - Compartilhamento de Arquivos"
articleId: "roteador-linux-diy-parte-7-compartilhamento-de-arquivos"
date: "2024-11-25"
author: "Carlos Junior"
category: "Linux"
brief: "Na sétima parte desta série, é hora de adicionar recursos de compartilhamento de arquivos ao nosso servidor."
image: "/assets/images/diy-linux-router/file-sharing.webp"
keywords : ["macmini","roteador", "linux", "nixos", "arquivo", "nas", "smb", "nfs", "compartilhamento", "compartilhamento-de-arquivos"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-7-file-sharing"}]
---

Esta é a sétima parte de uma série sobre como montar seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/diy-linux-router-part-1-initial-setup)
- Parte 2: [Rede e Internet](/article/diy-linux-router-part-2-network-and-internet)
- Parte 3: [Usuários, Segurança e Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Parte 4: [Podman e Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Parte 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- [Armazenamento Impermanente](/article/diy-linux-router-impermanence-storage)

Nos artigos anteriores, instalamos o sistema operacional, configuramos a funcionalidade de internet do gateway usando PPPoE, servidor DNS com unbound e configuramos recursos como Jellyfin e Nextcloud.  
Agora é hora de adicionar recursos de compartilhamento de arquivos ao nosso servidor.

![Compartilhamento de Arquivos](/assets/images/file-sharing.webp)
*Compartilhamento de Arquivos no Macmini*

## Índice

- [Introdução](#introdução)
- [Requisitos](#requisitos)
- [Avahi Daemon](#avahi-daemon)
  - [Firewall para Avahi Daemon](#firewall-para-avahi-daemon)
- [Serviço de Compartilhamento de Arquivos NFS](#serviço-de-compartilhamento-de-arquivos-nfs)
  - [Criar Compartilhamentos ZFS](#criar-compartilhamentos-zfs)
  - [Firewall para ZFS](#firewall-para-zfs)
- [Serviço de Compartilhamento de Arquivos SMB](#serviço-de-compartilhamento-de-arquivos-smb)
  - [Persistir Senhas do SMB](#persistir-senhas-do-smb)
  - [Firewall para SMB](#firewall-para-smb)
- [Reconstruir a Configuração do NixOS](#reconstruir-a-configuração-do-nixos)
- [Usuários SMB](#usuários-smb)
- [Conclusão](#conclusão)

## Introdução

Para um **Core 2 Duo** antigo com **dois núcleos**, temos um servidor bastante funcional rodando o mais recente **Kernel Linux** fazendo muita coisa e com espaço para fazer mais.

Uma das funcionalidades mais solicitadas para um **homelab** é o compartilhamento de arquivos. Ter um servidor de **Compartilhamento de Arquivos** envolve algumas questões importantes, como **RAID** e **Backup**. Ninguém quer acordar de manhã com um SSD quebrado e perceber que tudo o que é importante foi perdido. Não abordamos backup e resiliência neste artigo. Apenas o **Compartilhamento de Arquivos**.

## Requisitos

Antes de configurarmos nosso **servidor de compartilhamento de arquivos**, existem alguns requisitos, conforme segue:

- **Armazenamento** para alocar arquivos.
- **Usuários** para o **compartilhamento SMB**.
- Serviço de **SMB**.
- Serviço de **NFS**.
- Configuração de **Firewall**.

## Avahi-daemon

Para tornar o servidor de arquivos visível na rede, precisamos configurar **avahi-daemon**.
**Avahi-daemon** é um servidor **mDNS** que faz com que diferentes serviços sejam visíveis para a rede. Você pode verificar quais os serviços disponíveis na sua rede disponibilizados pelo **avahi-daemon** usando o comando `avahi-browse -a`.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    ...
    avahi = {
      publish.enable = true;
      publish.userServices = true;
      nssmdns4 = true;
      enable = true;
    };
    ...
  };
}
```

### Firewall para Avahi-daemon

Abra as portas para o serviço **mDNS** na porta `5353` e, opcionalmente, o tráfego **Bonjour**.

`/etc/nixos/nftables/services.nft`

```conf
  chain avahi_server_input {
    udp dport 5353 ct state {new, established } counter accept comment "mDNS"
  }
```

`/etc/nixos/nftables/zones.nft`

```conf
  chain LAN_INPUT {
    ...
    jump avahi_server_input
    ...
  }
```

## Serviço de Compartilhamento de Arquivos NFS

Instale o serviço **NFS**. Basta ativar o **serviço NFS** no nosso arquivo `services.nix`.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    ...
    nfs.server.enable = true;
  };
}
```

### Criar Compartilhamentos ZFS

Como mencionado na [documentação do NixOS](https://nixos.wiki/wiki/ZFS), **ZFS** tem a capacidade de criar compartilhamentos NFS com a propriedade `sharenfs`. No meu caso, não me preocupo em filtrar **IPs** no **serviço NFS** porque todo o tráfego de rede é tratado pelo *NFTables*.

Vou assumir que o **pool de dados** foi nomeado `zdata`. Substitua pelo nome do seu **pool de dados**.

```bash
zfs create -o sharenfs="*(rw,sync,no_subtree_check,no_root_squash)" zdata/srv/Files
```

Crie todos os compartilhamentos que você precisar.

### Firewall para ZFS

Há um conjunto de portas que precisam ser configuradas para que o NFS funcione corretamente. Vamos adicionar os **serviços** necessários e vinculá-los às **zonas** esperadas.

`/etc/nixos/nftables/services.nft`

```conf
  chain nfs_server_input {
    tcp dport 2049 ct state {new, established } counter accept comment "Servidor NFS"
  }
```

`/etc/nixos/nftables/zones.nft`

```conf
  chain LAN_INPUT {
    ...
    jump nfs_server_input
    ...
  }
```

## Serviço de Compartilhamento de Arquivos SMB

O compartilhamento de arquivos do Windows é gerenciado pelo serviço **SMB (Server Message Block)**. Vamos criar o serviço **Samba** para o nosso servidor.

No exemplo abaixo, faço uso do **compartilhamento NFS** criado anteriormente. Você pode criar compartilhamentos distintos para **SMB** e **NFS** como desejar, e também pode configurar backups do Time Machine para **Macs Apple** se quiser. Mais informações podem ser encontradas na [Wiki do NixOS](https://nixos.wiki/wiki/Samba).

`/etc/nixos/modules/smb.nix`

```nix
{ config, pkgs, ... }:

{
  services.samba = {
    enable = true;
    securityType = "user";
    extraConfig = ''
      workgroup = WORKGROUP
      security = user
    '';

    shares = {
      "Files" = {
        path = "/srv/Files";
        browseable = true;
        readOnly = false;
        guestOk = false;
      };
    };
  };
  services.samba-wsdd.enable = true;
  environment.etc."avahi/services/samba.service".text = ''
  <?xml version="1.0" standalone='no'?>
  <!DOCTYPE service-group SYSTEM "avahi-service.dtd">
  <service-group>
    <name replace-wildcards="yes">%h</name>
    <service>
      <type>_smb._tcp</type>
      <port>445</port>
    </service>
    <service>
      <type>_device-info._tcp</type>
      <port>0</port>
      <txt-record>model=Macmini</txt-record>
    </service>
    <service>
      <type>_adisk._tcp</type>
      <txt-record>dk0=adVN=timemachine,adVF=0x82</txt-record>
      <txt-record>sys=waMa=0,adVF=0x100</txt-record>
    </service>
  </service-group>
  '';
}
```

Adicione o arquivo de configuração ao `configuration.nix`.

`/etc/nixos/configuration.nix`

```nix
  imports =
    [
      ...
      ./modules/smb.nix
      ... 
    ]
```

### Persistir Senhas do SMB

O Samba gerencia suas próprias senhas persistindo os dados na pasta `/var/lib/samba/private/`. Se você escolher instalar o sistema de arquivos como impermanente, você precisa adicionar o caminho mencionado neste arquivo ao `/etc/nixos/modules/impermanence.nix`. Caso não escolha instalar o sistema de arquivos como impermanente, você pode pular este passo.

`/etc/nixos/modules/impermanence.nix`

```nix
  ...
  environment.persistence."/nix/persist/system" = {
    hideMounts = true;
    directories = [
      "/var/lib/nixos"
      "/var/lib/samba/private/" #Adicione este caminho. Deixe o resto do arquivo como está.
    ];
    ...
  };
  ...
```

### Firewall para SMB

Para permitir conexões **SMB** e o serviço **WSDD (Web Services Discovery Daemon)** no nosso servidor, precisamos abrir as seguintes portas:

#### Portas SMB

- **TCP 139**: Serviço de Sessão NetBIOS.
- **TCP 445**: SMB direto sobre TCP.

#### Portas WSDD

- **UDP 3702**: Protocolo de descoberta multicast Web Services Dynamic Discovery.

Segue a configuração:

`/etc/nixos/nftables/services.nft`

```conf
  chain smb_server_input {
    tcp dport 139 ct state {new, established } counter accept comment "Serviço NetBIOS SMB"
    tcp dport 445 ct state {new, established } counter accept comment "Serviço SMB sobre TCP"
  }

  chain wsdd_discovery_input {
    udp dport 3702 ct state {new, established } counter accept comment "Descoberta de serviço WSDD"
  }
```

`/etc/nixos/nftables/zones.nft`

```conf
  chain LAN_INPUT {
    ...
    jump smb_server_input
    jump wsdd_discovery_input
    ...
  }
```

## Reconstruir a Configuração do NixOS

Por fim, reconstrua a configuração do NixOS com o comando:

```bash
sudo nixos-rebuild switch
```

## Usuários SMB

Agora precisamos adicionar os usuários como **usuários SMB** para que possam acessar o servidor:

```bash
sudo smbpasswd -a username
```

## Conclusão

Agora você pode acessar seu **Servidor de Arquivos** a partir de máquinas **Windows** e **Linux**.

### Acesso SMB no Windows

Basta acessar o compartilhamento SMB abrindo `\\[ip_do_servidor]\Files`.

### Acesso NFS no Linux

Use o seguinte comando para montar um compartilhamento NFS:

```bash
sudo mount -t nfs [ip_do_servidor]:/srv/Files /mnt
```

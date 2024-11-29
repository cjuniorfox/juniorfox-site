---
title: "Roteador Linux - Parte 8 - Backup"
articleId: "roteador-linux-parte-8-backup"
date: "2024-11-25"
author: "Carlos Junior"
category: "Linux"
brief: "Na oitava parte desta série, configuramos uma rotina de backup para o nosso servidor."
image: "/assets/images/diy-linux-router/backup.webp"
keywords: ["macmini", "roteador", "linux", "nixos", "arquivo", "backup", "python", "raid", "compartilhamento", "compartilhamento-de-arquivos"]
lang: "pt"
other-langs: [{"lang":"en","article":"diy-linux-router-part-8-backup"}]
---

Esta é a oitava parte de uma série multi-parte que descreve como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 3: [Usuários, Segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wi-Fi](/article/roteador-linux-parte-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)
- Parte 7: [Compartilhamento de Arquivos](/article/roteador-linux-parte-7-compartilhamento-de-arquivos)
- [Armazenamento Impermanente](/article/roteador-linux-armazenamento-impermanente)

Nas partes anteriores, instalamos o sistema operacional, configuramos a funcionalidade de gateway para a internet usando PPPoE, configuramos um servidor DNS com Unbound e implantamos serviços como Jellyfin, Nextcloud e um servidor de arquivos. Agora, vamos estabelecer uma rotina de backup confiável.

![Backup](/assets/images/backup.webp)
*Backup*

## Índice

- [Introdução](#introdução)
- [Backups Automáticos](#backups-automáticos)
- [Configurar Infraestrutura](#configurar-infraestrutura)
- [Rotina de Backup](#rotina-de-backup)
- [Conclusão](#conclusão)

## Introdução

É impressionante o quanto é possível fazer com este velho **Mac Mini**. No entanto, todo o este esforço pode ser em vão uma falha catastrófica provocar a perda de todos os seus dados. Serviços importantes como **Servidor de Arquivos**, **Nextcloud** e **Jellyfin** podem significar a perda de memórias preciosas, como fotos de viagens ou documentos importantes. Ter uma rotina de backup sólida é essencial para garantir a segurança dos seus dados.

Vamos esclarecer uma questão importante: **Backup** não é o mesmo que **RAID**. Embora o **RAID-1**, por exemplo, forneça espelhamento de disco em tempo real para evitar a perda de dados em caso de falha de um único disco, ele não resolve todos os problemas que podem acontecer, como:

- Corrupção de dados;
- Falhas catastróficas do sistema operacional;
- Danos elétricos que afetam todos os dispositivos de armazenamento;
- Malware ou vírus;
- Brechas de segurança que levam à perda de dados.

O **RAID** sozinho não protegerá contra essas ameaças. Rotinas de backup são fundamentais para garantir a preservação dos dados. Uma boa solução de backup deve seguir estes princípios:

- Backups agendados regularmente.
- Dados armazenados em pelo menos três locais diferentes.
- Dispositivos de backup que possam ser facilmente desconectados.
- Evitar manter dispositivos de backup sempre conectados ou montados.

## Backups Automáticos

Sistemas de arquivos modernos como **ZFS** e **BTRFS** tornam snapshots e backups mais simples. Com essas ferramentas, você pode:

1. Tirar fotografias (snapshots) do sistema de arquivos.
2. Enviar esses snapshots para outro dispositivo de bloco, dataset (ZFS) ou volume (BTRFS).
3. Armazenar backups incrementais em arquivos comprimidos para restauração posterior.

Embora esse processo possa ser manual, a automação é mais prática. Desenvolvi um script em **Python** para simplificar isso, realizando tarefas como:

1. Criar snapshots de todos os **volumes/datasets**.
2. Montar o **dispositivo de bloco** de destino, como um **HDD externo** ou **servidor NFS**.
3. Enviar backups incrementais comprimidos em formato `gz`.

Como backups incrementais podem gerar muitos arquivos, também escrevi um script `restore.py` para restaurar todos os snapshots em um disco de destino.

Na minha configuração, utilizo um antigo **LaCie NAS**, que, embora lento pelos padrões atuais, é um excelente destino de backup.

> **Nota:** Backups armazenados em dispositivos de rede podem representar riscos de segurança. Certifique-se de que seus backups estejam protegidos contra acessos não autorizados.

### Plano de Rotina de Backup

1. Backups serão executados todos os **domingos**, **terças** e **sextas-feiras** às **1h da manhã**.
2. O destino do backup é um **compartilhamento NFS**.
3. O destino será montado apenas durante o processo de backup, assim é possível desligar o **NAS** após a conclusão do mesmo.

## Configurar Infraestrutura

### Configurar Destino do Backup

Utilizo um antigo **LaCie-d2 NAS** rodando **Debian 12**. Apesar de ser um dispositivo com 15 anos de uso, ele lida bem com compartilhamentos NFS. O NAS está conectado à rede **LAN** e recebe seu endereço IP via **DHCP**. Para garantir a estabilidade do Ip sempre que realizarmos o backup. Vamos atribuir um **Static Lease** (IP Fixo) através do **servidor DHCP do Mac Mini**.

`/etc/nixos/modules/networking.nix`

```nix
systemd.network = {
  ...
  networks = {
    ...
    "10-${lan}" = {
      ...
      dhcpServerConfig = {
        ## Configuração de exemplo
      };
      dhcpServerStaticLeases = [{
        dhcpServerStaticLeaseConfig = {
          Address = "10.1.78.3"; ## IP estático do NAS
          MACAddress = "54:42:3b:27:31:41"; ## Endereço MAC do NAS
        };
      }];
    }
    ...
  };
}
```

Para encontrar o endereço MAC do seu NAS, execute o comando abaixo após realizar um `ping` ao seu dispositivo:

```bash
arp -a [IP do NAS]
```

### Rotina de Backup

O script **Backup Daily** está disponível publicamente no [meu Github](https://github.com/cjuniorfox/backup-daily). Obtenha o **link do arquivo** e calcule seu hash `sha256`:

#### 1. Extraia o Valor `sha256`

```bash
nix-prefetch-url https://raw.githubusercontent.com/cjuniorfox/backup-daily/main/opt/backup-daily/backup.py
```

Saída:

```txt
path is '/nix/store/v7g4qc9dn86is33rcsgkk5z2h6sz1vq0-backup.py'
12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414
```

Copie o valor do hash: `12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414`.

#### 2. Crie o Arquivo `backup-daily.nix`

Crie um serviço para baixar e executar o script de backup.

`/etc/nixos/modules/backup-daily.nix`

```nix
{ config, pkgs, ... }:
let
  backupScriptSource = pkgs.fetchurl {
    url = "https://raw.githubusercontent.com/cjuniorfox/backup-daily/main/opt/backup-daily/backup.py";
    sha256 = "12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414";
  };
  backupDaily = pkgs.writeTextFile {
    name = "backup-daily.py";
    text = builtins.readFile backupScriptSource;
  }; 
in {
  systemd.services.backup-daily = {
    description = "Backup ZFS Filesystem";
    serviceConfig = {
      Type = "oneshot";
      Environment = "PATH=${pkgs.coreutils}/bin:${pkgs.util-linux}/bin:${pkgs.zfs}/bin:${pkgs.bash}/bin:${pkgs.pv}/bin:${pkgs.pigz}/bin";
      ExecStart = "${pkgs.python3}/bin/python3 ${backupDaily} --fs-type=zfs --block-device 10.1.18.3:/srv/Files --mountpoint /tmp/_backup";
    };
  };

  systemd.timers.backup-daily = {
    description = "Run Backup ZFS Filesystem";
    timerConfig = {
      OnCalendar = "Mon,Wed,Sat 01:00:00";
      Persistent = true;
    };
    wantedBy = [ "timers.target" ];
  };
}
```

### Overview dos parâmetros

- `fs-type=zfs`: Tipo do sistema de arquivos a se realizar o backup.
- `--block-device`: Dispositivo de bloco ou compartilhamento de rede onde o backup será realizado.
- `--mountpoint`: Diretório onde será montado o destino do backup.

Opções adicionais:

- `--options`: Opções de montagem para montar o destino de backup como credenciais SMB.
- `--print-fs-list`: Lista os volumes/datasets a ser realizado o backup sem aplicar o mesmo.

## Conclusão

Esta rotina de backup atende a duas necessidades principais:

1. Backups automatizados.
2. Snapshots para recuperação rápida.

Com esta rotina, você reduz significativamente o risco de perda de dados. Para maior proteção, considere adicionar backups em nuvem ou destinos adicionais. Obrigado por ler e espero que este artigo ajude você a proteger seus dados!

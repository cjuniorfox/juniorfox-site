---
title: "DIY Linux Router - Part 8 - Backup"
articleId: "diy-linux-router-part-8-backup"
date: "2024-11-25"
author: "Carlos Junior"
category: "Linux"
brief: "In the eight part of this series, making backup of our server."
image: "/assets/images/diy-linux-router/backup.webp"
keywords : ["macmini","router", "linux", "nixos", "file", "backup", "python", "raid", "sharing", "file-sharing"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-8-backup"}]
---

This is the seventh part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- Part 7: [File Sharing](/article/diy-linux-router-part-7-file-sharing)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, DNS server with unbound and configured resources like Jellyfin and Nextcloud and create a file server.
Let's define a backup routing.

![Backup](/assets/images/backup.webp)
*Backup*

## Table of Contents

- [Introduction](#introduction)
- [Automatic Backups](#automatic-backups)
- [Set up Infrastructure](#set-up-infrastructure)
- [Backup Routine](#backup-routine)

## Introduction

Is quite impressive a lot of things that is being done with this, otherwise retired, **Mac Mini**, but everything can fall apart if something happens and we lost all the data, and far as there's important services, like **File Server**, **Nextcloud** and **Jellyfin** this could means losing the fotos for that travel, the newborn images of your son, important documents. So, having a good backup routing is essential to avoid losing important data.

Be aware that **Backup** is not equal **RAID**. **RAID**, especially **RAID-1** is a real-time mirroring for content of the disk. If one of the disks fails, the another one will let the system with the data working. This is great, but is not the only solution as a whole because other issues can happen. Example:

- Data corruption.
- Catastrophic operating system failure.
- Electric failure, damaging all storage devices.
- Viruses.
- Security hole, leading to an invasion and damaging the data.

**RAID** will not protect for none of these problems, so having extenal backup routine is fundamental to garantee that even on these situations, you don't lose important data. To have a reliable backup solution, I follow some guidelines:

- Make backups routinely.
- Important data into at least three different locations.
- The storage device being easlily detachable from the system.
- Does not keep backup block devices always connected or mounted to this server.

## Automatic Backups

**ZFS** and **BTRFS** can easily take snapshots of it's filesystem, as also eases sending those snapshots to another **block storage** as a dataset (**ZFS**) or volume (**BTRFS**), or even as incremental backup file, that can be stored on wherever you have to store files, to be imported afterwards. You can do this process manually from time to time, or create a **script** that does this job for you.

Luckly, I did a **Python** script aimed to make backup for the whole **ZFS** or **BTRFS** filesystem. This script does as follows:

1. Take snapshots of all **volumes/datasets**.
2. Mount the target **block device**, this being a **External HDD**, **NFS server**,  whatever you want.
3. Send those **snapshots** as incremental backups compressed as `gz`.

Because the incremental backup can end up creating too many files, there's also another script named `restore.py` which can restore of all the snapshots on a intended target disk.

Luckily, I also have a ancient **LaCie-NAS** that I don't use on daily basis, because is painfully slot for today standards, but still works and is a great target disk to store my backups.

Be aware that having a backup of important data laying around can be a security hole. Mainly if you do your backups on **Network Storage**. If you do not take the correct precautions, this data can leak and be exploited for somone else.

With that in mind, let's setup our backup routine as follows:

1. The backup will occur every **Sunday**, **Tuesday** and **Friday** at **1:00 AM**.
2. The **target** will be a **NFS Share**.
3. The **target** will be mounted only during the **backup** process and will be ejected after that, so I can shut down the **NAS** afterwards.

## Set up infrastructure

First of all, we need to set our backup target. In my case, a old **LaCie-d2** modified to run **Debian 12**. Is quite impressive see this 15-years-old low-spec NAS executing the latest version of **Debian**.
The Nas already has their **NFS Shares** set. The **LaCie-d2** is connected to the ***LAN** network and obtain it's IP though **DHCP**. Let's define a **Static Lease** for it on **Mac Mini DHCP server's configuration**.

`/etc/nixos/modules/networking.nix`

```nix
systemd.network = {
  ...
  networks = {
    ...
    "10-${lan}" = {
      ...
      dhcpServerConfig = {
        ## Just for orientation. 
        ## Leave this content as is
      };
      dhcpServerStaticLeases = [{
        dhcpServerStaticLeaseConfig = {
          Address = "10.1.78.3"; ## Intended IP
          MACAddress = "54:42:3b:27:31:41"; ## NAS's MAC Address
        };
      }];
    }
    ...
  };
}
```

If you do not know what is the Mac Adress of the NAS, you can check by running `arp -a [Current IP]`. Remember to ping to server first to register it at the `arp` table.

## Backup routine

The script **Backup Daily** is public available on [cjuniorfox's Gibhub](https://github.com/cjuniorfox/backup-daily). Retrieve the **raw link** and extract the `sha256` for the file.

### 1. Extract the sha256 value

```bash
nix-prefetch-url https://raw.githubusercontent.com/cjuniorfox/backup-daily/main/opt/backup-daily/backup.py
```

```txt
path is '/nix/store/v7g4qc9dn86is33rcsgkk5z2h6sz1vq0-backup.py'
12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414
```

The value `12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414` is current `sha256` for `backup-daily.py` at the **main** repository. As this script is updated, this value can change. Extract it and copy the value.

### 2. Create the backup-daily.nix file

Let's create the service for the backup. With one file, we will:

- Download the script from [this path](https://raw.githubusercontent.com/cjuniorfox/backup-daily/main/opt/backup-daily/backup.py).
- Create the **Systemd's** `backup-daily.service` with the **backup command**.
- Set up the timer to execute the every **Monday**, **Wednesday** and **Saturday** at **1:00 AM**.

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

The `ExecStart` calls the backup routine with its arguments. The command I'm using is:
`python3 backup-daily.py --fs-type=zfs --block-device 10.1.78.3:/srv/Backup --mountpoint /tmp/_backup`, but replacing `python3` with its **NixOS** package and `backup-daily.sh` with the content for the script downloaded at the step `backupScriptStore`.

#### Understanding the parameters

- `fs-type=zfs`: The intended filesystem. This script is capable to identify it you're using `zfs` or `btrfs`, but it does by checking the `root` filesystem. The filesystem for the data you want to backup differs from the filesystem for `root`, you have to set this value manually as I did.
- `--block-device 10.1.78.3:/srv/Backup` : The **NFS** mountpoint I'm using to backup. It can be a block device for an **external HDD** , **Samba share**, whatever device your Linux is capable to mount as a **Block Device**.
- `--mountpoint /tmp/_backup` : The **target folder** where the mountpoint for the device will be mounted on.

There's also another parameters, like:

- `--options` : Mount options if you need for **backup target**, like **Samba** **username** and **password** or some needed mount option.
- `--print-fs-list` :  Does not make the backup. Just list what **volumes/datasets** will be backuped.

## Conclusion

With this backup routine, we addressed two important things to do on our server as:

- Backup routines.
- Automatic Snapshots.

Maintaining your backup routine, you almost garantee that you never will lose data. You can create more than one backup routine to more targets or even additional steps, like saving the data in the Cloud. there's many possibilities. Thank you for reading this article. I expect to be helpful with your backup solution.

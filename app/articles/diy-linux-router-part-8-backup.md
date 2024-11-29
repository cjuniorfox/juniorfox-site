---
title: "DIY Linux Router - Part 8 - Backup"
articleId: "diy-linux-router-part-8-backup"
date: "2024-11-25"
author: "Carlos Junior"
category: "Linux"
brief: "In the eighth part of this series, we set up a backup routine for our server."
image: "/assets/images/diy-linux-router/backup.webp"
keywords : ["macmini","router", "linux", "nixos", "file", "backup", "python", "raid", "sharing", "file-sharing"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-8-backup"}]
---

This is the eighth part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security, and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wi-Fi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- Part 7: [File Sharing](/article/diy-linux-router-part-7-file-sharing)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, set up a DNS server with Unbound, and deployed services like Jellyfin, Nextcloud, and a file server. Now, let’s establish a reliable backup routine.

![Backup](/assets/images/backup.webp)
*Backup*

## Table of Contents

- [Introduction](#introduction)
- [Automatic Backups](#automatic-backups)
- [Set Up Infrastructure](#set-up-infrastructure)
- [Backup Routine](#backup-routine)
- [Conclusion](#conclusion)

## Introduction

It’s quite impressive how much can be achieved with this otherwise retired **Mac Mini**. However, all your efforts could be in vain if something happens to your data. Important services like **File Server**, **Nextcloud**, and **Jellyfin** could mean losing cherished memories like travel photos, newborn pictures, or critical documents. Having a solid backup routine is essential to ensure your data is safe.

Let’s clarify an important distinction: **Backup** is not the same as **RAID**. While **RAID-1**, for instance, provides real-time disk mirroring to prevent data loss from a single disk failure, it doesn’t address broader issues like:

- Data corruption
- Catastrophic operating system failure
- Electrical failure damaging all storage devices
- Malware or viruses
- Security breaches leading to data loss

**RAID** alone won’t protect against these threats. External backup routines are critical to ensure data preservation in these scenarios. A good backup solution should follow these principles:

- Regularly scheduled backups.
- Data stored in at least three different locations.
- Backup devices that can be easily detached.
- Avoid keeping backup devices always connected or mounted.

## Automatic Backups

Modern filesystems like **ZFS** and **BTRFS** make snapshots and backups easy. These tools enable you to:

1. Take snapshots of the filesystem.
2. Send those snapshots to another block device, a dataset (ZFS), or a volume (BTRFS).
3. Store incremental backups in compressed files for later restoration.

This process can be manual, but automation is more practical. I’ve developed a **Python** script to streamline this, performing tasks such as:

1. Taking snapshots of all **volumes/datasets**.
2. Mounting the target **block device**, like an **external HDD** or **NFS server**.
3. Sending incremental backups compressed as `gz`.

Since incremental backups can generate many files, I also wrote a `restore.py` script to restore all snapshots to a target disk.

In my setup, I utilize an older **LaCie NAS**, which, despite being slow by today’s standards, is an excellent backup target.

> **Note:** Backups stored on network devices can be a security risk. Ensure your backups are secure to prevent unauthorized access.

### Backup Routine Plan

1. Backups will run every **Sunday**, **Tuesday**, and **Friday** at **1:00 AM**.
2. The backup target is an **NFS share**.
3. The target will only be mounted during the backup process, after which the NAS will be powered down.

## Set Up Infrastructure

### Configure Backup Target

I use an old **LaCie-d2 NAS** running **Debian 12**. Although it’s a 15-year-old device, it handles NFS shares reliably. The NAS is connected to the **LAN** network and receives its IP address via **DHCP**. I’ve assigned it a static lease in the **Mac Mini’s DHCP server configuration**.

`/etc/nixos/modules/networking.nix`

```nix
systemd.network = {
  ...
  networks = {
    ...
    "10-${lan}" = {
      ...
      dhcpServerConfig = {
        ## Placeholder configuration
      };
      dhcpServerStaticLeases = [{
        dhcpServerStaticLeaseConfig = {
          Address = "10.1.78.3"; ## NAS's static IP
          MACAddress = "54:42:3b:27:31:41"; ## NAS's MAC Address
        };
      }];
    }
    ...
  };
}
```

To find your NAS’s MAC address, run the command below after pinging the device:

```bash
arp -a [current IP]
```

### Backup Routine

The **Backup Daily** script is publicly available on [cjuniorfox’s GitHub](https://github.com/cjuniorfox/backup-daily). Retrieve the **raw link** and calculate its `sha256` hash:

#### 1. Extract the `sha256` Value

```bash
nix-prefetch-url https://raw.githubusercontent.com/cjuniorfox/backup-daily/main/opt/backup-daily/backup.py
```

Output:

```txt
path is '/nix/store/v7g4qc9dn86is33rcsgkk5z2h6sz1vq0-backup.py'
12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414
```

Copy the hash value `12w37f5q5hm94g4hcd7acp7d734csjzazqgj78vgqm5s5x1wd414`.

#### 2. Create the `backup-daily.nix` File

Create a service to download and run the backup script.

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

### Parameter Overview

- `fs-type=zfs`: Filesystem type for the data to be backed up.
- `--block-device`: Target device or share.
- `--mountpoint`: Directory to mount the backup target.

Additional options include:

- `--options`: Mount options for backup targets like SMB credentials.
- `--print-fs-list`: Lists volumes/datasets to be backed up without performing the backup.

## Conclusion

This backup routine addresses two key needs:

1. Automated backups.
2. Snapshots for quick recovery.

By maintaining this routine, you greatly reduce the risk of data loss. For further protection, consider adding cloud backups or additional targets. Thank you for reading, and I hope this article helps you secure your data!

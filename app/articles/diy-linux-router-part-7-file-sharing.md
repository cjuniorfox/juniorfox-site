---
title: "DIY Linux Router - Part 7 - File Sharing"
articleId: "diy-linux-router-part-7-file-sharing"
date: "2024-11-25"
author: "Carlos Junior"
category: "Linux"
brief: "In the seventh part of this series, it's time to add file sharing capabilities to our server."
image: "/assets/images/diy-linux-router/file-sharing.webp"
keywords : ["macmini","router", "linux", "nixos", "file", "nas", "smb", "nfs", "sharing", "file-sharing"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-7-compartilhamento-de-arquivos"}]
---

This is the seventh part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, DNS server with unbound and configured resources like Jellyfin and Nextcloud.  
It's time to add file sharing capabilities to our server.

![File Sharing](/assets/images/file-sharing.webp)
*File Sharing Macmini*

## Table of Contents

- [Introduction](#introduction)
- [Requirements](#requirements)
- [NFS File Sharing Service](#nfs-file-sharing-service)
  - [Create ZFS Shares](#create-zfs-shares)
  - [Firewall for ZFS](#firewall-for-zfs)
- [SMB File Sharing Service](#smb-file-sharing-service)
  - [Firewall for SMB](#firewall-for-smb)
- [Avahi Daemon](#avahi-daemon)
  - [Firewall for Avahi Daemon](#firewall-for-avahi-daemon)
  - [Rebuild NixOS Configuration](#rebuild-nixos-configuration)
- [SMB Users](#smb-users)
- [Conclusion](#conclusion)

## Introduction

For an old **Core 2 Duo** with **two cores**, we have a fairly functional server running the latest **Linux Kernel** doing a lot and with space for doing more.

One of the most requested functionality for a **homelab** is file sharing. Having a File Sharing server, there's some important stuff that needs to be addressed like **RAID** and **Backup**. Nobody wants to wake up in the mourning with a broken SSD and realize that all important stuff you have on the server was lost. We don't approach backup and resilience in this article. Just the **File sharing**.

## Requirements

Before configuring our **File sharing server** there's some requirements, as follows:

- **Storage** for allocating files.
- **Users** for **SMB** File sharing.
- **SMB** File sharing service.
- **NFS** File sharing service.
- **Firewall** configuration.

## NFS File Sharing Service

Install the NFS Service. It's a matter of enabling the **NFS Service** on our `services.nix` file.

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

### Create ZFS Shares

As mentioned at the **ZFS** article on [NixOS wiki](https://nixos.wiki/wiki/ZFS), **ZFS** has the capability to create NFS shares with the `sharenfs` property. In my case, I don't bother to filtering **IPs** on the **NFS service** itself because all my network traffic is being handled by *NFTables*.

I'll assume that the **data pool** was named `zdata`. Replace by your **data pool** name.

```bash
zfs create -o sharenfs="*(rw,sync,no_subtree_check,no_root_squash)" zdata/srv/Files
```

Create all shares you need.

### Firewall for ZFS

There's a set of ports that needs to be configured to have NFS working as intended. Let's add the intended **services** and tie it to the expected **zones**.

`/etc/nixos/nftables/services.nft`

```conf
  chain nfs_server_input {
    tcp dport 2049 ct state {new, established } counter accept comment "NFS Server"
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

## SMB File Sharing Service

Windows shares are managed by **SMB (Server Message Block)** service. Let's create the **Samba** service for our server.

In the example below, I make use of the **NFS** share created beforehand. You can create distinct shares for **SMB** and **NFS** as you wish, and can configure Time Machine backups for **Apple Macs** if you want to do so. More information at [NixOS's Wiki](https://nixos.wiki/wiki/Samba)

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
}
```

Add the configuration file to `configuration.nix`

`/etc/nixos/configuration.nix`

```nix
  imports =
    [
      ...
      ./modules/smb.nix
      ... 
    ]
```

### Firewall for SMB

To allow **SMB** connections and **WSDD (Web Services Discovery Daemon)** in our server, we need to open the following ports:

#### SMB Ports

- **TCP 139**: NetBIOS Session Service.
- **TCP 445**: Direct SMB over TCP.

#### WSDD Ports

- **UDP 3702**: Web Services Dynamic Discovery multicast protocol.

Follows the configuration:

`/etc/nixos/nftables/services.nft`

```conf
  chain smb_server_input {
    tcp dport 139 ct state {new, established } counter accept comment "SMB NetBIOS Session Service"
    tcp dport 445 ct state {new, established } counter accept comment "SMB Service over TCP"
  }

  chain wsdd_discovery_input {
    udp dport 3702 ct state {new, established } counter accept comment "WSDD Service discovery"
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

## Avahi-daemon

So far, both **SMB services** and **NFS Shares** are enabled. Windows machines can see **SMB Shares** thanks to the **WSDD** service. But to make those shares discoverable to the network, we need to install another service named **avahi daemon**.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    envfs.enable = true;
    openssh = {
      enable = true;
      settings.PermitRootLogin = "no";
      settings.PasswordAuthentication = false;
    };
    nfs.server.enable = true;
    avahi = {
      publish.enable = true;
      publish.userServices = true;
      nssmdns4 = true;
      enable = true;
    };
  };
}
```

### Firewall for Avahi-daemon

Open the ports for **mDNS** service `5353` and, optionally, **LLMNR** service `5355`.

`/etc/nixos/nftables/services.nft`

```conf
  chain llmnr_input {
    udp dport 5355 ct state {new, established } counter accept comment "LLMNR (Avahi Service Discovery)"
  }
  chain mdns_input {
    udp dport 5353 ct state {new, established } counter accept comment "mDNS (Avahi Service Discovery)"
  }
```

`/etc/nixos/nftables/zones.nft`

```conf
  chain LAN_INPUT {
    jump llmnr_input
    jump mdns_input
  }
```

### Rebuild NixOS configuration

Rebuild  **NixOS** configuration to enable installed services

```bash
nixos-rebuild switch
```

## SMB Users

To allow users to connect to SMB Shares, you need to add those users as SMB users.

```bash
sudo smbpasswd -a username
```

## Conclusion

Now you can access your **File Server** from your **Windows** and **Linux** machines.

### Windows SMB Access

Simply access the SMB share by opening `\\[server_ip]\Files`.

### Linux NFS Access

Use the following command to mount an NFS share:

```bash
sudo mount -t nfs [server_ip]:/srv/Files /mnt
```

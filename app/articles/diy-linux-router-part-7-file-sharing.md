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
- [Avahi Daemon](#avahi-daemon)
  - [Firewall for Avahi Daemon](#firewall-for-avahi-daemon)
- [NFS File Sharing Service](#nfs-file-sharing-service)
  - [Create ZFS Shares](#create-zfs-shares)
  - [Firewall for ZFS](#firewall-for-zfs)
- [SMB File Sharing Service](#smb-file-sharing-service)
  - [Persist SMB passwords](#persist-smb-passwords)
  - [Firewall for SMB](#firewall-for-smb)
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

## Avahi-daemon

To make the file sharing server discoverable on the network, we need to configure **avahi-daemon**.
**Avahi-daemon** is a **mDNS** server that can make different services visible to the network. You can check what are the available services on the network using the command `avahi-browse -a`.

Add `avahi-daemon` service to your `services.nix` file.

`/etc/nixos/modules/services.nix`

```nix
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
zfs create -o sharenfs="rw,sync,no_subtree_check,no_root_squash" zdata/srv/Files
```

Create all shares you need.

### Firewall for ZFS

There's a set of ports that needs to be configured to have NFS working as intended. Let's add the intended **services** and tie them to the expected **zones**.

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

### Persist SMB passwords

Samba manages its own passwords by persisting the data at the path `/var/lib/samba/private/`. If you choose to set the root filesystem as impermanent, you have to add the aftermentioned path to the `/etc/nixos/modules/impermanence.nix`. If you not choose to setup the root filesystem as impermanent, you can skip this step.

`/etc/nixos/modules/impermanence.nix`

```nix
...
  environment.persistence."/nix/persist/system" = {
    hideMounts = true;
    directories = [
      "/var/lib/nixos"
      "/var/lib/samba/private/" #Add this entry. Leave the rest of the file as is.
    ];
    ...
  };
  ...
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

## Rebuild NixOS configuration

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

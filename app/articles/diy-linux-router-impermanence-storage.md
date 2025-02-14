---
title: "DIY Linux Router - Impermanence Storage"
articleId: "diy-linux-router-impermanence-storage"
date: "2024-11-21"
author: "Carlos Junior"
category: "Linux"
brief: "Giving a new life to an old Mac Mini as a capable Linux Router and homelab. Configuring storage for impermanence."
image: "/assets/images/diy-linux-router/hard-disk.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-armazenamento-nao-permanente"}]
---

This is part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)

In the [part 1](/article/diy-linux-router-part-1-initial-setup) of this series, the initial setup was installing **NixOS** on the **Mac Mini** as usual. We configured our partitions, and as we are doing everything using **ZFS**, we created our **Datasets**. But as our server will be connected directly to the internet, there are security measures I have to take to keep our server secure as possible and an optional step we can do as configuring the `root` filesystem as **impermanent storage**.

![Hard Disk](/assets/images/diy-linux-router/hard-disk.webp)
*Source:[Deskdecode.com](https://www.deskdecode.com/)*

## Table of Contents

- [Impermanent Storage](#impermanent-storage)
- [Advantages](#advantages)
- [Disavantages](#disavantages)
- [Setup](#setup)
  1. [Create the impermanence.nix configuration file](#1-create-the-impermanencenix-configuration-file)
  2. [Add the newly created file to configuration.nix](#2-add-the-newly-created-file-to-configurationnix)
  3. [Set root mountpoint as tmpfs on hardware-configuration.nix file](#3-set-root-mountpoint-as-tmpfs-on-hardware-configurationnix-file)
  4. [Rebuild the system](#4-rebuild-the-system)
  5. [Reboot](#5-reboot)
- [Conclusion](#conclusion)

## Impermanent storage

As standard, many Linux distributions follow what is called the **POSIX Structure**. meaning that there's a **root** filesystem identified by `/` path and there are expected folders on this path, being:

- `/bin` - general commands.
- `/dev` - as the **devices** path, like **storage blocks**, **videocards** and **serial ports**.
- `/etc` - with configuration files managed by the system administrator.
- `/home` - containing the **home** folder for users.
- `/lib` - with libraries to be used by programs.
- `/var` - containing configuration files managed by programs.
- `/sbin` - Administrator commands.
- `/sys` - Drivers and device paths.

However, **NixOS** does not follows the **POSIX Structure**. Instead, everything is stored at `/nix` as **read-only** and those standard paths are simply **symbolic links** to paths inside `/nix` for usability and compatibility.
The main paths for NixOS are:

- `/nix` - Where **NixOS** is currently installed.
- `/etc/nixos` - **NixOS** configuration files.
- `/var/lib/nixos` - Runtime **NixOS** configuration.

TTo boot up the system, apart from the `/nix` path, everything can be mounted as temporary. Doing as is, it guarantees that every boot will be a clean installation and this is a good security measure.

Here I will configure the `root` filesystem as impermanent, only persisting what matters to have a properly working server with the intended services. Let's state what we want to persist.

- NixOS Configuration `/etc/nixos` and `/var/lib/nixos`
- SSH Keys `/etc/ssh/keys*`
- Mountpoints on `zdata` storage pool, like `home` folders and **Podman** files.

## Advantages

- You have a clean installation on every reboot. If something goes wrong, simply rebooting will restore the system to its expected state.

## Disavantages

- You could lose some important settings needed for certain programs or services. Make sure to create a **ZFS dataset** or configuring this path on `impermanence.nix` to make sure that the intended path needed to be persisted will be persisted.
- As the `root` filesystem and every path is stored as a temporary, there's an additional amount of RAM spent to store files that should be persisted to disk.

## Setup

### 1. Create the impermanence.nix configuration file

Create the impermanent.nix configuration file as described on [NixOS Wiki page](https://nixos.wiki/wiki/Impermanence)

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
      "/root/.nix-channels"
      { file = "/etc/nix/id_rsa"; parentDirectory = { mode = "u=rwx,g=,o="; }; }
    ];
  };
}
```

### 2. Add the newly created file to configuration.nix

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

### 3. Set root mountpoint as tmpfs on hardware-configuration.nix file

Edit `hardware-configuration.nix` replacing the root filesystem setting from a ZFS dataset to `tmpfs` and remove any `tmpfs` mountpoints pointing to `/tmp` and `/var/tmp`. Here an example:

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

### 4. Rebuild the system

Make sure that you have a active internet connection before rebuilding.

```bash
nixos-rebuild switch
```

### 5. Reboot

Restart the computer and see if everything is working properly. Save something in the `/`, restart and see if the file vanishes after reboot.

## Conclusion

This concludes this extra chapter about impermanent. It's a cool capability that NixOS offers, increasing the security and maintenance. If you choose to use it, ensure that all paths that need to be persisted are indeed persisted.

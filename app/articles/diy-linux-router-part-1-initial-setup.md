---
title: "DIY Linux Router - Part 1 - Initial Setup"
articleId: "diy-linux-router-part-1-initial-setup"
date: "2024-10-05"
author: "Carlos Junior"
category: "Linux"
brief: "Doing a new life to an old Mac Mini as a capable Linux Router and homelab"
image: "/assets/images/what-is-cloudflare/macmini.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-1-configuracao-inicial"}]
---

This is the first part of a multi-part series describing how to build your own Linux router.

- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- Part 7: [File Sharing](/article/diy-linux-router-part-7-file-sharing)
- Part 8: [Backup](/article/diy-linux-router-part-8-backup)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

With this old **Mac Mini**, that is currently sitting in the corner and making it a Linux Router would give it a new life. It is a capable, stable machine. So let's do it.

![Macmini as Router](/assets/images/what-is-cloudflare/macmini.webp)

## Table of Contents

- [The Idea](#the-idea)
- [The Hardware](#the-hardware)
  - [MacMini Core 2 Duo from 2010](#macmini-core-2-duo-from-2010)
  - [Manageable Switch TP-Link TL-SG108E](#manageable-switch-tp-link-tl-sg108e)
  - [Ubiquiti Unifi C6 Lite](#ubiquiti-unifi-c6-lite)
- [Linux Setup](#linux-setup)
   1. [Download NixOS](#1-download-nixos)
   2. [Enable SSH Service](#2-enable-ssh-service)
   3. [SSH into the Mac Mini](#3-ssh-into-the-mac-mini)
   4. [Partition the Disk](#4-partition-the-disk)
   5. [Create ZFS Datasets](#5-create-zfs-datasets)
   6. [Create and mount the Boot filesystem](#6-create-and-mount-the-boot-filesystem)
   7. [Generate NixOS Configuration](#7-generate-nixos-configuration)
   8. [Define a password for the root user](#8-define-a-password-for-the-root-user)
   9. [Edit the Configuration](#9-edit-the-configuration)
   10. [Install NixOS](#10-install-nixos)
   11. [Umount the filesystem](#11-umount-the-filesystem)
   12. [Post-Installation Configuration](#12-post-installation-configuration)
- [Conclusion](#conclusion)

## The Idea

Let's state some building blocks. This project relies on the following:

- **Gateway Internet**: The Mac Mini will act as the main router, managing traffic between the internal network and the internet.
- **File Server**: We'll set up a file server to store and share files across the network.
- **Private Cloud Storage with Nextcloud**: Nextcloud will provide a self-hosted cloud storage solution, allowing you to access your files from anywhere.
- **Wireless Access**: The Unifi C6 Lite will provide wireless access to the network.
- **Unbound DNS with Adblocks**: Unbound DNS will be configured to block ads across the network, improving privacy and reducing bandwidth usage.
- **Media Server**: A media server will allow you to stream content to devices on the network.
- **Private VPN**: A VPN will be set up to allow secure remote access to the network.

## The Hardware

For this project, we are going to use:

### MacMini Core 2 Duo from 2010

![Macmini Wikimedia image](/assets/images/diy-linux-router/macmini.webp)
*Wikimedia image: [Source](https://commons.wikimedia.org/wiki/File:Mac_mini_mid2010_back.jpg)*

This Mac Mini is old and retired from its duty many years ago. As a desktop computer, it doesn't do much, but as a server, it will serve as a great machine with the following specs:

- Intel Core 2 Duo 8600 with 2.6GHz.
- 6GB of RAM.
- 2TB SSD.

### Manageable Switch TP-Link TL-SG108E

![TL-SG108E - from www.redeszone.net](/assets/images/diy-linux-router/tl-sg108e.webp)
*redeszone.net*

The TP-Link TL-SG108E is a great choice for this project because it supports VLANs for splitting the network into different segments. We will explore this further in Part 2 of this series.

### Ubiquiti Unifi C6 Lite

![Stephen Herber's Unifi Logo as a dinner plate](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Stephen Herber's old blog post about [DIY Linux as a router: Web archived link](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

The Unifi C6 Lite is a reliable wireless access point with good range and performance, making it perfect for providing wireless access to the network.

## Linux Setup

For this project, my idea is to use NixOS.
NixOS is a great choice because of its declarative configuration model. By defining the entire system configuration in a single `.nix` file, it's easy to reproduce the setup on another machine or roll back changes if something goes wrong. This makes NixOS ideal for a server environment where stability and reproducibility are important. This whole project is available on my GitHub (links below).

### 1. Download NixOS

- Download the NixOS ISO from the [official website](https://nixos.org/download/).
- Create a bootable USB drive using a tool like `dd` or `Etcher`.
- Boot the Mac Mini from the USB drive by holding the `Option` key during startup and selecting the USB drive.

### 2. Enable SSH Service

Enabling SSH will allow you to manage the Mac Mini remotely from your desktop computer, which is especially useful since the Mac Mini will be running headless (without a monitor or keyboard).

```sh
passwd
# Type your password twice.
sudo systemctl start sshd

# Check your IP
ip --brief addr
```

### 3. SSH into the Mac Mini

Access Mac Mini by using `ssh` with `Putty` or something similar, using the user `nixos` and the password you set in the previous step.

### 4. Partition the Disk

In this setup, I am going to use the ZFS filesystem. It's a resource-intensive filesystem, but it is resilient, fast, and offers great options for backup.

Although ZFS is resource-intensive, it offers several advantages that make it worth the trade-off. ZFS provides excellent data integrity through checksumming, supports snapshots for easy backups, and is highly scalable, making it a great choice for a file server. However, if you find ZFS to be more than what you need, **BTRFS** is a lighter alternative that still supports many of ZFS's features, such as snapshotting and easy backups. BTRFS is also less resource-intensive, making it a good option for older hardware. This partition scheme will allow the boot the system through **BIOS** and **UEFI** as well.

```bash
sudo -i
```

Define your storage device. You can check your storage device is by `ls /dev/disk/by-id/`

```bash
DISK=/dev/disk/by-id/scsi-STORAGE_DEVICE_ID
MNT=$(mktemp -d)
```

Define your tank name. For this tutorial, I will use the name `rpool`.

```bash
ZROOT=zroot
ZDATA=zdata
```

Wipe the disk entirely. Be aware that will erase all existing data.

```bash
wipefs -a ${DISK}
```

For flash-based storage, if the disk was previously used, you may want to do a full-disk discard (TRIM/UNMAP).

```bash
blkdiscard -f ${DISK}
```

Create the partition scheme. In this example, I'll create two storage pools:

- `zroot` with **8 Giga** of storage.
- `zdata` with the rest of storage space.

I prefer having discrete storage pools with one for **Root** and another for **Data**, Turning maintenance a lot easier, but if you prefer keeping everything in the same pool, it's just a matter of creating only the `zroot` storage pool with `100%`

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

Get the `UUID` for partitions

```bash
BOOT="/dev/disk/by-uuid/"$(blkid -s UUID -o value ${DISK}-part2)
SWAP="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o value ${DISK}-part3)
ROOT="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o value ${DISK}-part4)
DATA="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o value ${DISK}-part5)
```

### 5. Create ZFS Datasets

In both **ZFS** and **BTRFS**, data blocks are not usually separated into partitions, but rather into **datasets** in the case of **ZFS** or **Volumes** in the case of **BTRFS**. They work as if they were partitions, but sharing the same storage space and, often, the same file and directory structure.

In this tutorial, I only covered the creation of **ZFS** pools, since the equivalent process in **BTRFS** is simpler and more intuitive.

To create storage pools, we apply several parameters. They are:

- **`ashift=12`**: improves performance when working with SSDs
- **`atime=off`**: As mentioned in [this article](https://www.unixtutorial.org/atime-ctime-mtime-in-unix-filesystems/), modern Unix operating systems have special mount options to optimize `atime` usage.
- **compression=lz4**: Optimize storage space by compressing data with `lz4` algorithm without sacrificing performance.
- **zattr=sa**: Advanced attribute settings. Need for installing Linux-based operating systems
- **acltype=posixacl**: Requirement for installing Linux on a ZFS formatted system.

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

### Create the filesystem

On **NixOS**, the operating system is installed on `/nix` directory. **NixOS** references this directory and creates the other directories during initialization for compatibility. So you can have the **root** filesystem as **impermanent storage**. you can read more about it on [NixOS's wiki](https://nixos.wiki/wiki/Impermanence). There's an alternative article regarding the impermanent storage approach in the link [DIY Linux Router with Impermanence](/articles/diy-linux-router-impermanence-storage).

This tutorial covers installation using a persistent root file system.

```bash
zfs create -o mountpoint=none -o canmount=off ${ZROOT}/root
zfs create -o mountpoint=/ -o canmount=noauto ${ZROOT}/root/nixos
zfs mount ${ZROOT}/root/nixos
```

Having a discrete `/nix` dataset is a good practice because it separates the NixOS installation from the rest of the system.

```bash
zfs create -o canmount=noauto ${ZROOT}/nix
zfs mount ${ZROOT}/nix
```

Optionally, you can have your **NixOS configuration** and log into it's dataset.

```bash
zfs create -o canmount=off ${ZROOT}/etc
zfs create ${ZROOT}/etc/nixos
zfs create -o canmount=off ${ZROOT}/var
zfs create ${ZROOT}/var/log
```

Home filesytem will be created at the `zdata` pool.

```bash
zfs create -o mountpoint=/home ${ZDATA}/home
```

You can use `tmpfs` or a **ZFS dataset** for **temporary files**. Remember that if want to use the impermanent `root` filesystem, does not make sense mount **temporary directories** as filesystem, so, in that case, just jump to the **Swap** step if you want to use swap.

#### As ZFS Dataset

```bash
zfs create -o com.sun:auto-snapshot=false ${ZROOT}/tmp
zfs create -o canmount=off ${ZROOT}/var
zfs create -o com.sun:auto-snapshot=false ${ZROOT}/var/tmp
chmod 1777 ${MNT}/var/tmp
chmod 1777 ${MNT}/tmp
```

If you want to use `tmpfs` instead, do as follows:

```bash
mkdir ${MNT}/tmp
mkdir -p ${MNT}/var/tmp
mount -t tmpfs tmpfs ${MNT}/tmp
mount -t tmpfs tmpfs ${MNT}/var/tmp
```

#### Swap partition

Using a swap on an **SSD** can reduce the drive's lifespan, but in some cases is necessary.

Considering that the swap partition was already created.

```bash
mkswap -f ${SWAP}
swapon ${SWAP}
```

### 6. Create and mount the Boot filesystem

Because the operating system installation lies in the `/nix` directory, what mainly is `/boot/efi` on other Linux distributions is solely `/boot` on **NixOS**.

```bash
mkdir ${MNT}/boot
mount ${BOOT} ${MNT}/boot
```

### 7. Generate NixOS Configuration

```bash
nixos-generate-config --root ${MNT}
```

### 8. Define a password for the root user

This step is only necessary if you're using the impermanent storage for the **root** filesystem.

```bash
PASS=$(mkpasswd --method=SHA-512)
```

Type the password. It will be stored in the variable `PASS` for further use.

### 9. Edit the Configuration

Open the `${MNT}/etc/nixos/configuration.nix` file and make sure to enable **ZFS** support.There are two versions of this configuration file. One for `BIOS` and the other for `UEFI`.

For the **2010 Mac Mini**, there are some hardware issues related to proprietary drivers that need to be addressed. Fortunately, NixOS provides the **hardware configuration** schemas, which helps to address those issues easily. On the **UEFI** file, there's a reference on imports for importing the profile for my machine. But first I have to add these channels. More details on [github.com/NixOS/nixos-hardware](https://github.com/NixOS/nixos-hardware).

Do this step only if you intend to use the **hardware configuration** scheme.

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

  # Use the systemd-boot EFI boot loader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  i18n.defaultLocale = "en_US.UTF-8";
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

  i18n.defaultLocale = "en_US.UTF-8";
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

The `users.nix` file will configure the intended users to the server. For now, let's just set the root password with it and secure the file against unatended reading for other users beside the root. Be aware that this step is fundamental to garantee that you will be able to access the server after reboot. Principally if you choosed to create `root` as `tmpfs`.

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

#### Hardware Configuration

The command `nixos-generate-config` scans your hardware and creates all the mount points your system needs. You can check if everything is ok with it.
You don't need to keep any mountpoints managed by **ZFS** with the except of `/nix` and `/` mountpoint. Also maintain only the following mount points.

- `/`: Leave as is.
- `/nix`: Leave as is.
- `/boot`: Becase is not a **ZFS** Filesystem, but a **FAT32** for booting, leave it on configuration file as well.
- `/tmp` and `/var/tmp`: If you choose to create those as `tmpfs`.

Additionally, you need to configure NixOS to import the `zdata` pool. Supplement the configuration file with `boot.zfs.extraPools = ["zdata" ];` as described below.

`${MNT}/etc/nixos/hardware-configuration.nix`

```nix
{
  ...
  
  boot.zfs.extraPools = [ "zdata" ]; # Check if this line exists. If not. Add it.

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

### 10. Install NixOS

Run the installation command:

```bash
nixos-install --root ${MNT}
```

### 11. Umount the filesystem

```bash
cd /
swapoff ${SWAP}
umount ${MNT}/boot/
umount -Rl ${MNT}
zpool export -a
```

After checking if everything was successfully disconnected, you can restart your system:

```bash
reboot
```

### 12. Post-Installation Configuration

Once NixOS is installed, you can configure the services that will run on your router. Here are some of the main services we will configure in this series:

- **Nextcloud**: For private cloud storage.
- **Unbound DNS with Adblock**: To block ads across the network.
- **VPN**: To allow secure remote access to your network.

## Conclusion

By repurposing an old Mac Mini and using NixOS, you've created a powerful and flexible Linux router that can manage your network, provide cloud storage, block ads, and more. This setup is highly customizable and can be expanded with additional services. Whether you're looking to improve your home network or just want to experiment with NixOS, this project is a great way to breathe new life into old hardware.
This wraps up the first part of this article. In the second part, we’ll configure our network, including VLAN configuration to split our network into **Home**, **Guest**, **IoT**, and set up a **PPPoE connection** with basic firewall rules using `nftables` for security.

- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)

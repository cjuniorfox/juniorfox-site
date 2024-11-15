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

With this old **Mac Mini**, that is currently sitting in the corner and making it a Linux Router would give it a new life. It is a capable, stable machine. So let's do it.

![Macmini as Router](/assets/images/what-is-cloudflare/macmini.webp)

## Table of Contents

- [The Idea](#the-idea)
- [The Hardware](#the-hardware)
  - [MacMini Core 2 Duo from 2010](#macmini-core-2-duo-from-2010)
  - [Manageable Switch TP-Link TL-SG108E](#manageable-switch-tp-link-tl-sg108e)
  - [Ubiquiti Unifi C6 Lite](#ubiquiti-unifi-c6-lite)
- [Linux Setup](#linux-setup)
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

Select the disk. You can check your disk by `ls /dev/disk/by-id/`

```bash
DISK=/dev/disk/by-id/scsi-SATA_disk1
```

Define your tank name. For this tutorial, I will use the name `rpool`.

```bash
ZROOT=zroot
```

Wipe the disk entirely. Be aware that will erase all existing data.

```bash
wipefs -a ${DISK}
```

For flash-based storage, if the disk was previously used, you may want to do a full-disk discard (TRIM/UNMAP).

```bash
blkdiscard -f ${DISK}
```

Create the partition schema. On this example, I'm creating a partition of `32G` to be the rpool ZFS pool. 32Gb is more than NixOS will ever need. I prefer to have a discrete pool for root to ease the maintability, but if you prefer to keep everything at the same pool, just replace the `32G` to `100%`. For now I'll just create the `rpool` ZFS pool.

```bash
parted ${DISK} mklabel gpt
parted ${DISK} mkpart primary 1MiB 2MiB
parted ${DISK} set 1 bios_grub on
parted ${DISK} mkpart EFI 2MiB 514MiB
parted ${DISK} set 2 esp on
parted ${DISK} mkpart ZFS 514MiB 32G
sleep 1
mkfs.msdos -F 32 -n EFI ${DISK}-part2
```

Get the `UUID` for partitions

```bash
BOOT="/dev/disk/by-uuid/"$(blkid -s UUID -o value ${DISK}-part2)
ROOT="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o value ${DISK}-part3)
```

### 5. Create ZFS Datasets

On ZFS, there's no much use of the term "partition" because really doesn't is. The equivalent is "Datasets" which has a similar approach as a **BTRFS Volumes** on BTRFS Filesystem.
There's a bunch of commands we will use for creating our zpool and datasets.

- **`ashift=12`**: improves performance when working with SSDs
- **`atime=off`**: As mentioned in [this article](https://www.unixtutorial.org/atime-ctime-mtime-in-unix-filesystems/), modern Unix operating systems have special mount options to optimize `atime` usage.
- **compression=lz4**: Optimize storage space by compressing data with `lz4` algorithm without sacrificing performance.
- **zattr=sa**: Advanced attribute settings. Need for installing Linux-based operating systems
- **acltype=posixacl**: Requirement for installing Linux on a ZFS formatted system.

```bash
zpool create -o canmount=off -O mountpoint=/ \
  -o ashift=12 -O atime=off -O compression=lz4 \
  -O xattr=sa -O acltype=posixacl \
  ${ZROOT} ${ROOT} -R /mnt
```

#### Create intended **datasets**

Starting with the most basic ones. `rootfs` and `home`:

```bash
zfs create -o mountpoint=none -o canmount=off ${ZROOT}/root
zfs create -o mountpoint=/ -o canmount=noauto ${ZROOT}/root/nixos
zfs mount ${ZROOT}/root/nixos
zfs create ${ZROOT}/home
```

Having `/nix` in on it's own **dataset** is a good idea:

```bash
zfs create -o mountpoint=legacy -o canmount=noauto ${ZROOT}/nix
mkdir /mnt/nix
mount -t zfs ${ZROOT}/nix /mnt/nix
```

You can use `tmpfs` or a **ZFS dataset** for **temporary files**:

##### ZFS Dataset

```bash
zfs create -o com.sun:auto-snapshot=false ${ZROOT}/tmp
zfs create -o canmount=off ${ZROOT}/var
zfs create -o com.sun:auto-snapshot=false ${ZROOT}/var/tmp
chmod 1777 /mnt/var/tmp
chmod 1777 /mnt/tmp
```

If you want to use `tmpfs` instead, do as follows. But remember that `tmpfs` consumes some amount of RAM.

```bash
mount -t tmpfs tmpfs /mnt/tmp
mount -t tmpfs tmpfs /mnt/var/tmp
```

#### Swap dataset

Using a swap on an **SSD** can reduce the drive's lifespan, but in some cases is necessary.

```bash
zfs create -V 8G \
  -o compression=zle \
  -o logbias=throughput -o sync=always \
  -o primarycache=metadata -o secondarycache=none \
  -o com.sun:auto-snapshot=false ${ZROOT}/swap
```

Create the swap and start using it.

```bash
mkswap -f /dev/zvol/${ZROOT}/swap
swapon /dev/zvol/${ZROOT}/swap
```

### 6. Create and mount the Boot filesystem

#### UEFI

```bash
mkdir -p /mnt/boot/efi
mount ${BOOT} /mnt/boot/efi
```

#### BIOS

```bash
mkdir /mnt/boot
mount ${BOOT} /mnt/boot
```

### 7. Generate NixOS Configuration

```bash
nixos-generate-config --root /mnt
```

### 8. Edit the Configuration

Open the `/mnt/etc/nixos/configuration.nix` file and make sure to enable ZFS support.There are two versions of this configuration file. One for `BIOS` and the other for `UEFI`.

For the **2010 Mac Mini**, there are some hardware issues that needs to be addressed. Fortunately, NixOS provides **hardware configuration** schemas, which helps to address those issues easily. On the **UEFI** file, there's a reference on imports for importing the profile for my machine. But first I have to add these channels. More details on [github.com/NixOS/nixos-hardware](https://github.com/NixOS/nixos-hardware).

Do this step only if you intend to use the **hardware configuration** scheme.

```bash
sudo nix-channel --add https://github.com/NixOS/nixos-hardware/archive/master.tar.gz nixos-hardware
sudo nix-channel --update
```

<!-- markdownlint-disable MD033 -->
<details>
  <summary>UEFI <b>configuration.nix</b>.</summary>

```bash
cat << EOF > /mnt/etc/nixos/configuration.nix

{ config, lib, pkgs, ... }:

{
  imports =
    [ 
      <nixos-hardware/apple/macmini/4> #Specific for the Mac Mini 2010
      ./hardware-configuration.nix
    ];

  # Use the systemd-boot EFI boot loader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.loader.efi.efiSysMountPoint = "/boot/efi"; 

  i18n.defaultLocale = "en_US.UTF-8";
   console = {
     font = "Lat2-Terminus16";
     useXkbConfig = true; # use xkb.options in tty.
   };
  
  system.stateVersion = "24.05"; # Did you read the comment?
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
cat << EOF > /mnt/etc/nixos/configuration.nix
{ config, pkgs, ... }:

{
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

#### Hardware Configuration

The command `nixos-generate-config` scans your hardware and creates all the mount points needed for your system, but there's an issue with the `root` filesystem. You can check if is everything ok with it.
Also, It creates all mounpoints created by `zfs`. Maintain mountpoints `/`, `/nix` `/boot/efi` (or `/boot` if you took the **BIOS** path) and delete the mountpoints `/home` and (**UEFI** installation) `/boot`.

You can check the hardware-configuration file at the following path: `/mnt/etc/nixos/hardware-configuration.nix`

```nix
{
...boot

  fileSystems."/" =
    { device = "zroot/root/nixos";
      fsType = "zfs";
    };
    
  fileSystems."/nix" =
    { device = "zroot/nix";
      fsType = "zfs";
    };

  fileSystems."/boot/efi" =
    { device = "/dev/disk/by-uuid/3E83-253D";
      fsType = "vfat";
      options = [ "fmask=0022" "dmask=0022" ];
    };

...
}
```

### 9. Install NixOS

Run the installation command:

```bash
nixos-install
```

### 10. Umount the filesystem

```bash
cd /
swapoff /dev/zvol/${ZROOT}/swap
umount /boot/efi
umount -Rl /mnt
zpool export -a
```

After checking if everything was successfully disconnected, you can restart your system:

```bash
reboot
```

### 11. Post-Installation Configuration

Once NixOS is installed, you can begin configuring the services that will run on your router. Here are some of the key services you'll want to set up:

- **Nextcloud**: For private cloud storage.
- **Unbound DNS with Adblock**: To block ads across the network.
- **VPN**: To allow secure remote access to your network.

Each of these services can be configured in your NixOS configuration file (`/etc/nixos/configuration.nix`), making it easy to manage and reproduce your setup.

## Conclusion

By repurposing an old Mac Mini and using NixOS, you've created a powerful and flexible Linux router that can manage your network, provide cloud storage, block ads, and more. This setup is highly customizable and can be expanded with additional services as needed. Whether you're looking to improve your home network or just want to experiment with NixOS, this project is a great way to breathe new life into old hardware.
This wraps up the first part of this article. In the second part, we’ll configure our network, including VLAN configuration to split our network into `private`, `guest`, and `wan`, as well as set up a PPPoE connection and basic firewall rules using `nftables`.

- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)

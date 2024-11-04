---
title: "DIY Linux Router - Part 1 - Initial Setup"
articleId: "diy-linux-router-part-1-initial-setup"
date: "2024-10-05"
author: "Carlos Junior"
category: "Linux"
brief: "Doing a new life to an old Mac Mini as a capable Linux router and homelab"
image: "/assets/images/what-is-cloudflare/macmini.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-1-configuracao-inicial"}]
---

This is the first part of a multipart series describing how to build your own Linux router.

- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Nextcloud and Jellyfin](/article/diy-linux-router-part-5-nextcloud-jellyfin)

Having this old Mac Mini doing nothing, and making it a Linux server would give it a new life. It is a capable, stable machine and far from being an ugly one. So let's do it.

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

Let's state some building blocks. This project relies on having:

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

This Mac Mini is old and has been retired from its duty many years ago. As a desktop computer, it doesn't do much, but as a server, it will serve as a great machine with the following specs:

- Intel Core 2 Duo 8600 with 2.6GHz.
- 6GB of RAM.
- 2TB SSD.

### Manageable Switch TP-Link TL-SG108E

![TL-SG108E - from www.redeszone.net](/assets/images/diy-linux-router/tl-sg108e.webp)
*redeszone.net*

The TP-Link TL-SG108E is a great choice for this project because it supports VLANs, which are essential for splitting the network into different segments. We will explore this further in Part 2 of this series.

### Ubiquiti Unifi C6 Lite

![Stephen Herber's Unifi Logo as a dinner plate](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Stephen Herber's old blogpost about [DIY Linux as a router: Web archived link](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

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

Access Macmini by using `ssh` with `Putty` or something similar, using the user `nixos` and the password you set in the previous step.

### 4. Partition the Disk

In this setup, I am going to use the ZFS filesystem. It's a resource-intensive filesystem, but it is resilient, fast, and offers great options for backup.

Although ZFS is resource-intensive, it offers several advantages that make it worth the trade-off. ZFS provides excellent data integrity through checksumming, supports snapshots for easy backups, and is highly scalable, making it a great choice for a file server. However, if you find ZFS to be more than what you need, **BTRFS** is a lighter alternative that still supports many of ZFS's features, such as snapshotting and easy backups. BTRFS is also less resource-intensive, making it a good option for older hardware. This partition scheme will allow boot the system through **BIOS** and **UEFI** as well.

```bash
sudo -i
```

Select the disk. You can check your disk by `ls /dev/disk/by-id/`

```bash
DISK=/dev/disk/by-id/scsi-SATA_disk1
BIOS=${DISK}-part1
EFI=${DISK}-part2
ROOT=${DISK}-part3
```

Wipe the disk entirely. Be aware that will erase all existing data.

```bash
wipefs -a ${DISK}
```

For flash-based storage, if the disk was previously used, you may want to do a full-disk discard (TRIM/UNMAP).

```bash
blkdiskcard -f ${DISK}
```

Create the partition schema.

```bash
parted ${DISK} mklabel gpt
parted ${DISK} mkpart primary 1MiB 2MiB
parted ${DISK} set 1 bios_grub on
parted ${DISK} mkpart EFI 2MiB 514MiB
parted ${DISK} set 2 esp on
parted ${DISK} mkpart ZFS 514MiB 100%
mkfs.msdos -F 32 -n EFI ${EFI}
```

### 5. Create ZFS Datasets

On ZFS, there's no much use of the term "partition" because really doesn't is. The equivalent is "Datasets" which has a similar approach as a **BTRFS Volumes** on BTRFS Filesystem.
There's a bunch of commands we will use for creating our zpool and datasets.

- **`ashift=12`**: improves performance when working with SSDs
- **`atime=off`**: As mentioned at [this article](https://www.unixtutorial.org/atime-ctime-mtime-in-unix-filesystems/), modern unix operating systems have special mount options to optimise atime usage.
- **compression=lz4**: Optimize storage space by compressing data with `lz4` algorithm without sacrificing performance.
- **zattr=sa**: Advanced attribute settings. Need for installing Linux based operating systems
- **acltype=posixacl**: Requirement for installing Linux on a ZFS formatted system.

```bash
zpool create -f -o ashift=12 -O atime=off -O compression=lz4 -O xattr=sa -O acltype=posixacl rpool ${ROOT} -R /mnt
zfs create -o mountpoint=none rpool/root
zfs create -o mountpoint=legacy rpool/root/nixos
zfs create -o mountpoint=/home rpool/home
```

### 6. Mount the Filesystems

```bash
mount -t zfs rpool/root/nixos /mnt
mkdir /mnt/boot
mount ${EFI} /mnt/boot
```

### 7. Generate NixOS Configuration

```bash
nixos-generate-config --root /mnt
```

### 8. Edit the Configuration

Open the `/mnt/etc/nixos/configuration.nix` file and make sure to enable ZFS support. Add the following lines:

```bash
cat << EOF > /mnt/etc/nixos/configuration.nix
{ config, pkgs, ... }:

{
  system.stateVersion = "24.05";
  boot = {
    loader = {
      grub = {
        enable = true;
        efiSupport = true;
        device = "${DISK}";
      };
    };
    supportedFilesystems = [ "zfs" ];
  };

  fileSystems."/" = {
    device = "rpool/root/nixos";
    fsType = "zfs";
  };

  time.timeZone = "America/Sao_Paulo";

  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "yes";
      PasswordAuthentication = true;
    };
  };

  environment.systemPackages = with pkgs; [ vim ];

  # Set the hostId for ZFS
  networking.hostId = "$(head -c 8 /etc/machine-id)";
}
EOF
```

### 9. Install NixOS

Run the installation command:

```bash
nixos-install
```

### 10. Post-Installation Configuration

Once NixOS is installed, you can begin configuring the services that will run on your router. Here are some of the key services you'll want to set up:

- **Nextcloud**: For private cloud storage.
- **Unbound DNS with Adblock**: To block ads across the network.
- **VPN**: To allow secure remote access to your network.

Each of these services can be configured in your NixOS configuration file (`/etc/nixos/configuration.nix`), making it easy to manage and reproduce your setup.

## Conclusion

By repurposing an old Mac Mini and using NixOS, you've created a powerful and flexible Linux router that can manage your network, provide cloud storage, block ads, and more. This setup is highly customizable and can be expanded with additional services as needed. Whether you're looking to improve your home network or just want to experiment with NixOS, this project is a great way to breathe new life into old hardware.
This wraps up the first part of this article. In the second part, we’ll configure our network, including VLAN configuration to split our network into `private`, `guest`, and `wan`, as well as setting up a PPPoE connection and basic firewall rules using `nftables`.
Feel free to check out the full project on my [GitHub](http://github.com/cjuniorfox) and share your own experiences in the comments!

---
title: "Create a multi-boot disk at the hard way"
articleId: "create-multi-boot-disk-hard-way"
date: "2024-11-08"
author: "Carlos Junior"
category: "Linux"
brief: "There's a plenty of multi-boot disk solutions like Ventoy or multi-boot, but why do not do all the work manually?"
image: "/assets/images/create-a-multi-boot-disk-hard-way/multi-boot-disk.webp"
keywords : ["usb","multi-boot disk", "windows", "linux", "boot", "bios", "uefi"]
lang : "pt"
other-langs : [{"lang":"en","article":"old-ipad-as-a-second-screen"}]
---

With tools like Ventoy, creating a multi-boot USB disk for operating systems ISOs is easier than ever. For those who want to have the job done, Ventoy is the most appropriate way to go.
This article is for those who want to do things manually or would like to learn more about how the operating systems boot.
In this tutorial, we gonna do every step to make a multi-boot-disk, by partitioning and even compiling GRUB for using it, partitioning the USB stick, installing GRUB, copying our ISOS, and setting the GRUB menu. So without further redo, let's get started.
Download and compile GRUB.
Many Linux operating systems make GRUB available for installation, but they mostly have a setup made for their operating systems not always work for this kind of setup. Thinking about that I prefer to download the GRUB source code and compile it by myself. To make it more system-agnostic, I'll use Distrobox to build it.

## Obtaining GRUB

To have **GRUB**, we need to download its source code and compile it.

### 1. Create a container on Distrobox

```bash
distrobox create --name grub-builder --image ubuntu:latest
distrobox enter grub-builder
```

### 2. Prepare the built environment

```bash
sudo sh << EOF
apt update -y
apt upgrade -
apt install -y gcc g++ make bison gawk gettext binutils flex pkg-config patch build-essential 
EOF

#sudo apt install  gawk acpica-tools  ninja-build libpixman-1-dev
```

### 3. Download GRUB Sources

Til the moment I write this article, the last stable version of GRUB is 2.12.

```bash
mkdir ~/.local/src/
cd ~/.local/src/
wget https://ftp.gnu.org/gnu/grub/grub-2.12.tar.xz
tar -xvJf grub-2.12.tar.xz
cd grub-2.12
```

### 4. Build GRUB for BIOS

```bash
mkdir build-bios
cd build-bios
echo depends bli part_gpt > ../grub-core/extra_deps.lst
../configure --target=i386
make -j$(nproc)
cd ..
```

### 5. Build for UEFI

```bash
mkdir build-uefi
cd build-uefi 
../configure --target=x86_64 --with-platform=efi
make -j$(nproc)
```

## USB Stick

This **Multi-boot USB Sick will** support:

- Both **BIOS** and **UEFI**
- Windows Installer
- Many Linux Distros

### Partitioning

The partition schema for this USB stick will be as follows:

- **Partition 1**: Special partition for **BIOS** Boot.
- **Partition 2**: **FAT-32** Boot partition for **UEFI**
- **Partition 3**: **NTFS** For **Windows** Initialization
- **Partition 4**: **EXT-4** partition for Linux ISOs.

Leave distrobox environment with `exit` and prepare the USB Stick by doing the following:

#### 1. Identify USB Stick

```bash
ls /dev/disk/by-id/
```

#### 2. Define USB Stick

```bash
STICK=/dev/disk/by-id/usb-my-thumbdrive
```

#### 3. Partition USB Stick

Be aware that will wipe out the entire USB Stick.

```bash
sudo sh << EOF
wipefs -a ${STICK}
parted ${STICK} mklabel gpt
parted ${STICK} mkpart primary 1MiB 2MiB
parted ${STICK} set 1 bios_grub on
parted ${STICK} mkpart EFI 2MiB 514MiB
parted ${STICK} set 2 esp on
parted ${STICK} mkpart NTFS 514MiB 8GiB
parted ${STICK} mkpart Linux 8GiB 100%
mkfs.msdos -F 32 -n EFI ${STICK}-part2
sleep 0.3
mkfs.ntfs -fL Windows ${STICK}-part3
sleep 0.3
mkfs.ext4 -L Multi-Boot ${STICK}-part4
EOF
```

#### 4. Mount intended filesystems

```bash
MNT=$(mktemp -d)
mkdir ${MNT}/{multiboot,efi,windows}
sudo sh << EOF
mount ${STICK}-part2 ${MNT}/efi
mount ${STICK}-part3 ${MNT}/windows
mount ${STICK}-part4 ${MNT}/multiboot
mkdir ${MNT}/multiboot/boot
EOF
```

## Installing GRUB

Let's install GRUB for both **UEFI** and **BIOS**

```bash
cd grub-2.12/build-bios/
sudo sh << EOF
./grub-install --boot-directory ${MNT}/multiboot/boot/ --directory=./grub-core/ --target=i386-pc ${STICK}
cd ../build-uefi/
./grub-install --directory=./grub-core/ --target=x86_64-efi --efi-directory=/${MNT}/efi --boot-directory=${MNT}/multiboot/boot/ --removable
EOF
```

## Copy iso files

For **Linux Based** operating systems, all files will be placed on `/isos` inside **Multi-boot** partition. To make life a bit easier, create a `/isos` directory and define as owner your user.

```bash
sudo sh << EOF
mkdir ${MNT}/multiboot/isos
chown $(id -u) ${MNT}/multiboot/isos
EOF
```

## Copy ISOS files

Copy intended isos files to the folder `/isos` created

```bash
cd my-iso-files #Directory where your isos are in
rsync -axHAWXs --info=progress2 *.iso ${MNT}/multiboot/isos
sync
```

## Windows

Windows was unable to read its contents from a ISO file inside an **EXT4** filesystem. Instead, Windows installers need to be extracted from ISO file and placed on a **NTFS** partition.

### 1. Download Windows Installer ISO

Download the Windows installer ISO from [Microsoft](https://www.microsoft.com/pt-br/software-download/windows11).

### 2. Mount and Copy Windows ISO Contentss

Mount the ISO using `udiskctl` or `mount` and copy its contents to the **NTFS** partition we just created.

```bash
udisksctl loop-setup -f /home/junior/Downloads/Win11_24H2_x64.iso
cd /media/your_user/Win11_23H2_x64v2
rsync -a -r ./ ${MNT}/windows
```

## Grub Menu

We need to create menu itens to made operating systems available to initialization. The idea is simple. What a menu item does:

1. Looks for intended **ISO**.
2. Mount the **ISO**.
3. Switch root to **ISO's** root folder.
4. Start Linux Kernel with **ISO's** flag.


### Creation of grub.cfg file

The `grub.cfg` file will be created in the directory `/boot/grub2`. The first thing this file needs to do, is find where the USB stick is and then switch the `/root` folder to it. To do that, let's create a empty file with an `uuid` to be used as a reference for grub to locate yourself. To make things easier, let's also change the owner of the `grub.cfg` to your user, so you will not need to be `sudo` to edit its entries.

```bash
REF_FILE=$(uuid)
sudo sh << EOF
mkdir ${MNT}/multiboot/boot/grub2/
touch ${MNT}/multiboot/boot/grub2/grub.cfg
touch ${MNT}/multiboot/${REF_FILE}
chown $(id -u) ${MNT}/multiboot/boot/grub2/grub.cfg
EOF

cat << HEREDOC >> ${MNT}/multiboot/boot/grub2/grub.cfg
search --no-floppy --set=root --file /${REF_FILE}
set timeout=10
set default=0
HEREDOC
```

### Common Menuentries

It's time to add its menu entries. This step is a kind of boring because every distribution has its own combination of kernel flags that needs to be added manually to **GRUB** menu. At the most part of Linux distributions, it's the same kernel flag found on its ISOS's **GRUB** configuration file with the additional flag:

- `iso-scan/filename="${iso_path}"`

Being `iso_path` the path for that iso.
**NixOS** its a exception. Because it do not need to add the mentioned flag. So is just redirecting the grub menu to the one present on the **NixOS** iso. So, the secure way to create your **GRUB** menu is mounting ISO by ISO and adding its flags, but let me make the life a bit easier by presenting the most common ones:

#### Debian 12 Live
  
```ini
menuentry "Debian-Live-12.5.0-amd64-KDE" {
    set iso_path="/isos/debian-live-12.5.0-amd64-kde.iso"
    loopback loop ${iso_path}
    set root=(loop)
    linux /live/vmlinuz boot=live components quiet splash findiso=${iso_path}
    initrd /live/initrd.img
}
```

#### Fedora Workstation Live 40

```ini
menuentry "Debian-Live-12.5.0-amd64-KDE" {
    set iso_path="/isos/debian-live-12.5.0-amd64-kde.iso"
    loopback loop ${iso_path}
    set root=(loop)
    linux /live/vmlinuz boot=live components quiet splash findiso=${iso_path}
    initrd /live/initrd.img
}
```

#### Ubuntu Live 24.04

```ini
menuentry "Debian-Live-12.5.0-amd64-KDE" {
    set iso_path="/isos/debian-live-12.5.0-amd64-kde.iso"
    loopback loop ${iso_path}
    set root=(loop)
    linux /live/vmlinuz boot=live components quiet splash findiso=${iso_path}
    initrd /live/initrd.img
}
```

#### NixOS 24.05

**NixOS** is the easiest one. Just a matter of poining to its **GRUB Menu**

```ini
menuentry 'NixOS 24.05.6122.080166c15633 Installer '  --class installer {
    set iso_path="/isos/nixos-minimal-24.05.6122.080166c15633-x86_64-linux.iso"
    loopback loop ${iso_path}
    set root=(loop)
    configfile /EFI/boot/grub.cfg
}
```

#### Windows 11

Apart of Linux ISOS, Windows needs to chainload the **Windows** `bootmgr` bootloader and then boot from the files present into the **Windows Installer partition**. There's a difference between booting **BIOS** and **UEFI** on Winwdows Far as I know, **Windows 11** only supports **UEFI**, **Windows 10** supports both **UEFI** and **BIOS**, and **Windows 7** only supports **BIOS**.

##### UEFI (Windows 11)

```ini
menuentry "Install Windows 11 23H2 x64v2" {
    insmod ntfs
    search --set=root --file /bootmgr
    chainloader /bootmgr
    boot
}
```

##### BIOS (Windows 10, Windows 7)

```ini
menuentry "Windows 10 Installer" {
    insmod ntfs
    search --set=root --file /bootmgr
    ntldr /bootmgr
    boot
}
```

## Conclusion

In this article, we learned how to create a multi-bootable USB stick for a bunch of different operating systems.

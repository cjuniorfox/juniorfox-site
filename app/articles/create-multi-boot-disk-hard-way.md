---
title: "Create a Multi-Boot Disk the Hard Way"
articleId: "create-multi-boot-disk-hard-way"
date: "2024-11-08"
author: "Carlos Junior"
category: "Linux"
brief: "There are many multi-boot disk solutions like Ventoy, but why not do it manually and learn how bootloaders work?"
image: "/assets/images/create-a-multi-boot-disk-hard-way/multi-boot-disk.webp"
keywords: ["usb", "multi-boot disk", "windows", "linux", "boot", "bios", "uefi"]
lang: "pt"
other-langs: [{"lang":"en","article":"old-ipad-as-a-second-screen"}]
---

Creating a multi-boot USB disk for operating system ISOs is easier than ever with tools like **Ventoy**. For those who prefer an automated solution, **Ventoy** is the way to go. However, if you want to learn how operating systems boot and gain full control over the process, this guide is for you.

In this tutorial, we will manually create a **multi-boot USB stick**, covering partitioning, compiling **GRUB**, installing it, copying **ISOs**, and configuring the **GRUB menu**.

---

## Download and Compile GRUB

Many Linux distributions provide **precompiled GRUB packages**, but these are often tailored for the host OS and may not suit our multi-boot setup. Instead, we'll download GRUB's source code and compile it to ensure flexibility. We'll use Distrobox to maintain a clean build environment.

### 1. Create a Container in Distrobox

```bash
distrobox create --name grub-builder --image ubuntu:latest
distrobox enter grub-builder
```

### 2. Prepare the Build Environment

```bash
sudo sh << EOF
apt update -y
apt upgrade -y
apt install -y gcc g++ make bison gawk gettext binutils flex pkg-config patch build-essential
EOF
```

### 3. Download GRUB Sources

The latest stable version of GRUB at the time of writing is 2.12.

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

### 5. Build GRUB for UEFI

```bash
mkdir build-uefi
cd build-uefi 
../configure --target=x86_64 --with-platform=efi
make -j$(nproc)
```

---

## Prepare the USB Stick

This multi-boot USB stick will support:

- **BIOS** and **UEFI**
- Windows Installer
- Various Linux distributions

### 1. Partition the USB Stick

The partition scheme will include:

1. BIOS Boot (1 MiB)
2. UEFI Boot (FAT-32, 512 MiB)
3. Windows Installation (NTFS, 8 GiB)
4. Linux ISOs (EXT4, remaining space)

**WARNING**: This will erase all data on the USB stick.

```bash
ls /dev/disk/by-id/
STICK=/dev/disk/by-id/usb-my-thumbdrive

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

---

## Install GRUB

We'll install GRUB for both UEFI and BIOS.

```bash
cd grub-2.12/build-bios/
sudo ./grub-install --boot-directory=${MNT}/multiboot/boot/ --directory=./grub-core/ --target=i386-pc ${STICK}

cd ../build-uefi/
sudo ./grub-install --directory=./grub-core/ --target=x86_64-efi --efi-directory=${MNT}/efi --boot-directory=${MNT}/multiboot/boot/ --removable
```

---

## Copy ISO Files

Create directories for Linux ISOs:

```bash
sudo mkdir ${MNT}/multiboot/isos
sudo chown $(id -u):$(id -g) ${MNT}/multiboot/isos
```

Copy the ISO files to `/isos`:

```bash
rsync -axHAWX --info=progress2 my-iso-files/*.iso ${MNT}/multiboot/isos
sync
```

---

## Windows

Windows is unable to read its contents from a ISO file inside an **EXT4** filesystem. Instead, Windows installers need to be extracted to a proper **NTFS** partition.

### 1. Download Windows Installer ISO

Download the Windows installer ISO from [Microsoft](https://www.microsoft.com/pt-br/software-download/windows11).

### 2. Mount and Copy Windows ISO Contentss

Mount the ISO with `udiskctl` or `mount` and copy its contents to the **NTFS**.

```bash
udisksctl loop-setup -f /home/junior/Downloads/Win11_24H2_x64.iso
cd /media/your_user/Win11_23H2_x64v2
rsync -a -r ./ ${MNT}/windows
```

---

## Configure the GRUB Menu

Create a **GRUB** Menu to made operating systems available to initialization. Grub menu works as follows:

1. Looks for intended **ISO**.
2. Mount the **ISO**.
3. Switch root to **ISO's** root folder.
4. Start Linux Kernel with **ISO's** flag.

### Creation of grub.cfg file

The `grub.cfg` file will be created in the directory `/boot/grub`. Change the owner of the `grub.cfg` to your user, so you wont need to use `sudo` to edit its entries.

```bash
REF_FILE=$(uuid)
sudo sh << EOF
touch ${MNT}/multiboot/boot/grub/grub.cfg
touch ${MNT}/multiboot/${REF_FILE}
chown $(id -u):$(id -g) ${MNT}/multiboot/boot/grub/grub.cfg
EOF

cat << HEREDOC >> ${MNT}/multiboot/boot/grub/grub.cfg
search --no-floppy --set=root --file /${REF_FILE}
set timeout=10
set default=0
HEREDOC
```

### Common Menuentries

Add the menu entries. This step is a kind of boring because every distribution has its own combination of kernel flags that needs to be added to **GRUB** menu. For the most part, it's the same kernel flag found on its ISOS's **GRUB** configuration file with the following additional flag:

- `iso-scan/filename="${iso_path}"`

The best way to now the set of kernel flags needs to be added, is **mounting every ISO** file and reading its `grub.cfg` contents file. The most common menuentries are:

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

#### Windows Entries

Windows needs to chainload `bootmgr` from a **NTSC** partition. There's some differences between **BIOS** and **UEFI**. Here the common menuentries:

#### UEFI (Windows 11)

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

---

## Umount everything and testing

Umount the USB Stick and test if work as intended.

```bash
sudo umount -Rl ${MNT}/multiboot/
sudo umount -Rl ${MNT}/windows/
sudo umount -Rl ${MNT}/efi/
```

## Conclusion

In this guide, we built a fully functional multi-boot USB stick supporting both BIOS and UEFI systems. From partitioning to configuring GRUB, we covered every step manually. Happy booting!

---
title: "GPU Passthrough With Looking Glass"
articleId: "gpu-passthrough-with-looking-glass"
date: "2024-10-25"
author: "Carlos Junior"
category: "Games"
brief: "Gamming on Linux is better than ever, but there's always some game that actively refuses to work on Linux, because some anticheat measure or alike, forcing those users to dual boot with Windows, or worse, give up on the game. But there's a solution for this, it's called **GPU Passthrough**. This article will show you how to do it with a **QEMU** and **Looking Glass**."
image: "/assets/images/gpu-passthrough/gpu-passthrough.webp"
keywords : ["games","windows", "linux", "qemu", "gpu-passthrough", "nvidia", "amd", "looking-glass"]
lang : "en"
other-langs : [{"lang":"pt","article":"gpu-passthrough-com-looking-glass"}]
---


## Table of contents

- [Introduction](#introduction)
- [Packages to Install](#packages-to-install)
- [IOMMU and VFIO](#iommu-and-vfio)
- [Virtual Machine](#virtual-machine)
- [VFIO](#vfio)
  - [Which PCI GPU is on](#which-pci-gpu-is-on)
  - [Dump vBIOS](#dump-vbios)
  - [Add PCI Adapter to VM](#add-pci-adapter-to-vm)
  - [Resizable BAR](#resizable-bar)
  - [Attach and Detach Scripts](#attach-and-detach-scripts)
- [Hugepages](#hugepages)
- [Input devices](#input-devices)
- [Looking Glass](#looking-glass)
  - [Creating a Screen to Share](#creating-a-screen-to-share)
- [Conclusion](#conclusion)

## Introduction

The idea is to enable **GPU Passthrough** to a computer with **two display adapters.** It could be an **onboard video** and **discrete GPU adapter**. Can also be two discrete **GPUs** and can be manageable to do with a **single GPU** which is more complicated, as you lose the host's video when getting inside the **Windows VM**. This configuration will also work with notebooks having two display adapters.

![Desktop of a Linux Machine Running Windows 11](/assets/images/gpu-passthrough/gpu-passthrough.webp)

For the sake of this tutorial, I'll do as is on my setup, which is **AMD Radeon RX 6700**, and **Onboard Radeon Vega** for onboard video card. I wanted to retain the ability to use the video card at the host operating system, so I could play games without relying on the VM while having the ability to **pass through** the display adapter to **Windows** when needed to do so.

The **display cable** (**HDMI** or **DisplayPort**) will be connected to the onboard GPU port on your motherboard. There's no problem, you'll be able to use the graphics card through that port to render the 3D accelerated graphics.

On Windows, let's use **Looking Glass** to see what is rendered on **Windows Machine.**

A **Headless HDMI Dongle** or an additional **HDMI cable** connected to your discrete display adapter will also be needed to make **GPU** render video to be passed to **Looking Glass**. This dongle will be needed only for **Windows** as **Linux** can use the **Display Adapter** to render graphics without any monitor connected to it.

## Packages to install

On **Fedora**:

```sh
dnf install @virtualization
```

If you are using an **Immutable** version of **Fedora**, you can use the following command to install the required packages:

```sh
rpm-ostree install virt-install virt-install libvirt-daemon-config-network libvirt-daemon-kvm qemu-kvm virt-manager virt-viewer guestfs-tools python3-libguestfs virt-top
```

## BIOS configuration

Enable any related BIOS settings regarding virtualization, like **IOMMU**, **VT-x,** and **Virtualization Support** under **CPU Settings**.

## IOMMU and VFIO

### 1. Edit `/etc/default/grub`

```conf
# For AMD CPU
GRUB_CMDLINE_LINUX="rhgb quiet amd_iommu=on"
# For Intel
GRUB_CMDLINE_LINUX="rhgb quiet amd_iommu=on"
```

### 2. Add `vfio` drivers to `dracut`

`vi /etc/dracut.conf.d/local.conf`

```sh
add_drivers+=" vfio vfio_iommu_type1 vfio_pci vfio_virqfd "
```

Regenerate `initramfs` with `dracut`.

```sh
sudo dracut -f --kver `uname -r`
```

### 3. Apply `grub` settings

Do as `sudo` and then reboot.

```sh
grub2-mkconfig -o /etc/grub2-efi.cfg
```

## Virtual Machine

### 1. Create Virtual Machine

Create and install a Windows virtual machine normally as would do.

### 2. Edit the VM config

To avoid `error 43` related issues, let's add some settings:

```xml
<domain>
  <features>
    ...
    <hyperv>
      <vendor_id state='on' value='1234567890ab'/>
    </hyperv>
    <kvm>
      <hidden state='on'/>
    </kvm>
    ...
  </features>
  ...
</domain>
```

If you would use a **resizable bar (REBAR)** which is the ability of **GPU** to map more than **256MB** of **RAM,** add this:

```xml
<domain>
...
  <qemu:commandline>
    <qemu:arg value='-fw_cfg'/>
    <qemu:arg value='opt/ovmf/X-PciMmio64Mb,string=65536'/>
  </qemu:commandline>
</domain>
```

## VFIO

By default, the **Display Adapter** is available to the **host machine.** Try to avoid using output from Graphics Cards. Use those from onboard instead. You don't have any performance harms by doing that, as the computer will render the 3D graphics with the best GPU.

Booting the VM, the **Display Adapter** will be **detached** from the host machine and **attached** to the **VM**, becoming unavailable to the **Host Machine** until **Windows** shuts down.

Shutting down **Windows**, the **Display Adapter** is **removed** from the **PCI Bus**. This is necessary to avoid unloading **amdgpu** driver, which would demand to exit the session, as the **Display Driver** would be restarted that way.

### Which PCI GPU is on

To attach and detach the **GPU** from the host's and virtualm maquine, you have to know where your graphics card is on the **PCI bus**. You can check it with the command below. For **Radeon** look for `Navi`. For **Nvidia**, look for `Nvidia`.

```sh
lspci -nnk | grep Navi -A 3
```

```txt
03:00.0 VGA compatible controller [0300]: Advanced Micro Devices, Inc. [AMD/ATI] Navi 22 [Radeon RX 6700/6700 XT/6750 XT / 6800M/6850M XT] [1002:73df] (rev c1)
  Subsystem: Sapphire Technology Limited Sapphire Radeon RX 6700 [1da2:e445]
  Kernel driver in use: amdgpu
--
03:00.1 Audio device [0403]: Advanced Micro Devices, Inc. [AMD/ATI] Navi 21/23 HDMI/DP Audio Controller [1002:ab28]
  Subsystem: Advanced Micro Devices, Inc. [AMD/ATI] Navi 21/23 HDMI/DP Audio Controller [1002:ab28]
  Kernel driver in use: snd_hda_intel
  Kernel modules: snd_hda_intel
```

In my case, there are two devices I have to pass through. The **VGA-compatible controller** and the **Audio device.** In my case, the video card is connected to  `03:00.0` and the audio adapter is connected to `03:00.0`. Take note of these addresses that we use later.

### Dump vBIOS

It's not always necessary, but in my case, it was. Do as follows

```sh
# 1. Unbind the GPU from the driver
echo 0000:03:00.0 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/driver/unbind 

#2. Enable the access to dump the vBIOS
echo 1 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/rom

#3. Dump vBIOS contents to a file
sudo cat /sys/bus/pci/devices/0000\:03\:00.0/rom > vBIOS.rom

#4. Close the access to the vBIOS
echo 1 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/rom

#5. Load drivers again
echo 1 | sudo tee /sys/bus/pci/drivers/amdgpu/bind
```

### Add PCI Adapter to VM

Add the **PCI device** regarding the **Graphics Adapter** to your VM, and edit the **XML**. My device is at the address `03:00:0`, and the audio as `03:00:1`. This translates to:

Display

```xml
<hostdev mode="subsystem" type="pci" managed="yes">
  <source>
    <address domain="0x0000" bus="0x03" slot="0x00" function="0x0"/>
  </source>
  <rom file="/path/of/vBIOS.rom"/>
</hostdev>
```

Audio

```xml
<hostdev mode="subsystem" type="pci" managed="yes">
  <source>
    <address domain="0x0000" bus="0x03" slot="0x00" function="0x1"/>
  </source>
</hostdev>
```

Edit **XML's** domain by adding as follows:

`virsh edit win11`

```xml
<domain>
  ...
  <devices>
    ...
    <hostdev mode="subsystem" type="pci" managed="yes">
      <source>
        <address domain="0x0000" bus="0x03" slot="0x00" function="0x0"/>
      </source>
      <rom file="/path/of/vBIOS.rom"/>
      <address type="pci" domain="0x0000" bus="0x0a" slot="0x00" function="0x0" multifunction="on"/>
    </hostdev>
    <hostdev mode="subsystem" type="pci" managed="yes">
      <source>
        <address domain="0x0000" bus="0x03" slot="0x00" function="0x1"/>
      </source>
      <address type="pci" domain="0x0000" bus="0x0a" slot="0x00" function="0x1"/>
    </hostdev>
  </devices>
</domain>
```

### Resizable BAR

**Resizable BAR** overcomes a limitation of the **amount of RAM** a display adapter can allocate to the framebuffer. This is because, by default, the display adapter can allocate only up to **256MB** of **RAM** and have to slice the memory into chunks for using the whole memory. This functionality is disabled on BIOS by default and only works with **UEFI-enabled** BIOS and operating systems. Depending on the age and model of your video card, you will need to upgrade the VBIOS and sometimes the motherboard BIOS too. You can check it out [at that link](https://angrysysadmins.tech/index.php/2023/08/grassyloki/vfio-how-to-enable-resizeable-bar-rebar-in-your-vfio-virtual-machine/).

#### Check if the Resizable Bar is Enabled

With the PCI Address we checked earlier, check where the **ReBar** is set to:

```sh
lspci -vvvs "03:00.0" | grep BAR
```

```txt
Capabilities: [200 v1] Physical Resizable BAR
    BAR 0: current size: 16GB, supported: 256MB 512MB 1GB 2GB 4GB 8GB 16GB
    BAR 2: current size: 256MB, supported: 2MB 4MB 8MB 16MB 32MB 64MB 128MB 256MB
```

In my case, I have two bars:

- BAR 0: current size: **16GB.**
- BAR 2: current size: **256MB**.

#### Set ReBAR Size

To set the **ReBAR** size, we need to set an identification value that represents the **ReBAR** size which scales at the power of 2. Example: **1=2MB**, **2=4MB** ... **15=32GB**. In my case I have to **echo** the following sizes:

- **BAR 0:** **14** (16GB)
- **BAR 2:** **8** (256MB)

For **BAR 2**, any value above **8MB** issues the `error 43`on **Windows**. So I set it to **8MB** (3)

Take note of these values, we had to use them later.

### Attach and Detach Scripts

We took note of all the values we needed, let's review them:

- **GPU PCI Address:** `03:00.0`
- **GPU's Audio Device:** `03:00.1`
- **ReBARs**
  - **BAR 0:** `14`
  - **BAR 2:** `3`

#### 1. Create directory structure

Create these directories on your computer:

```sh
mkdir -p /etc/libvirt/hooks/qemu.d/vfio-pci/{prepare/begin,release/end}
```

#### 2. Create a base load script

Create this routine, to enable the ability to load the many`prepare/begin` and `release/end` scripts.

`vi /etc/libvirt/hooks/qemu`

```sh
#!/bin/bash

GUEST_NAME="$1"
HOOK_NAME="$2"
STATE_NAME="$3"
MISC="${@:4}"

BASEDIR="$(dirname $0)"

HOOKPATH="$BASEDIR/qemu.d/$GUEST_NAME/$HOOK_NAME/$STATE_NAME"
set -e # If a script exits with an error, we should as well.

if [ -f "$HOOKPATH" ]; then
eval \""$HOOKPATH"\" "$@"
elif [ -d "$HOOKPATH" ]; then
while read file; do
  eval \""$file"\" "$@"
done <<< "$(find -L "$HOOKPATH" -maxdepth 1 -type f -executable -print;)"
fi
```

#### 3. detach_gpu

With PCI addresses in mind, it's time to create the script `detach_gpu.sh`.

`vi /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/detach_gpu.sh`

```sh
#!/bin/bash

GPU="03:00"
# Resizable bar (Rebar):  
# Sizes 
# 1=2M 2=4M 3=8M 4=16M 5=32M 6=64M 7=128M 8=256M 9=512M  
# 10=1GB 11=2GB 12=4GB 13=8GB 14=16GB 15=32GB 
REBAR_SIZE_0=14
REBAR_SIZE_2=3

GPU_ADDR="0000:${GPU}.0"
AUDIO_ADDR="0000:${GPU}.1"

script_name=$(basename "${0%.*}")
LOG_FILE="/var/log/${script_name}.log"
echo "Logging output to ${LOG_FILE}."
exec > "$LOG_FILE" 2>&1  # Redirect logs to file
echo "Runs: $(date)"

# Check currently loaded drivers
GPU_LOADED_KERNEL=$(lspci -k -s "${GPU_ADDR}" | grep "Kernel driver in use" | awk '{print $5}')
AUDIO_LOADED_KERNEL=$(lspci -k -s "${AUDIO_ADDR}" | grep "Kernel driver in use" | awk '{print $5}')

echo "Unbinding GPU from host driver"
if [[ -n "$GPU_LOADED_KERNEL" ]]; then
    echo "${GPU_ADDR}" > /sys/bus/pci/devices/${GPU_ADDR}/driver/unbind || { echo "Failed to unbind ${GPU_ADDR}"; exit 1; }
fi
if [[ -n "$AUDIO_LOADED_KERNEL" ]]; then
    echo "${AUDIO_ADDR}" > /sys/bus/pci/devices/${AUDIO_ADDR}/driver/unbind || { echo "Failed to unbind ${AUDIO_ADDR}"; exit 1; }
fi

# Check if ReBAR size settings are defined before running ReBAR
if [[ -n "${REBAR_SIZE_0}" ]]; then
    echo "Setting up ReBAR 0"
    echo "${REBAR_SIZE_0}" > /sys/bus/pci/devices/${GPU_ADDR}/resource0_resize || { echo "Failed to set resource0_resize"; exit 1; }
fi
if [[ -n "${REBAR_SIZE_2}" ]]; then
    echo "Setting up ReBAR 2"
    echo "${REBAR_SIZE_2}" > /sys/bus/pci/devices/${GPU_ADDR}/resource2_resize || { echo "Failed to set resource2_resize"; exit 1; }
fi

echo "Starting vfio-pci driver"
modprobe vfio-pci || { echo "Failed to probe vfio-pci kernel"; exit 1; } 

echo "Binding GPU ${GPU_ADDR} to vfio-pci"
virsh nodedev-detach --device pci_0000_${GPU/:/_}_0
virsh nodedev-detach --device pci_0000_${GPU/:/_}_1

echo "GPU Device attached to VFIO successfully"
```

Logs file with the result of execution will be saved at `var/log/detach_gpu.log`

Make it executable:

```sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/detach_gpu.sh
```

#### 4. reattach_gpu

When the **Virtual Machine** is shut down, the `vfio-pci` driver will be unloaded from the **GPU Adapter**, which will be **removed** from the bus and **rescanned** again. After that, the script does the `nodedev-reattach` just for cleaning, as after the **rescan** command, the `amdgpu` driver becomes available again.

`vi /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/reattach_gpu.sh`

```sh
#!/bin/bash

GPU="03:00"

GPU_ADDR="0000:${GPU}.0"
AUDIO_ADDR="0000:${GPU}.1"

script_name=$(basename "${0%.*}")
LOG_FILE="/var/log/${script_name}.log"
echo "Logging output to ${LOG_FILE}."
exec > "$LOG_FILE" 2>&1  # Redirect logs to file
echo "Runs: $(date)"

echo "Removing GPU from PCI bus. (Needed to avoid unload the driver)"
echo 1 > "/sys/bus/pci/devices/${GPU_ADDR}/remove" || { echo "Failed to remove device ${GPU_ADDR} from PCI Bus"; exit 1; }
echo 1 > "/sys/bus/pci/devices/${AUDIO_ADDR}/remove" || { echo "Failed to remove device ${GPU_ADDR} from PCI Bus"; exit 1; }
sleep 3
echo 1 > /sys/bus/pci/rescan
sleep 1
echo "Reattaching GPU to Host computer"
virsh nodedev-reattach --device pci_0000_${GPU/:/_}_0
virsh nodedev-reattach --device pci_0000_${GPU/:/_}_1 
echo "Reattaching GPU process completed."
```

Logs file with the result of execution will be saved at `var/log/reattach_gpu.log`.

Make it executable by doing:

```sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/reattach_gpu.sh
```

### 5. Create `symbolic link` for your VM

To enable the scripts you build to your **VM**, create a `symbolic link` with the **VM\`s** name. In my case `win11` by running as `sudo`:

```sh
ln -s /etc/libvirt/hooks/qemu.d/{vfio-pci,win11}
```

## Hugepages

By default, x86 CPUs usually address memory in 4kB pages. But can also have the ability to use huge pages up to 2MB, which improves the performance.

### Calculating the hugepages

To determine the recommended size of hugepages for a VM with 16 GB of RAM, you need to calculate the number of hugepages required based on the size of each hugepage on your architecture.

- For x64 architecture, each **hugepage** is **2 MB** in size.

To calculate the number of **hugepages** required for **16 GB of RAM**:

$$ \frac{16 \text{ GB} \times 1024 \text{ MB}}{2 \text{ MB per hugepage}} = \frac{16383 \text{ MB}}{2 \text{ MB}} = 8192 \text{ hugepages} $$

You should reserve **8192 hugepages** to cover the entire memory allocation for the VM.

`sysctl vm.nr_hugepages=8192`

### 1. Create the Start Script

This script will reserve hugepages, mount the `hugetlbfs`, and start the VM with the hugepages configuration. Edit as `sudo`

`vi /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/start_hugepages.sh`

```sh
#!/bin/bash

script_name=$(basename "${0%.*}")
LOG_FILE="/var/log/${script_name}.log"
echo "Logging output to ${LOG_FILE}."
exec > "$LOG_FILE" 2>&1  # Redirect logs to file
echo "Runs: $(date)"

# The size of hugepages calculated earlier
echo "Reserving hugepages..."
sysctl vm.nr_hugepages=8192 || { echo "Unable to set vm.nr_hugepages"; exit 1; }

echo "Mounting hugetlbfs..."
mount -t hugetlbfs hugetlbfs /dev/hugepages || { echo "Unable to mount hugetlbfs"; exit 1; }
echo "Hugepages created sucessfully"
```

### 2. Create the End Script

This script will unmount the `hugetlbfs` and release the reserved **hugepages** after the **VM** has been shut down. Edit as `sudo`

`vi /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/end_hugepages.sh`.

```sh
#!/bin/bash

script_name=$(basename "${0%.*}")
LOG_FILE="/var/log/${script_name}.log"
echo "Logging output to ${LOG_FILE}."
exec > "$LOG_FILE" 2>&1  # Redirect logs to file

echo "Unmounting hugetlbfs..."
umount /dev/hugepages || { echo "Unable to umount hugetlbfs"; exit 1; }

echo "Releasing hugepages..."
sysctl vm.nr_hugepages=0 || { echo "Unable to release hugepages"; exit 1; } 
echo "Hugepages releases sucessfully"
```

Make those scripts executables:

```sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/start_hugepages.sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/end_hugepages.sh
```

### 3. Configure VM

Edit VM's with the following:

`virsh edit win11`

```xml
<domain>
...
  <memoryBacking>
    <hugepages/>
  </memoryBacking>
...
```

## Input Devices

This step is optional, as you can use **spice inputs.** As described in the [Installation instructions](https://looking-glass.io/docs/B6/install/) for **Looking Glass.** Changing to what is described in this topic, you change de behavior of input devices from **spice-managed** one to an exclusive mode. In other words, your VM will capture the input devices to it and remove them from your host machine. You can swap between **host** and **guest** input by pressing **Left Control** + **Right Control** + **Left Alt**.

### 1. Check input devices

```sh
ls /dev/input/by-id/
ls /dev/input/by-path/ 
```

### 2. Cat the device you think is your Keyboard and mouse

By `cat` it's possible to check if is the right device you looking to bind. Run as `sudo` and move the mouse around a little bit. If nothing happens. Look for another device.

```sh
cat /dev/input/by-id/usb-Compx_2.4G_Receiver-if01-event-mouse | hexdump
```

By catching and moving the mouse, if a lot of data is shown in **the terminal,** You got the right one. Take it note as being the **Mouse Device**. If not, keep looking by catching another device.

Let's now look for a **keyboard.** Cat what do you think is the **keyboard**, check if events are cached on the **terminal** when you press any key.

```sh
cat /dev/input/by-id/usb-Compx_2.4G_Wireless_Receiver-event-kbd | hexdump
```

If by pressing keys, many events are registered, you got the right one. Take it note as being the **keyboard device**.

### 3. Add devices to the VM

Add the devices you found by adding to **VM's XML.**

```xml
<input type="evdev">
    <source dev="/dev/input/by-id/usb-Compx_2.4G_Receiver-if01-event-mouse"/>
</input>
<input type="evdev">
    <source dev="/dev/input/by-id/usb-Compx_2.4G_Wireless_Receiver-event-kbd" grab="all" grabToggle="ctrl-ctrl" repeat="on"/>
</input>
```

You can remove other input devices, as the default input tablet if you want to do so.

## Looking Glass

**Looking Glass** is a solution that allows the framebuffer from a **display adapter** connected to a **virtual machine** to be redirected to the host, enabling the drawing and capturing of images. It achieves this by sharing a portion of memory between the VM and the host machine, utilizing a program called [Looking Glass](https://looking-glass.io/) to transfer the framebuffer from the VM to the host. For Looking Glass to function properly, several factors need to be addressed:

1. Create a memory area to share between the **client** and **host.**
2. Run the **Window host binary** on the **VM.**
3. Run the **Looking Glass client** on the host machine to see the VM screen.

### 1. Create a memory area

You need to figure out how many memory you need to share and you do this math by the following math

```txt
width x height x pixel size x 2 = frame bytes
```

My display works at `2560 x 1080 32 bit (4 bytes) color` resolution. So my math will be:

$$
2560 \times 1080 \times 4 \times 2 = 22118400
$$

$$
\frac{22118400}{1024 \times 1024} \approx 21.09 \, \text{MB}
$$

Now, let's see how much MB to the power of two is more than the needed space.

I need `21.09MB`. Something between `16MB` and `32MB`, being `16MB` less than I need. So, `32MB` it is.

Edit `win11` Virtual Machine as below:

`virsh edit win11`

```xml
<devices>
...
  <shmem name='looking-glass'>
    <model type='ivshmem-plain'/>
    <size unit='M'>32</size>
  </shmem>
...
```

#### Permissions

The shared memory file, by default, is owned by QEMU and does not give read/write permissions to other users, which is required for Looking Glass to work as intended.

Add your user to the group `qemu`.

```sh
sudo usermod -aG qemu $(whoami)
```

Create a file `/etc/tmpfiles.d/10-looking-glass.conf` with the following:

`vi /etc/tmpfiles.d/10-looking-glass.conf`

```conf
# Type Path               Mode UID  GID Age Argument

f /dev/shm/looking-glass 0660 qemu qemu -
```

Do add `semanage` rule as `sudo`.

```sh
semanage fcontext -a -t svirt_tmpfs_t /dev/shm/looking-glass
```

### 2. Windows host binary

On **Windows Guest Machine**, download and run the [Windows Host Binary](https://looking-glass.io/artifact/stable/host), available on the [looking-glass.io/downloads](https://looking-glass.io/downloads).

### 3. Looking Glass Client

#### Copr package

Installing Looking Glass could demand compiling and installing binaries and their dependencies, but thanks for **copr** projects, which are repositories maintained by the community, compiling is not needed. Let's install through **Copr.** Run as \`sudo\`

```sh
dnf copr enable rariotrariowario/looking-glass-client -y
```

```sh
dnf install -y looking-glass-client
```

#### Building by itself

If you do not want to add the **copr** and want to do everything by itself, do as:

```sh
sudo dnf install distrobox podman -y
```

```sh
distrobox create looking-glass-build --image fedora:40

# To enter, run:
#
# distrobox enter looking-glass-build
```

```sh
distrobox enter looking-glass-build
# Starting container...
```

```sh
sudo dnf install -y cmake gcc gcc-c++ \
  libglvnd-devel fontconfig-devel \
  spice-protocol make nettle-devel \
  pkgconf-pkg-config binutils-devel \
  libXi-devel libXinerama-devel \
  libXcursor-devel libXpresent-devel \
  libxkbcommon-x11-devel wayland-devel \
  wayland-protocols-devel libXScrnSaver-devel \
  libXrandr-devel dejavu-sans-mono-fonts \
  libsamplerate-devel libsamplerate-devel \
  pipewire-devel pulseaudio-libs-devel
```

```sh
curl "https://looking-glass.io/artifact/stable/source" --output looking-glass.tar.gz
tar -xzvf ./looking-glass.tar.gz
cd looking-glass-B6
```

```sh
mkdir client/build
cd client/build
cmake ../
make
exit
```

Install `looking-glass-client` by copying the executable from `looking-glass-B6/client/build`to `/usr/local/bin`

```sh
sudo cp -R looking-glass-B6/client/build/looking-glass-client /usr/local/bin/
```

Install additional packages on **host machine:**

```sh
sudo dnf install libXpresent -y
```

You can delete the **Distrobox\`s container** used to build Looking glass

```sh
distrobox stop looking-glass-build && distrobox rm looking-glass-build
```

### Creating a Screen to Share

To make looking glass work as intended, you need to have an accelerated screen to share. That can be obtained in two ways:

- By connecting your GPU to a monitor or a HDMI Dumb plug
- By using a [virtual display driver](/article/old-ipad-as-a-second-screen#virtual-display-driver).

I covered the subject of virtual display drivers [in this article here](/article/old-ipad-as-a-second-screen#virtual-display-driver).

## Conclusion

GPU passthrough with **VFIO** and **IOMMU** technologies offers a powerful solution for running virtual machines with near-native graphics performance. This setup allows you to harness the full potential of your GPU within a VM, enabling demanding tasks like gaming or **GPU-accelerated** workloads while maintaining the flexibility and security of virtualization.

Throughout this guide, we've covered several crucial aspects of implementing GPU passthrough:

1. **IOMMU and VFIO Setup**: We discussed the importance of properly configuring IOMMU groups and setting up VFIO for isolating the GPU.

2. **vBIOS Dumping**: We explained how to dump and use the GPU's vBIOS, which can be critical for certain setups.

3. **PCI Device Configuration**: We detailed the process of adding PCI devices to the VM and configuring them in the XML.

4. **Resizable BAR**: We explored the benefits of Resizable BAR and how to enable it for improved performance.

5. **Attach and Detach Scripts**: We provided scripts for seamlessly attaching and detaching the GPU from the host system.

6. **Hugepages**: We discussed the implementation of hugepages for optimized memory management.

7. **Input Device Passthrough**: We covered how to pass through input devices for a more native VM experience.

8. **Looking Glass Integration**: We explained how to set up Looking Glass for low-latency VM display output on the host.

By following these steps, you can create a high-performance virtual machine environment that rivals bare-metal performance for GPU-intensive tasks. This setup is particularly valuable for users who need to run different operating systems simultaneously while maintaining access to full GPU capabilities.

Remember that GPU passthrough can be complex and may require troubleshooting specific to your hardware configuration. Always ensure you have backups of your system and important data before making significant changes to your setup.

As virtualization technologies continue to evolve, GPU passthrough remains a powerful tool for enthusiasts, developers, and professionals who need the best of both worlds: the isolation and flexibility of virtual machines combined with the raw power of dedicated graphics hardware.

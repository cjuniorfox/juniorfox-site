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

This tutorial aims to guide you through enabling **GPU Passthrough** on a computer equipped with **two display adapters**: an **onboard video adapter** and a **discrete GPU**. This setup can also work with two discrete GPUs or even a single GPU, though the latter is more complex as it results in the host losing video output when the **Windows VM** is active. Additionally, this configuration is compatible with notebooks that feature both onboard and discrete display adapters.

![Desktop of a Linux Machine Running Windows 11](/assets/images/gpu-passthrough/gpu-passthrough.webp)

For this tutorial, I will demonstrate the setup using my configuration, which includes an **AMD Radeon RX 6700** as the discrete GPU and an **Onboard Radeon Vega** as the onboard video card. My goal is to retain the ability to use the discrete GPU on the host operating system for gaming while also enabling the option to **pass through** the GPU to a **Windows VM** when needed.

The **display cable** (either **HDMI** or **DisplayPort**) should be connected to the onboard GPU port on your motherboard. This setup allows the onboard GPU to handle video output while the discrete GPU can still render 3D-accelerated graphics.

On the Windows VM, we will use **Looking Glass** to view the rendered output. Additionally, a **Headless HDMI Dongle** or an extra **HDMI cable** connected to the discrete GPU will be required to enable video rendering for **Looking Glass**. This dongle is only necessary for Windows, as Linux can utilize the discrete GPU for rendering without a connected monitor.

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

### Fedora

1. `/etc/default/grub`

   ```conf
   # For AMD CPU
   GRUB_CMDLINE_LINUX="rhgb quiet amd_iommu=on iommu=pt"
   # For Intel CPU
   GRUB_CMDLINE_LINUX="rhgb quiet intel_iommu=on iommu=pt"
   ```

    The `iommu=pt` parameter ensures that devices not explicitly assigned to the VM are handled by the host with minimal overhead.

2. Save the changes and regenerate the GRUB configuration to apply the new kernel parameters:

   ```sh
   sudo grub2-mkconfig -o /boot/grub2/grub.cfg
   ```

   If your system uses UEFI, use the following command instead:

   ```sh
   sudo grub2-mkconfig -o /boot/efi/EFI/fedora/grub.cfg
   ```

3. Reboot your system to apply the changes:

   ```sh
   sudo reboot
   ```

4. Verify that `IOMMU` is enabled after rebooting. Run the following command and check the output for IOMMU:

   ```sh
   dmesg | grep -i iommu
   ```

   If IOMMU is enabled, you should see messages indicating that it has been initialized.

### Adding Kernel Flags on Fedora Silverblue (Immutable Version)

For Fedora Silverblue or other ostree-based immutable systems, you cannot directly edit `/etc/default/grub`. Instead, you need to use the `rpm-ostree` command to append kernel arguments.

To add the required kernel flags for **IOMMU**:

1. Add the kernel arguments using `rpm-ostree`:

   ```sh
   sudo rpm-ostree kargs --append=amd_iommu=on \
   --append iommu=pt
   ```

   Replace `amd_iommu=on` with `intel_iommu=on` if you're using an Intel CPU.

2. Verify the kernel arguments to ensure they were added correctly:

   ```sh
   rpm-ostree kargs
   ```

   This will display the current kernel arguments, including the ones you just added.

3. Reboot your system to apply the changes:

   ```sh
   systemctl reboot
   ```

### Dracut

Dracut is used to regenerate the **initramfs** (initial RAM filesystem), which is required to include the necessary VFIO drivers for GPU passthrough. This ensures that the drivers are loaded early during the boot process.

#### Regular Fedora

1. Create a configuration file for Dracut:

   ```sh
   sudo vi /etc/dracut.conf.d/vfio.conf
   ```

   Add the following line to include the required VFIO drivers:

   ```conf
   add_drivers+=" vfio vfio_iommu_type1 vfio_pci vfio_virqfd "
   ```

2. Regenerate the `initramfs` for the current kernel:

   ```sh
   sudo dracut -f --kver $(uname -r)
   ```

3. Reboot your system to apply the changes:

   ```sh
   sudo reboot
   ```

#### Fedora Silverblue (Immutable Version)

On Silverblue, you cannot directly edit system files like `/etc/dracut.conf.d/`. Instead, you need to use an **overlay** to make the necessary changes.

1. Create an overlay for the Dracut configuration:

   ```sh
   sudo mkdir -p /etc/dracut.conf.d
   sudo vi /etc/dracut.conf.d/vfio.conf
   ```

   Add the following line to include the required VFIO drivers:

   ```conf
   add_drivers+=" vfio vfio_iommu_type1 vfio_pci vfio_virqfd "
   ```

2. Regenerate the `initramfs` using the `rpm-ostree` command:

   ```sh
   sudo rpm-ostree initramfs --enable
   ```

   This command ensures that the changes are applied to the immutable system.

3. Reboot your system to apply the changes:

   ```sh
   systemctl reboot
   ```

#### Verifying the Changes

After rebooting, verify that the VFIO drivers are loaded correctly by running:

```sh
lsmod | grep vfio
```

You should see output indicating that the `vfio`, `vfio_iommu_type1`, `vfio_pci`, and `vfio_virqfd` modules are loaded.

---

By following these steps, you ensure that the VFIO drivers are properly included in the `initramfs`, enabling GPU passthrough functionality on both regular Fedora and Silverblue systems.

## Virtual Machine

First, create and install a Windows virtual machine as you normally would using either `virt-install` or `virt-manager`. This step involves setting up the VM with the desired amount of CPU, memory, and storage, as well as installing Windows.

### Setting Up the VM for GPU Passthrough

After completing the Windows installation, some additional configuration is required to ensure proper GPU passthrough functionality and to avoid encountering issues like `Error 43` (commonly seen with NVIDIA GPUs in virtualized environments).

1. Edit the VM's XML Configuration

   To configure the VM for GPU passthrough, you need to edit its XML file. This can be done using the `virsh edit` command:

   ```sh
   virsh edit <vm-name>
   ```

2. Add the Necessary Features

   Locate the `<features>` section in the XML file and add the following configuration:

   ```xml
   <domain>
    ...
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

   - `<vendor_id>`: This setting masks the hypervisor's presence, helping to bypass NVIDIA's Error 43.
   - `<hidden>`: This hides the KVM hypervisor from the guest operating system, ensuring compatibility with GPU drivers.

3. Save and Exit

   After making the changes, save the XML file and exit the editor. The changes will be applied to the VM configuration.

---

#### Why These Changes Are Necessary

- `Error 43`: This is a common issue with NVIDIA GPUs in virtualized environments. The `<vendor_id>` and `<hidden>` settings help bypass this error by masking the hypervisor's presence.
- **Improved Compatibility**: These settings ensure that the GPU drivers in the Windows VM function correctly, allowing the GPU to be fully utilized.

## VFIO

The **VFIO (Virtual Function I/O)** framework allows a virtual machine to directly access hardware devices, such as GPUs, by detaching them from the host system and assigning them to the VM. This ensures that the GPU operates as if it were directly connected to the VM, providing near-native performance.

### How VFIO Works

1. **Default Behavior**: By default, the GPU is attached to the host system and used by the host's display drivers (e.g., `amdgpu` or `nouveau`).
2. **Detaching the GPU**: When the VM starts, VFIO detaches the GPU from the host system and assigns it to the VM. This makes the GPU unavailable to the host until the VM shuts down.
3. **Reattaching the GPU**: After the VM shuts down, VFIO reattaches the GPU to the host system, restoring its functionality for the host.

### Key Considerations

- **Onboard GPU Usage**: It is recommended to use the onboard GPU for the host's display output. This avoids conflicts and ensures the discrete GPU is fully available for passthrough.
- **Driver Management**: When the GPU is detached from the host, the host's GPU driver (e.g., `amdgpu`) is unloaded. This prevents issues like restarting the display session, which could disrupt the host system.

### Identifying Your GPU on the PCI Bus

To configure VFIO, you need to know the PCI addresses of your GPU and its associated devices (e.g., audio controller). Use the following command to list PCI devices:

```sh
lspci -nnk | grep -E "VGA|3D|Audio" -A 3
```

For AMD GPUs, look for entries containing `Navi`. For NVIDIA GPUs, look for entries containing `NVIDIA`. Example output:

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

In this example:

- The VGA-compatible controller (GPU) is at `03:00.0`.
- The audio device is at `03:00.1`.

Take note of these PCI addresses, as they will be used in later steps.

Why Detaching and Reattaching is Necessary
When the VM starts, the GPU must be detached from the host system to avoid conflicts. Similarly, when the VM shuts down, the GPU must be reattached to the host to restore its functionality. This process ensures:

- The GPU is isolated for exclusive use by the VM.
- The host system remains stable and functional after the VM shuts down.

### Dump vBIOS

Sometimes the display adapter became irresponsive during attach and detatch process. To avoid this, you can dump your vBIOS and use as rom file.

1. Unbind the GPU from the driver.

   ```sh
   echo 0000:03:00.0 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/driver/unbind 
   ```

2. Enable access to dump the vBIOS.

   ```sh
   echo 1 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/rom
   ```
  
3. Dump the vBIOS sending its contents to a file

   ```sh
   sudo cat /sys/bus/pci/devices/0000\:03\:00.0/rom > vBIOS.rom
   ```

4. Finish the vBIOS access

    ```sh
    echo 1 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/rom
    ```
  
5. Load the display drivers to the host machine

   ```sh
   echo 1 | sudo tee /sys/bus/pci/drivers/amdgpu/bind
   ```

### Add PCI Adapter to VM

Under `<devices>` section, add the **PCI device** of the **Graphics Adapter** and its **Sound card** to your VM.

   Graphics Adapter

   ```xml
   <hostdev mode="subsystem" type="pci" managed="yes">
     <source>
       <address domain="0x0000" bus="0x03" slot="0x00" function="0x0"/>
     </source>
     <rom file="/path/of/vBIOS.rom"/>
   </hostdev>
   ```

   Sound card of the graphics Adapter

   ```xml
   <hostdev mode="subsystem" type="pci" managed="yes">
     <source>
       <address domain="0x0000" bus="0x03" slot="0x00" function="0x1"/>
     </source>
   </hostdev>
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

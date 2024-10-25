---
title: "GPU Passthrough com Looking Glass"
articleId: "gpu-passthrough-com-looking-glass"
date: "2024-10-25"
author: "Carlos Junior"
category: "Jogos"
brief: "Jogar no Linux está melhor do que nunca, mas sempre há algum jogo que se recusa a funcionar no Linux, devido a medidas de anticheat ou algo semelhante, forçando os usuários a fazer dual boot com o Windows ou, pior, desistir do jogo. Mas existe uma solução para isso, chamada Passagem de GPU. Este artigo mostrará como fazer isso usando QEMU e Looking Glass."
image: "/assets/images/gpu-passthrough/gpu-passthrough.webp"
keywords : ["games","windows", "linux", "qemu", "gpu-passthrough", "nvidia", "amd", "looking-glass"]
lang : "pt"
other-langs : [{"lang":"en","article":"gpu-passthrough-with-looking-glass"}]
---

## Índice

- [Introdução](#introdução)
- [Pacotes a Instalar](#pacotes-a-instalar)
- [Configuração da BIOS](#configuração-da-bios)
- [IOMMU e VFIO](#iommu-e-vfio)
- [Máquina Virtual](#máquina-virtual)
- [VFIO](#vfio)
  - [Em qual PCI está a GPU](#em-qual-pci-está-a-gpu)
  - [Extraír vBIOS](#extraír-vbios)
  - [Resizable BAR](#resizable-bar)
  - [Adicionar o dispositivo PCI à VM](#adicionar-o-dispositivo-pci-à-vm)
  - [Scripts para Anexar e Desanexar](#scripts-para-anexar-e-desanexar)
- [Hugepages](#hugepages)
- [Dispositivos de Entrada](#dispositivos-de-entrada)
- [Looking Glass](#looking-glass)
  - [Criando uma Tela Virtual para Compartilhar](#criando-uma-tela-virtual-para-compartilhar)
- [Conclusão](#conclusion)

## Introdução

A ideia é habilitar o **GPU Passthrough** *(utilizar a placa de vídeo em máquina virtual)* para um computador com **duas placas de vídeo.** Pode ser um **vídeo onboard** e um **placa de vídeo PCI.** Como podem ser duas **Placas de vídeo PCIs**. É possível reproduzir parte desse tutorial para casos com uma **única GPU**, o que é mais complicado, pois você perde o vídeo do desktop Linux entrar na **VM do Windows**. Essa configuração também funcionará em notebooks que possuem dois adaptadores de vídeo.

![Desktop of a Linux Machine Running Windows 11](/assets/images/gpu-passthrough/gpu-passthrough.webp)

Neste tutorial, farei conforme a minha configuração, que é uma **AMD Radeon RX 6700** e uma **Radeon Vega** como placa de vídeo onboard. Eu queria manter a possibilidade de usar a placa de vídeo no Linux, para que eu pudesse jogar sem depender da VM, mantendo a capacidade de usar a placa de vídeo no **Windows** virtualizado quando necessário.

O **cabo de vídeo** (**HDMI** ou **DisplayPort**) será conectado à porta da GPU onboard na sua placa-mãe.

No Windows, usaremos o **Looking Glass** para exibir o que está sendo renderizado na **Máquina Windows.**

Um **Dongle HDMI** ou um **cabo HDMI** adicional conectado a sua placa de vídeo também será necessário para fazer a **GPU** renderizar vídeo que será passado via **Looking Glass**. Esse dongle será necessário apenas para o **Windows**, pois o **Linux** pode usar o **Adaptador de Vídeo** para renderizar gráficos sem nenhum monitor conectado a ele.

Oficialmente não é suportado pelos desenvolvedores do **Looking Glass**, mas é possível instalar um **Driver de display virtual** para utilizar a placa de vídeo sem a necessidade de manter um cabo ou um dongle conectado a placa de vídeo.

## Pacotes a Instalar

No **Fedora**:

```sh
dnf install @virtualization
```

Se estiver utilizando uma versão **imutável** do **Fedora**, você pode instalar esses pacotes:

```sh
rpm-ostree install virt-install virt-install libvirt-daemon-config-network libvirt-daemon-kvm qemu-kvm virt-manager virt-viewer guestfs-tools python3-libguestfs virt-top
```

## Configuração da BIOS

Habilite qualquer recurso do BIOS relacionado à virtualização, como **IOMMU**, **VT-x,** e **Suporte à virtualização** em **Configurações do CPU**.

## IOMMU e VFIO

### 1. Edite `/etc/default/grub`

```conf
# Para AMD
GRUB_CMDLINE_LINUX="rhgb quiet amd_iommu=on"
# Para Intel
GRUB_CMDLINE_LINUX="rhgb quiet amd_iommu=on"
```

### 2. Adicione os drivers `vfio` ao `dracut`

`vi /etc/dracut.conf.d/local.conf`

```sh
add_drivers+=" vfio vfio_iommu_type1 vfio_pci vfio_virqfd "
```

Recontrua `initramfs` com `dracut`.

```sh
sudo dracut -f --kver `uname -r`
```

### 3. Atualizar as configurações do `grub`

Rode como `sudo` e reinicie.

```sh
grub2-mkconfig -o /etc/grub2-efi.cfg
```

## Máquina Virtual

### 1. Crie a máquina virtual

Crie e instale uma máquina virtual Windows normalmente como você faria.

### 2. Edite as configurações da máquina virtual

Para evitar erros relacionados ao `erro 43`, adicione algumas configurações:

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

Se você pretende usar **resizable bar (REBAR)**, que é a habilidade da **GPU** mapear mais de **256MB** de **RAM**, adicione isso:

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

Por padrão, a **Placa de víðeo** é disponibilizada apenas na **maquina host**. Evite utilizar as saídas de vídeo da placa de vídeo. Use as saídas de vídeo da placa de vídeo integrada. Não há perdas de desempenho ao fazer isso, pois o computador renderizará os gráficos com a melhor GPU.

Inicializando a VM, a **Placa de vídeo** será **desanexada** da máquina host e **anexada** à **VM**, tornando-a indisponível para a **Máquina Host** até que o **Windows** desligar.

Desligando o **Windoiws**, a **Placa de vídeo** será **removida** do **Bus PCI**. Isso é necessário para evitar desativar o **amdgpu** driver, o que exigiria sair da sessão, pois o **driver de vídeo** seria reiniciado dessa forma.

### Em qual PCI está a GPU

Para anexar e desanexar a **GPU** do kernel do host e da máquina virtual, você precisa saber onde sua placa de vídeo está no **Bus PCI**. Você pode verificar isso com o comando abaixo. Para **Radeon**, procure por `Navi`. Para **Nvidia**, procure por `Nvidia`.

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

No meu exemplo, eu tenho duas GPUs que preciso anexar a **VM**. O **Controlador VGA compatível** e o **Dispositivo de áudio.** No meu caso, a placa de vídeo está conectada a `03:00.0` e o adaptador de áudio está conectado a `03:00.0`. Tome nota desses endereços, pois os usaremos mais tarde.

### Extraír vBIOS

Isso não é sempre necessário, mas em meu caso, foi. Faça o seguinte:

```sh
# 1. Descarregue o driver de vídeo da GPU
echo 0000:03:00.0 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/driver/unbind 

#2. Habilite a permissão para extraír a vBIOS
echo 1 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/rom

#3. Extraia o conteúdo da vBIOS para um arquivo.
sudo cat /sys/bus/pci/devices/0000\:03\:00.0/rom > vBIOS.rom

#4. Feche o acesso à vBIOS.
echo 1 | sudo tee /sys/bus/pci/devices/0000\:03\:00.0/rom

#5. Carregue os drivers novamente.
echo 1 | sudo tee /sys/bus/pci/drivers/amdgpu/bind
```

### Adicionar o dispositivo PCI à VM

Adicione o dispositivo PCI à VM, edite o **XML**. No meu caso, o dispositivo de vídeo está no endereço `03:00:0` e o adaptador de áudio está no endereço `03:00:1`. Isso traduz-se para:

Vídeo

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

Edite o **XML** da VM adicionando como abaixo:

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

**Resizable BAR** supera a limitação da **quantidade de RAM** que um adaptador de exibição pode alocar para o framebuffer. Isso ocorre porque, por padrão, o adaptador de exibição pode alocar apenas até **256MB** de **RAM** e ter que dividir a memória em pedaços para usar toda a memória. Essa funcionalidade é desabilitada no BIOS por padrão e só funciona com **BIOS** e sistemas operações **UEFI** habilitados. Dependendo da idade e modelo da sua placa de vídeo, você precisará atualizar o **VBIOS** e às vezes até mesmo o **BIOS** da placa-mãe. Maiores detalhes [aqui](https://angrysysadmins.tech/index.php/2023/08/grassyloki/vfio-how-to-enable-resizeable-bar-rebar-in-your-vfio-virtual-machine/).

#### Verificar se o Resizable Bar está habilitado

Com o endereço PCI que verificamos anteriormente, verifique onde o **ReBar** está definido com o comando abaixo:

```sh
lspci -vvvs "03:00.0" | grep BAR
```

```txt
Capabilities: [200 v1] Physical Resizable BAR
    BAR 0: current size: 16GB, supported: 256MB 512MB 1GB 2GB 4GB 8GB 16GB
    BAR 2: current size: 256MB, supported: 2MB 4MB 8MB 16MB 32MB 64MB 128MB 256MB
```

No meu caso, o **ReBar** está definido como:

- BAR 0: Estado atual: **16GB.**
- BAR 2: Estado atual: **256MB**.

#### Configure o tamanho do ReBar

Para definir o tamanho do **ReBAR**, precisamos definir um valor de identificação que representa o tamanho do **ReBAR** que escala na potência de 2. Exemplo: **1=2MB**, **2=4MB** ... **15=32GB**. No meu caso, tenho que **echo** os seguintes tamanhos:

- **BAR 0:** **14** (16GB)
- **BAR 2:** **8** (256MB)

Para **BAR 2**, qualquer valor acima de **8MB** gera o `erro 43` no **Windows**. Então eu defini para **8MB** (3).

Anote esses valores, usaremos eles mais tarde.

### Scripts para anexar e desanexar

Tomamos nota de todos os valores que precisamos, vamos revisá-los:

- **Endereço da GPU no PCI:** `03:00.0`
- **Som da GPU:** `03:00.1`
- **ReBAR**
  - **BAR 0:** `14`
  - **BAR 2:** `3`

#### 1. Crie a estrtura de diretório

Crie esses diretórios no seu computador:

```sh
mkdir -p /etc/libvirt/hooks/qemu.d/vfio-pci/{prepare/begin,release/end}
```

#### 2. Crie o script de carregamento básico

Crie esse script para carregar os scripts `prepare/begin` e `release/end`.  

`vi /etc/libvirt/hooks/qemu`

```sh
#!/bin/bash

GUEST_NAME="$1"
HOOK_NAME="$2"
STATE_NAME="$3"
MISC="${@:4}"

BASEDIR="$(dirname $0)"

HOOKPATH="$BASEDIR/qemu.d/$GUEST_NAME/$HOOK_NAME/$STATE_NAME"
set -e

if [ -f "$HOOKPATH" ]; then
eval \""$HOOKPATH"\" "$@"
elif [ -d "$HOOKPATH" ]; then
while read file; do
  eval \""$file"\" "$@"
done <<< "$(find -L "$HOOKPATH" -maxdepth 1 -type f -executable -print;)"
fi
```

#### 3. detach_gpu

Com os endereços PCI que verificamos anteriormente, vamos criar o script `detach_gpu.sh`.

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
exec > "$LOG_FILE" 2>&1  # Redireciona o log para arquivo
echo "Runs: $(date)"

# Checando drivers ativos
GPU_LOADED_KERNEL=$(lspci -k -s "${GPU_ADDR}" | grep "Kernel driver in use" | awk '{print $5}')
AUDIO_LOADED_KERNEL=$(lspci -k -s "${AUDIO_ADDR}" | grep "Kernel driver in use" | awk '{print $5}')

echo "Unbinding GPU from host driver"
if [[ -n "$GPU_LOADED_KERNEL" ]]; then
    echo "${GPU_ADDR}" > /sys/bus/pci/devices/${GPU_ADDR}/driver/unbind || { echo "Failed to unbind ${GPU_ADDR}"; exit 1; }
fi
if [[ -n "$AUDIO_LOADED_KERNEL" ]]; then
    echo "${AUDIO_ADDR}" > /sys/bus/pci/devices/${AUDIO_ADDR}/driver/unbind || { echo "Failed to unbind ${AUDIO_ADDR}"; exit 1; }
fi

# Verifica se o ReBAR está definido
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

Logs com o resultado da execução serão armazenados em `var/log/detach_gpu.log`

Torne o script executável:

```sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/detach_gpu.sh
```

#### 4. reattach_gpu

Quando a **máquina virtual** é desligada, o driver `vfio-pci` será desvinculado da **placa de vídeo**, que será removida do **bus** e rescaneada novamente. Após isso, o script executa o `nodedev-reattach` apenas para limpeza, pois após o comando `rescan`, o driver `amdgpu` volta a ser disponível.

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

Os logs do script serão salvos em `var/log/reattach_gpu.log`.

Torne todos os scripts executáveis:

```sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/reattach_gpu.sh
```

### 5. Crie o `link simbólico` para sua VM

Para habilitar os scripts que você escreveu para sua **VM**, crie um `link simbólico` com o nome da **VM**. No meu caso `win11` executando como `sudo`:

```sh
ln -s /etc/libvirt/hooks/qemu.d/{vfio-pci,win11}
```

## Hugepages

Por padrão, as CPUs x86 geralmente endereçam a memória em páginas de 4KB. Mas também podem ter a capacidade de usar páginas grandes até 2MB, o que melhora o desempenho.

### Calculando os hugepages

Para determinar o tamanho recomendado de hugepages para uma VM com 16 GB de RAM, você precisa calcular o número de hugepages necessários com base no tamanho de cada hugepage na sua arquitetura.

- Para arquiteturas x64, cada **hugepage** tem um tamanho de **2 MB**.

Para calcular o número de hugepages necessários para **16 GB de RAM**:

$$ \frac{16 \text{ GB} \times 1024 \text{ MB}}{2 \text{ MB per hugepage}} = \frac{16383 \text{ MB}}{2 \text{ MB}} = 8192 \text{ hugepages} $$

Você deve reservar **8192 hugepages** para cobrir toda a alocação de memória para a VM.

`sysctl vm.nr_hugepages=8192`

### 1. Criar o script de inicialização

O script reservará as **hugepages** e montará o `hugetlbfs` e iniciará a **VM** com a configuração de **hugepages**. Edite como `sudo`:

`vi /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/start_hugepages.sh`

```sh
#!/bin/bash

script_name=$(basename "${0%.*}")
LOG_FILE="/var/log/${script_name}.log"
echo "Logging output to ${LOG_FILE}."
exec > "$LOG_FILE" 2>&1  # Redirciona logs para um arquivo.
echo "Runs: $(date)"

# O tamanho do Hugepages calculado anteriormente.
echo "Reserving hugepages..."
sysctl vm.nr_hugepages=8192 || { echo "Unable to set vm.nr_hugepages"; exit 1; }

echo "Mounting hugetlbfs..."
mount -t hugetlbfs hugetlbfs /dev/hugepages || { echo "Unable to mount hugetlbfs"; exit 1; }
echo "Hugepages created sucessfully"
```

### 2. Crie o script de finalização

Esse script será executado após a **VM** ser desligada. Ele desmontará o `hugetlbfs` e liberará as **hugepages** reservadas. Execute como `sudo`:

`vi /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/end_hugepages.sh`.

```sh
#!/bin/bash

script_name=$(basename "${0%.*}")
LOG_FILE="/var/log/${script_name}.log"
echo "Logging output to ${LOG_FILE}."
exec > "$LOG_FILE" 2>&1  # Redirciona logs para um arquivo.

echo "Unmounting hugetlbfs..."
umount /dev/hugepages || { echo "Unable to umount hugetlbfs"; exit 1; }

echo "Releasing hugepages..."
sysctl vm.nr_hugepages=0 || { echo "Unable to release hugepages"; exit 1 } 
echo "Hugepages releases sucessfully"
```

Faça os scripts executáveis:

```sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/prepare/begin/start_hugepages.sh
chmod +x /etc/libvirt/hooks/qemu.d/vfio-pci/release/end/end_hugepages.sh
```

### 3. Configure a VM

Edite o XML da VM como abaixo:

`virsh edit win11`

```xml
<domain>
...
  <memoryBacking>
    <hugepages/>
  </memoryBacking>
...
```

## Dispositivos de Entrada

Essa etapa é opcional, pois você pode usar **spice inputs.** Como descrito nas [instruções de instalação](https://looking-glass.io/docs/B6/install/) para **Looking Glass**. Alterando para o que está descrito neste tópico, você altera o comportamento dos dispositivos de entrada de **spice-managed** para um modo exclusivo. Em outras palavras, sua VM irá capturar os dispositivos de entrada para ela e removê-los da sua máquina host. Você pode trocar entre controlar o **host** e o **guest** pressionando **Control Esquerdo** + **Control Direito** + **Alt Esquerdo**.

### 1. Verifique seus dispositivos de entrada

```sh
ls /dev/input/by-id/
ls /dev/input/by-path/ 
```

### 2. Use o `cat` para verificar o dispositivo correto

Usando o `cat` é possivel verificar qual dispositivo de entrada é o correto. Rode como `sudo` e mova o mouse um pouco. Se nada acontecer. Procure por outro dispositivo.

```sh
cat /dev/input/by-id/usb-Compx_2.4G_Receiver-if01-event-mouse | hexdump
```

Movendo o mouse, se um monte de dados for mostrado no **terminal**, você achou o dispositivo correto. Anote-o como sendo o **dispositivo do mouse**. Se não, continue procurando por outro dispositivo.

Agora, vamos procurar por um **teclado**. Use o comando `cat` no que você acredita ser o **teclado**. Se nada acontecer, continue procurando por outro dispositivo.

```sh
cat /dev/input/by-id/usb-Compx_2.4G_Wireless_Receiver-event-kbd | hexdump
```

Se pressionando as teclas, dados são exibidos no **terminal**, você achou o dispositivo correto. Anote-o como sendo o **dispositivo do teclado**. Se não, continue procurando por outro dispositivo.

### 3. Adicione os dispositivos ao XML da VM

```xml
<input type="evdev">
    <source dev="/dev/input/by-id/usb-Compx_2.4G_Receiver-if01-event-mouse"/>
</input>
<input type="evdev">
    <source dev="/dev/input/by-id/usb-Compx_2.4G_Wireless_Receiver-event-kbd" grab="all" grabToggle="ctrl-ctrl" repeat="on"/>
</input>
```

Você pode remover outros dispositivos de entrada, como o **tablet** padrão, se você quiser.

## Looking Glass

**Looking Glass** é uma solução que permite que o framebuffer de um **adaptador de vídeo** conectado a uma **máquina virtual** seja redirecionado para o host, possibilitando a criação e captura de imagens. Ele faz isso compartilhando uma parte da memória entre a VM e a máquina host, utilizando um programa chamado [Looking Glass](https://looking-glass.io/) para transferir o framebuffer da VM para o host. Para que o Looking Glass funcione corretamente, vários fatores precisam ser abordados:

1. Crie uma área de memória para compartilhar entre o **cliente** e o **host**.
2. Execute o **binário do host Windows** na **VM**.
3. Execute o **cliente Looking Glass** na máquina host para visualizar a tela da VM.

### 1. Crie uma área de memória

Você precisa descobrir quanta memória precisa compartilhar, e pode fazer essa conta usando a seguinte fórmula:

```txt
largura x altura x tamanho do pixel x 2 = bytes do frame
```

Minha tela opera em resolução de `2560 x 1080` com cores de `32 bits (4 bytes)`. Então, meu cálculo será:

$$
2560 \times 1080 \times 4 \times 2 = 22118400
$$

$$
\frac{22118400}{1024 \times 1024} \approx 21,09 \, \text{MB}
$$

Agora, vamos ver qual potência de dois em MB é maior do que o espaço necessário.

Eu preciso de `21,09MB`. Algo entre `16MB` e `32MB`, sendo que `16MB` é menos do que eu preciso. Então, `32MB` é a escolha.

Edite a Máquina Virtual `win11` conforme abaixo:

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

#### Permissões

O arquivo de memória compartilhada, por padrão, é de propriedade do QEMU e não concede permissões de leitura/gravação para outros usuários, o que é necessário para o Looking Glass funcionar como esperado.

Adicione seu usuário ao grupo `qemu`.

```sh
sudo usermod -aG qemu $(whoami)
```

Crie um arquivo `/etc/tmpfiles.d/10-looking-glass.conf` com o seguinte conteúdo:

`vi /etc/tmpfiles.d/10-looking-glass.conf`

```conf
# Tipo   Caminho                Modo UID  GID Idade Argumento

f /dev/shm/looking-glass 0660 qemu qemu -
```

Adicione a regra `semanage` como `sudo`.

```sh
semanage fcontext -a -t svirt_tmpfs_t /dev/shm/looking-glass
```

### 2. Binário do host Windows

Na **Máquina Guest Windows**, baixe e execute o [Binário do Host Windows](https://looking-glass.io/artifact/stable/host), disponível em [looking-glass.io/downloads](https://looking-glass.io/downloads).

### 3. Cliente Looking Glass

#### Pacote Copr

Instalar o Looking Glass pode exigir a compilação e instalação de binários e suas dependências, mas, graças aos projetos **copr**, que são repositórios mantidos pela comunidade, a compilação não é necessária. Vamos instalar pelo **Copr.** Execute como \`sudo\`

```sh
dnf copr enable rariotrariowario/looking-glass-client -y
```

```sh
dnf install -y looking-glass-client
```

#### Compilação manual

Se você preferir não adicionar o **copr** e quer compilar tudo manualmente, faça o seguinte:

```sh
sudo dnf install distrobox podman -y
```

```sh
distrobox create looking-glass-build --image fedora:40

# Para entrar, execute:
#
# distrobox enter looking-glass-build
```

```sh
distrobox enter looking-glass-build
# Iniciando o contêiner...
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

Instale `looking-glass-client` copiando o executável de `looking-glass-B6/client/build` para `/usr/local/bin`

```sh
sudo cp -R looking-glass-B6/client/build/looking-glass-client /usr/local/bin/
```

Instale pacotes adicionais na **máquina host:**

```sh
sudo dnf install libXpresent -y
```

Você pode excluir o **contêiner do Distrobox** usado para compilar o Looking Glass.

```sh
distrobox stop looking-glass-build && distrobox rm looking-glass-build
```

### Criando uma Tela Virtual para Compartilhar

Para que o Looking Glass funcione corretamente, você precisa de uma tela acelerada para compartilhar. Isso pode ser obtido de duas maneiras:

- Conectando sua GPU a um monitor ou a um plug HDMI Dummy
- Usando um [driver de exibição virtual](/article/antigo-ipad-como-segunda-tela#driver-de-display-virtual).

Eu abordei o assunto sobre drivers de exibição virtual [neste artigo aqui](/article/antigo-ipad-como-segunda-tela#driver-de-display-virtual).

## Conclusão

O passthrough de GPU com as tecnologias **VFIO** e **IOMMU** oferece uma solução poderosa para executar máquinas virtuais com desempenho gráfico quase nativo. Esta configuração permite aproveitar ao máximo sua GPU dentro de uma VM, possibilitando tarefas exigentes como jogos ou cargas de trabalho **aceleradas por GPU**, mantendo a flexibilidade e segurança da virtualização.

Ao longo deste guia, cobrimos vários aspectos essenciais para a implementação do passthrough de GPU:

1. **Configuração de IOMMU e VFIO**: Discutimos a importância de configurar adequadamente os grupos IOMMU e configurar o VFIO para isolar a GPU.

2. **Dump do vBIOS**: Explicamos como fazer o dump e usar o vBIOS da GPU, o que pode ser essencial para certas configurações.

3. **Configuração do Dispositivo PCI**: Detalhamos o processo de adicionar dispositivos PCI à VM e configurá-los no XML.

4. **Resizable BAR**: Exploramos os benefícios do Resizable BAR e como ativá-lo para melhorar o desempenho.

5. **Scripts de Anexar e Desanexar**: Fornecemos scripts para conectar e desconectar a GPU do sistema host de forma fluida.

6. **Hugepages**: Discutimos a implementação de hugepages para otimizar a gestão de memória.

7. **Passagem de Dispositivos de Entrada**: Explicamos como passar dispositivos de entrada para uma experiência mais nativa na VM.

8. **Integração com Looking Glass**: Explicamos como configurar o Looking Glass para saída de vídeo de baixa latência da VM no host.

Seguindo estes passos, você pode criar um ambiente de máquina virtual de alto desempenho que rivaliza com o desempenho nativo em tarefas intensivas de GPU. Esta configuração é particularmente valiosa para usuários que precisam executar diferentes sistemas operacionais simultaneamente, mantendo acesso total às capacidades da GPU.

Lembre-se de que o passthrough de GPU pode ser complexo e pode exigir solução de problemas específica para sua configuração de hardware. Sempre faça backups do seu sistema e de dados importantes antes de fazer mudanças significativas em sua configuração.

À medida que as tecnologias de virtualização continuam a evoluir, o passthrough de GPU permanece uma ferramenta poderosa para entusiastas, desenvolvedores e profissionais que precisam do melhor dos dois mundos: o isolamento e a flexibilidade das máquinas virtuais combinados com o poder bruto do hardware gráfico dedicado.

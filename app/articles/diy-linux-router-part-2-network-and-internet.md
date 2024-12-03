---
title: "DIY Linux Router - Part 2 - Network and Internet"
articleId: "diy-linux-router-part-2-network-and-internet"
date: "2024-10-06"
author: "Carlos Junior"
category: "Linux"
brief: "In this second part, we will configure VLANs and their networks, set up a PPPoE connection, configure the DHCP server, and implement basic firewall rules."
image: "/assets/images/diy-linux-router/network.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-2-rede-e-internet"}]
---

This is the second part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- Part 7: [File Sharing](/article/diy-linux-router-part-7-file-sharing)
- Part 8: [Backup](/article/diy-linux-router-part-8-backup)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

In the first part, we covered the hardware setup and installed a basic Linux system using NixOS on top of a ZFS filesystem.
In this part, we will configure VLANs and their networks, set up a PPPoE connection, configure the DHCP server, and implement basic firewall rules.

![Network](/assets/images/diy-linux-router/network.webp)

## Table of Contents

- [VLANs](#vlans)
  - [The OSI model](#the-osi-model)
  - [What is VLAN](#what-is-vlan)
    - [Untagged VLANs](#untagged-vlans)
    - [Tagged VLANs](#tagged-vlans)
    - [Tagged on one port, Untagged on another](#tagged-on-one-port-untagged-on-another)
  - [Advantages](#advantages)
  - [Drawbacks](#drawbacks)
- [Network topology](#network-topology)
- [Mac Mini](#mac-mini)
  - [Networks](#networks)
- [NixOS config](#nixos-config)
- [Conclusion](#conclusion)

## VLANs

In this setup, I am using the **TP-Link TL-SG108E** and will make use of its VLAN capabilities.

### The OSI model

The network stack is split into 7 layers.

- **Layer 1**: Physical layer. Cables, NICs, and connectors.
- **Layer 2**: Data link layer, MAC Address, bridges, switches, and **VLANs**.
- **Layer 3**: Network layer, where the **IP Address** resides.
- **Layer 4**: Transport layer, like **TCP** and **UDP**.
- **Layer 5**: Session layer. The connection between a server application and the client.
- **Layer 6**: Presentation layer. Data formatting and character encoding.
- **Layer 7**: Application layer. The end-user application that consumes the data transferred and processed by the previous layers.

More details about the OSI Model [at this link](https://www.freecodecamp.org/news/osi-model-networking-layers-explained-in-plain-english/).

### What is VLAN

The role of VLANs is to segment the network without the need for physical segmentation. Without VLANs, to split a structure into various networks, you would need to use distinct switches and network adapters. We can call physical segmentation **Layer 1 segmentation**, while relying on VLANs to segment the network is known as **Layer 2 segmentation**.

**Layer 2** transports data as frames. These frames contain the **frame data** and the **frame header**, with various information like **Target MAC Address** and, optionally, a **VLAN tag**. The **VLAN** tag ensures that, on an appropriately configured smart switch, the **data frame** will reach the intended target network interface, identified by its **MAC Address**, to the intended network, or **PVID** as some switches name the segmented networks configured on them.

When you talk about VLANs, you are talking about segmenting the network. It prevents hosts on one network from reaching hosts on another network.

To use **VLANs**, you need to follow some guidelines:

- Each VLAN is intended to communicate with its intended network, identified as **PVID**.
- You can assign many *tagged* VLANs to a single port.
- Every **VLAN** will behave as a distinct **network adapter** on a host that the VLAN is associated with.
- Untagged traffic will be handled by the default **network** for its port. By default, this network tends to be **PVID 1**.

#### Untagged VLANs

On a managed switch, it is possible to create two or more **VLANs**, identified by their **PVIDs** (Physical VLAN ID), and split the network. This is like having two separate switches within the same physical hardware. For example, let's say we want to create two isolated networks that cannot communicate with each other. We can assign `PVID 1` to **ports 1 to 4** and `PVID 2` to **ports 5 to 8**. Any traffic from **port 1** will be able to reach **ports 2, 3, and 4**, but it will not reach any device connected to **ports 5, 6, 7, or 8**. The same applies the other way around. It's like having two 4-port switches within the same physical hardware.

#### Tagged VLANs

If you want to allow a device to reach two or more networks from the same port, you can tag this port using **VLAN tags**. The switch will look for the **VLAN Tag** in the **frame header** and direct this traffic to the intended **Network**. In practice, this is just like having two or more distinct network adapters connected to two or more network switches, but sharing the same physical network interface, cable, switch, and switch port, effectively segmenting this traffic over different networks without needing to physically segment it.

For example:

**Port 1** and **Port 3** are *tagged* to `VLAN 30` and `VLAN 90`.

- Any traffic from **port 1** tagged as `VLAN 30` or `VLAN 90` will only reach port 3.
- This traffic will be delivered as **tagged** to its VLAN on each side of the switch.
- The device connected to **port 3** needs to have the **VLAN tag** properly configured to handle this traffic. If not, the traffic is supposed to be rejected by the host.

#### Tagged on One Port, Untagged on Another

If the switch is smart enough, it can have a **tagged** frame on one port, to reach any device on some network as **untagged**. Effectively, what the switch does in that situation is receive this tagged **frame**, remove the **VLAN tag** from the **frame header**, and deliver it to some host on the intended **Network** as untagged.

In this setup, we will make use of this feature because my **ISP's PPPoE** connection does not expect to receive tagged **frames**. So I have to configure my switch as:

- Tag **Port 1** to **VLAN 2**.
- Assign **Port 2** to **PVID 2** as **untagged**.

Any **PPPoE** traffic from the **Mac Mini** will be delivered to the switch tagged as **VLAN 2**, the switch will strip out the **VLAN tag** from the **frame header** and deliver this frame on **Port 2** as untagged.

### Advantages

- **Cost-effective**: You can share one NIC, one cable, and one switch port across multiple networks.
- **Less cabling** because you don't need to rely on physical cabling and physical switches to split your network.
- **Easy to reassign**, as it is just a matter of reconfiguring the assignments on a network administrator panel.

### Drawbacks

- **Shared bandwidth**: You can have up to 4095 VLANs on the same cable, but as this traffic shares the same physical interface, the bandwidth for its VLAN connections will be shared too.
- **Complexity**: You need to keep track of which ports are assigned to which VLANs.
- **Host configuration**: Devices connected to tagged ports must be configured to handle the appropriate VLANs.

As this **Mac Mini** relies on a single network interface, in this setup, we will use VLANs to create our four intended networks.

You can argue that by sharing the same network interface, you are sharing the bandwidth for its interface, and this is true. Let's see what happens when I start downloading some content from a host on the **Home** network from the internet.

1. This host requests to download the content to the Mac Mini.
   - This traffic will reach the Mac Mini as **untagged** on **Port 1**.
2. The **Mac Mini** will request to download the content over PPPoE.
   - This traffic will be transferred over PPPoE as **tagged** **VLAN 2** on **Port 1**.
3. The **Mac Mini** will receive this traffic, perform **NAT** (Network Address Translation), and deliver it to the intended host on the **Home** network as **untagged** on **Port 1**.

Effectively, when downloading some content, the traffic will come and go over the same interface. It will **download** the content over **VLAN 2** and, at the same time, **upload** it as untagged to the **Home** network using the same interface.

On my 700 Mbps download and 150 Mbps upload connection, I haven't noticed any performance impact. **Speedtest** reports my download speed above 700 Mbps, around 720 Mbps at most, and upload at **150 Mbps**, better and more stable than through the router that my ISP provides me.

## Network topology

Let's have the following networks:

| Network      | Interface | VLAN      |
|--------------|-----------|----------:|
|10.1.78.0/24  | Home      | untagged  |
|10.30.17.0/24 | Guest     | 30        |
|10.90.85.0/24 | IoT       | 90        |
|PPPoE         | ppp0      | 2         |

Unfortunately, my **ISP** does not provide me with an **IPv6** connection. So let's focus solely on IPv4 for now, but I want to have an **IPv6** connection.

- The switch has 8 ports.
- **VLAN 1**: Ports 1, 3 to 8 are untagged.
- **VLAN 2**: Ports 1 and 2 are tagged.
- **VLAN 30**: Port 1 and 3 are tagged.
- **VLAN 90**: Port 1 and 3 are tagged.

```txt
    ┌─────────────► Mac Mini
    │   ┌─────────► WAN PPPoE 
    │   │   ┌─────► AP Unifi U6 Lite
    │   │   │   ┌─► Private Network
    │   │   │   │   ▲   ▲   ▲   ▲
┌───┴───┴───┴───┴───┴───┴───┴───┴───┐    
| ┌───┬───┬───┬───┬───┬───┬───┬───┐ |
| │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ |
| └───┴───┴───┴───┴───┴───┴───┴───┘ |
└───┬───┬───┬───┬───────────────────┘
    │   │   │   └─► 4-8 Untagged VLAN 1
    │   │   └─────► Untagged VLAN 1, Tagged VLAN 30, 90
    │   └─────────► Untagged VLAN 2
    └─────────────► Untagged VLAN 1, Tagged VLAN 2, 30, 90
```

## Mac Mini

Let's state how we will configure the networks on the **Mac Mini**:

### Networks

- **Home**: `10.1.78.0/24` is a bridge `br0`. I leave it untagged to make it easy to reach the computer over the network.
- **Guest**: `10.30.17.0/24` is `vlan30` (VLAN 30).
- **IoT**: `10.90.85.0/24` is `vlan90` (VLAN 90).
- **WAN**: `PPPoE` is the `wan` network for the PPPoE connection.

### Renaming Network Interface

In the past, network interfaces were arbitrarily named `eth0`, `eth1`, etc. The order of interfaces was defined during kernel initialization, which caused many problems. Today, the network card is identified by its physical connection on the bus. It works, but sometimes, during kernel updates or firmware upgrades, the network interface identification changes, causing problems. To address this, I wanted to rename my interface to something more persistent. All network cards have a MAC Address. I'll define the network card name by its address.

My network interface was previously named `enp4s0f0`. I'll rename it to `enge0` tied to the **MAC Address**.

## NixOS config

*Some parts I took from [Francis Blog](https://francis.begyn.be/blog/nixos-home-router)*.

Let's configure our server by editing the `.nix` files accordingly. To maintain the organization, let's create discrete files for its sections:

```bash
/etc/nixos
├── configuration.nix 
└── modules/ 
      ├── networking.nix       # Network settings/ enable NFTables
      ├── pppoe.nix            # PPPoE connection setup
      ├── services.nix         # Other services
      └── nftables.nft         # NFT Rules
```

### 1. Configuration files and folders

Create all the necessary folders and files:

```bash
touch /etc/nixos/modules/{{networking,pppoe,services}.nix,nftables.nft}
```

### 2. Basic config

Let's split our `configuration.nix` file into parts for better organization and maintainability.
Do not replace the entire file, but add the following lines.

To act as a router, add **forwarding** instruction to the kernel as well.

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
  ...
    ...
    [ 
      <nixos-hardware/apple/macmini/4> #Specific for the Mac Mini 2010
      ./hardware-configuration.nix
      ./modules/networking.nix
      ./modules/services.nix
      ./modules/pppoe.nix
      ./modules/users.nix
    ];
  
  # Add  ipv4 and ipv6 forwarding to act as a router
  boot.kernel.sysctl = {
    "net.ipv4.conf.all.forwarding" = true;
    "net.ipv6.conf.all.forwarding" = true;
  };
  ...

  environment.systemPackages = with pkgs; [
    bind
    conntrack-tools
    ethtool
    htop
    ppp
    openssl
    tcpdump
    tmux
    vim
  ];

  ...

}
```

### 3. Networking

We have our **network configuration** on `modules/networking.nix`.
As mentioned, this **Mac Mini** only has one NIC. To handle more than one Network, this setup relies on VLANs.

This NIC is identified `enp4s0f0`. from kernel.Check yours by following:

```bash
ip link show
```

```txt
ip link show 
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: wlp3s0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 60:63:9a:b2:c7:44 brd ff:ff:ff:ff:ff:ff
3: enp4s0f0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq master lan state UP mode DEFAULT group default qlen 1000
    link/ether c4:2c:03:36:46:38 brd ff:ff:ff:ff:ff:ff
```

As you can see, there are three interfaces:

1. `lo` which is the **Loopback interface,**
2. `wlp3s0` which is the **Wireless interface**
3. `enp4s0f0` being the **Ethernet interface**

To rename the interface, I'll use its **MAC Address** `c4:2c:03:36:46:38`. The new name will be `enge0`, meaning **Ethernet Gigabit 0**. Avoid names like `enoX`, `enpX`, `ensX`, or `ethX`.
The name pattern was chosen by following the naming mentioned in this blog post: [www.apalrd.net/posts/2023/tip_link/](https://www.apalrd.net/posts/2023/tip_link/#solution)

I would also define discrete **Mac addresses** by interface as this:

- A **Mac address** is 6 bytes or 6 segments of 1 byte each segment.
- Every interface will have its **MAC address** defined by the first **5 bytes** followed by its **Network ID**:
  - **br0** : `c4:2c:03:36:46`**`:ff`**
  - **wan** : `c4:2c:03:36:46`**`:02`**
  - **vlan30** : `c4:2c:03:36:46`**`:30`**
  - **vlan90** : `c4:2c:03:36:46`**`:90`**

To achieve that, create these **variables**:

- `mac_addr`: The real **Mac address**, in my case `c4:2c:03:36:46:38`.
- `mac_addr_refix:`: The four left bytes of the **Mac address**, `c4:2c:03:36:46`
- `nic`: Intended interface name, `enge0` at this case.

For configuring the network. I'll use **[systemd-network](https://www.freedesktop.org/software/systemd/man/latest/systemd.network.html)** which there's a plan of resources on a single piece of software.

My `network.nix` ended up like this:

`/etc/nixos/modules/networking.nix`

```nix
{ config, pkgs, ... }:
let
  nic = "enge0";
  mac_addr_prefix = "c4:2c:03:36:46";  
  mac_addr = "${mac_addr_prefix}:38";
  wan="wan"; # Matches with pppoe.nix
  guest="vlan30";
  iot="vlan90";
  ip_lan="10.1.78.1";
  ip_guest="10.30.17.1";
  ip_iot="10.30.85.1";
in
{
systemd.network = {
    enable = true;
    # Rename NIC
    links."10-${nic}" = {
      matchConfig.MACAddress = "${mac_addr}";
      linkConfig.Name = "${nic}";
    };

    netdevs = {
      "10-${lan}".netdevConfig = {
        Name = "${lan}";
        Kind = "bridge";
        MACAddress = "${mac_addr_prefix}:ff";
      };
      "10-${wan}" = {
        netdevConfig.Name = "${wan}";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:02";
        vlanConfig.Id = 2;
      };
      "10-${guest}" = {
        netdevConfig.Name = "${guest}";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:30";
        vlanConfig.Id = 30;
      };
      "10-${iot}" = {
        netdevConfig.Name = "${iot}";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:90";
        vlanConfig.Id = 90;
      };
    };
   
    # Connect the bridge device to NIC
    networks = {
      "10-${nic}" = {
        matchConfig.Name = "${nic}";
        networkConfig = {
          LinkLocalAddressing = "no";
          Bridge = "${lan}";
          VLAN = [ "${wan}" "${guest}" "${iot}" ];
        };
      };
     "10-${wan}" = {
        matchConfig.Name = "${wan}";
        networkConfig.LinkLocalAddressing = "no";
      };
     "10-${guest}" = {
        matchConfig.Name = "${guest}";
        networkConfig.Address = "${ip_guest}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig.DNS = [ "${ip_iot}" ];
      };
     "10-${iot}" = {
        matchConfig.Name = "${iot}";
        networkConfig.Address = "${ip_iot}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig.DNS = [ "${ip_iot}" ];
      };
      "10-${lan}" = {
        matchConfig.Name = "${lan}";
        networkConfig.Address = "${ip_lan}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig = {
          PoolOffset = 20;
          PoolSize = 150;
          DefaultLeaseTimeSec = 3600;
          MaxLeaseTimeSec = 7200;
          SendOption=[
            "15:string:home.example.com" // Replace with your own 
            "119:string:\x04home\x09example\x03com\x00" # To generate 119, https://jjjordan.github.io/dhcp119/
          ];
          DNS = [ "${ip_lan}" ];
        }; 
      };
    };
  };
  
  networking = {
    useDHCP = false;
    hostName = "macmini";
    firewall.enable = false;
    nftables = {
      enable = true;
      rulesetFile = ./nftables.nft;
      flattenRulesetFile = true;
    };
  };
}
```

### 4. PPPoE connection

We'll set up the PPPoE (Point-to-Point Protocol over Ethernet) connection for internet access. The configuration for this is located in the `modules/pppoe.nix` file.

`/etc/nixos/modules/pppoe.nix`

```nix
{ config, pkgs, ... }: {
  services.pppd = {
    enable = true;
    peers = {
      providername = {
        # Autostart the PPPoE session on boot
        autostart = true;
        enable = true;
        config = ''
          plugin pppoe.so 
          nic-wan
          user "testuser"
          password "password"
           
          noipdefault
          defaultroute 
          
          lcp-echo-interval 5
          lcp-echo-failure 3
          
          noauth
          persist
          noaccomp
  
          default-asyncmap
        '';
      };
    };
  };
}
```

### 5. Firewall

The Firewall configuration is done with `nftables`. We will do a basic but secure firewall configuration. It will prevent any connection incoming from the internet, as well as from the **Guest** and **IoT** Network while keeping everything open on the **LAN** network. I not doing the **Flow Offloading** setup as didn't end up working for me. You can try it yourself [here](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3).

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {

  chain input {
    type filter hook input priority filter; policy drop;

    # Allow trusted networks to access the router
    iifname "lo" counter accept
    iifname "br0" counter accept

    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }

  chain output {
    type filter hook output priority 100; policy accept;
  }

  chain forward {
    type filter hook forward priority filter; policy drop;

    # enable flow offloading for better throughput
    ip protocol { tcp, udp } flow offload @ftable

    # Allow trusted network WAN access
    iifname "br0" oifname "ppp0" counter accept comment "Allow trusted LAN to WAN"
    # Allow established WAN to return
    iifname "ppp0" oifname "br0" ct state established,related counter accept comment "Allow established back to LANs"
    # https://samuel.kadolph.com/2015/02/mtu-and-tcp-mss-when-using-pppoe-2/
    # Clamp MSS to PMTU for TCP SYN packets
    oifname "ppp0" tcp flags syn tcp option maxseg size set 1452
  }
}

table ip nat {
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    tcp flags syn tcp option maxseg size set 1452
  }
  # Setup NAT masquerading on the ppp0 interface
  chain postrouting {
    type nat hook postrouting priority filter; policy accept;
    oifname "ppp0" masquerade
  }
}
```

### 6. Services

To maintain organization, remove the **services** section from `configuration.nix` and place it on its file.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    envfs.enable = true;
    # Enable SSH Service
    openssh = {
      enable = true;
      settings.PermitRootLogin = "yes"; # Allow root login (optional, for security reasons, you may want to disable this)
      settings.PasswordAuthentication = true; # Enable password authentication
    };
  };
}
```

### 8. Apply changes

In the case of **Mac Mini**, there's an additional `hardware-configuration` set. Because is the first time rebuilding the configuration, add its channel as did during the installation process.

```bash
sudo nix-channel --add https://github.com/NixOS/nixos-hardware/archive/master.tar.gz nixos-hardware
sudo nix-channel --update
```

To make changes take effect, apply it with the following command:

```bash
nixos-rebuild switch
```

## Conclusion

That's all for now! In the next part, we'll enhance security by disabling `root` account login, enabling **SSH access** via key-based authentication, and further hardening the **Firewall** with more granular rules and permissions.

- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)

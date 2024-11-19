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

In the first part, we covered the hardware setup and installed a basic Linux system using NixOS on top of a ZFS filesystem.
In this part, we will configure VLANs and their networks, set up a PPPoE connection, configure the DHCP server, and implement basic firewall rules.

![Network](/assets/images/diy-linux-router/network.webp)

## Table of Contents

- [VLANs](#vlans)
  - [What is VLAN](#what-is-vlan)
    - [Untagged VLANs](#untagged-vlans)
    - [Tagged VLANs](#tagged-vlans)
    - [Mixing Tagged with Untagged](#mixing-tagged-with-untagged)
    - [Vantages](#vantages)
    - [Drawbacks](#drawbacks)
- [Network topology](#network-topology)
- [Mac Mini](#mac-mini)
  - [Networks](#networks)
- [NixOS config](#nixos-config)
- [Conclusion](#conclusion)

### VLANs

In this setup, I am using the **TP-Link TL-SG108E** and will make use its VLAN capabilities.

#### What is VLAN

To properly assign different networks using a single NIC, we need to leverage VLANs. But what exactly is a VLAN?

**VLAN** or **Virtual LAN**, allows you to create virtual networks, similar to virtual NICs, to split your network into two or more segments. On a managed switch, you can create VLANs and assign ports to each VLAN as **tagged** or **untagged**.

- You can assign many *tagged* VLANs to a single port.
- You can only assign one *untagged* VLAN to a port.

##### Untagged VLANs

On a managed switch, it is possible to create two or more **VLANs** and split the network. This is like having two separate switches within the same physical hardware. For example, let's say we want to create two isolated networks that cannot communicate with each other. We can assign `VLAN 1` to **ports 1 to 4** and `VLAN 2` to **ports 5 to 8**. Any traffic from **port 1** will be able to reach **ports 2, 3, and 4**, but it will not get any device connected to **ports 5, 6, 7, or 8**.

##### Tagged VLANs

Similarly, you can tag a port using **VLAN tags**. This allows a single port to handle traffic from multiple **VLANs**, as long as the traffic is properly tagged. In practice, this is like having two distinct network adapters connected to two network switches, but sharing the same physical network interface, cable, and switch port.

For example:

- **Port 1** is *tagged* with `VLAN 1` and `VLAN 2`.
- **Ports 2 to 4** are *untagged* for `VLAN 1`, and **ports 5 to 8** are *untagged* for **VLAN 2**.

Any traffic from **port 1** *tagged* as `VLAN 1` will reach devices on **ports 2 to 4**, but not those on **ports 5 to 8**. Similarly, traffic *tagged* as `VLAN 2` will reach devices on **ports 5 to 8**, but not those on **ports 2 to 4**.

##### Mixing Tagged with Untagged

Some switches allow you to mix *tagged* and *untagged* traffic on the same port. This is useful to share a port between two or more networks. Although it may sound complicated, it's quite simple in practice.

For example, suppose you have a company network for private traffic and want to allow guests to use the company's Wi-Fi without accessing the private network. On your gateway, you can configure two virtual LANs sharing the same NIC: a **Private LAN** (*untagged*) and a **Guest LAN** (*tagged* as `VLAN 2`). You can also configure your access points (APs) with two virtual LANs tied to two wireless networks: Private (untagged) and Guest (tagged as VLAN 2).

The switch configuration would be:

- **VLAN 1** (untagged) on all ports.
- **VLAN 2** (tagged) on ports 1 and 2.

In this setup:

The gateway is connected to **port 1**.
The AP is connected to **port 2**.

Any untagged traffic from **port 1** will communicate with devices on **ports 1 to 8** without issues. However, traffic tagged as `VLAN 2` from **port 1** will only reach **port 2**, and the device on **port 2** will only see `VLAN 2` traffic if configured to handle `VLAN 2`. If you connect a device to **port 2** without configuring `VLAN 2`, it will not receive any `VLAN 2` traffic and will reject it.

##### Vantages

- **Cost-effective**: You can share one NIC, one cable, and one switch port across multiple networks.

##### Drawbacks

- **Shared bandwidth**: Physical traffic and speed are shared between VLANs.
- **Complexity**: You need to keep track of which ports are assigned to which VLANs.
- **Host configuration**: Devices connected to tagged ports must be configured to handle the appropriate VLANs.

In our setup, we will configure three networks on the same interface. This means traffic from the **LAN**, **GUEST**, and **PPPoE WAN** networks share the same physical cable, effectively sharing bandwidth. For example, if you're streaming a movie, the traffic will be doubled: the Mac Mini will handle both the incoming traffic from the internet and the outgoing traffic to the device on your network.

On my 600 Mbps download and 150 Mbps upload connection, I haven't noticed any performance impact. This is because, while the Mac Mini is downloading content from the WAN, it is uploading it to the LAN, effectively behaving like a "half-duplex" connection. Since many internet connections, including fiber, are already half-duplex, this setup doesn't introduce significant performance issues. However, if you saturate the connection with more traffic, you may start to experience performance degradation.

## Network topology

Let's have the following networks:

| Network      | Interface | VLAN      |
|--------------|-----------|----------:|
|10.1.1.0/24   | Home      | untagged  |
|10.1.30.0/24  | Guest     | 30        |
|10.1.90.0/24  | IoT       | 90        |
|PPPoE         | ppp0      | 2         |

Let's focus only on IPV4 for now. But we can have IPV6 later.

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

### Mac Mini

This Mac Mini only has one Gigabit Ethernet port, this NIC will be tied to VLANs.

#### Networks

- **Home**: `10.1.1.0/24` is a bridge `br0`. I leave it untagged to make it easy to reach the computer over the network.
- **Guest**: `10.1.30.0/24` is `vlan30` (VLAN 30).
- **IoT**: `10.1.90.0/24` is `vlan90` (VLAN 90).
- **WAN**: `PPPoE` is `wan` network to **PPPoE** connection.

#### Renaming Network Interface

In the old days, the network interfaces were arbitrarily named `eth0`, `eth1`... The order of interfaces was defined during kernel initialization, which caused many problems. Today the network card is identified by their physical connection on the bus. It works, but sometimes, during kernel updates or firmware upgrades, the network interface identification changes, causing problems. Thinking about that, I wanted to rename my interface to something more persistent. All Network card has a **MAC Address**. I'll define the network card name by its address.

My network interface was previously named `enp4s0f0`. This is a persistent name defined by the driver and physical connection of the NIC on the bus, but this name can change sometimes. So I prefer to rename it to another thing more persistent. At case `enge0` tied to the **MAC Address**.

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
in
{
systemd.network = {
    enable = true;
    # Rename NIC
    links."10-ge0" = {
      matchConfig.MACAddress = "${mac_addr}";
      linkConfig.Name = "${nic}";
    };

    netdevs = {
      "10-br0".netdevConfig = {
        Name = "br0";
        Kind = "bridge";
        MACAddress = "${mac_addr_prefix}:ff";
      };
      "10-wan" = {
        netdevConfig.Name = "wan";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:02";
        vlanConfig.Id = 2;
      };
      "10-vlan30" = {
        netdevConfig.Name = "vlan30";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:30";
        vlanConfig.Id = 30;
      };
      "10-vlan90" = {
        netdevConfig.Name = "vlan90";
        netdevConfig.Kind = "vlan";
        netdevConfig.MACAddress = "${mac_addr_prefix}:90";
        vlanConfig.Id = 90;
      };
    };
   
    # Connect the bridge device to NIC
    networks = {
      "10-ge0" = {
        matchConfig.Name = "${nic}";
        networkConfig = {
          LinkLocalAddressing = "no";
          Bridge = "br0";
          VLAN = [ "wan" "vlan30" "vlan90" ];
        };
      };
     "10-wan" = {
        matchConfig.Name = "wan";
        networkConfig.LinkLocalAddressing = "no";
      };
     "10-vlan30" = {
        matchConfig.Name = "vlan30";
        networkConfig.Address = "10.1.30.1/24";
      };
     "10-vlan90" = {
        matchConfig.Name = "vlan90";
        networkConfig.Address = "10.1.90.1/24";
      };
      "10-br0" = {
        matchConfig.Name = "br0";
        networkConfig = {
          Address = "10.1.1.1/24";
          DHCPServer = "yes";
        };
        dhcpServerConfig = {
          PoolOffset = 20;
          PoolSize = 150;
          DefaultLeaseTimeSec = 3600;
          MaxLeaseTimeSec = 7200;
          SendOption=[
            "15:string:home.example.com" // Replace with your own 
            "119:string:\x04home\x09example\x03com\x00" # To generate 119, https://jjjordan.github.io/dhcp119/
          ];
          DNS = [ "10.1.1.1" "8.8.8.8" "1.1.1.1" ];
        };
      };
    };
  };
  
  networking = {
    useDHCP = false;
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

The Firewall configuration is done with `nftables`. We will do a basic but secure firewall configuration. It will prevent any connection incoming from the internet, as well as from the **guest** and **IoT** Network while keeping everything open on the **Home** network. I not doing the **Flow Offloading** setup as didn't end up working for me. You can try it yourself [here](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3).

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

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

This is the second part of a multipart series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Nextcloud and Jellyfin](/article/diy-linux-router-part-5-nextcloud-jellyfin)

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

In this setup, I am using the **TP-Link TL-SG108E** and will make use of VLANs.

#### What is VLAN

To properly assign different networks using a single NIC, we need to leverage VLANs. But what exactly is a VLAN?

**VLAN** or **Virtual LAN**, allows you to create virtual networks, similar to virtual NICs, to split your network into two or more segments. On a managed switch, you can create VLANs and assign ports to each VLAN as either **tagged** or **untagged**.

- You can assign many *tagged* VLANs to a single port.
- You can only assign one *untagged* VLAN to a port.

##### Untagged VLANs

On a managed switch, it is possible to create two or more **VLANs** and split the network. This is like having two separate switches within the same physical hardware. For example, let's say we want to create two isolated networks that cannot communicate with each other. We can assign `VLAN 1` to **ports 1 to 4** and `VLAN 2` to **ports 5 to 8**. Any traffic coming from **port 1** will be able to reach **ports 2, 3, and 4**, but it will not be able to reach any device connected to **ports 5, 6, 7, or 8**.

##### Tagged VLANs

Similarly, you can tag a port using **VLAN tags**. This allows a single port to handle traffic from multiple **VLANs**, as long as the traffic is properly tagged. In practice, this is like having two distinct network adapters connected to two distinct network switches, but sharing the same physical network interface, cable, and switch port.

For example:

- **Port 1** is *tagged* with `VLAN 1` and `VLAN 2`.
- **Ports 2 to 4** are *untagged* for `VLAN 1`, and **ports 5 to 8** are *untagged* for **VLAN 2**.

Any traffic coming from **port 1** *tagged* as `VLAN 1` will reach devices on **ports 2 to 4**, but not those on **ports 5 to 8**. Similarly, traffic *tagged* as `VLAN 2` will reach devices on **ports 5 to 8**, but not those on **ports 2 to 4**.

##### Mixing Tagged with Untagged

Some switches allow you to mix *tagged* and *untagged* traffic on the same port. This is useful when you want to share a port between two or more networks. Although it may sound complicated, it's quite simple in practice.

For example, suppose you have a company network for private traffic and want to allow guests to use the company's Wi-Fi without accessing the private network. On your gateway, you can configure two virtual LANs sharing the same NIC: a **Private LAN** (*untagged*) and a **Guest LAN** (*tagged* as `VLAN 2`). You can also configure your access points (APs) with two virtual LANs tied to two wireless networks: Private (untagged) and Guest (tagged as VLAN 2).

The switch configuration would be:

- **VLAN 1** (untagged) on all ports.
- **VLAN 2** (tagged) on ports 1 and 2.

In this setup:

The gateway is connected to **port 1**.
The AP is connected to **port 2**.

Any untagged traffic from **port 1** will communicate with devices on **ports 1 to 8** without any issues. However, traffic tagged as `VLAN 2` from **port 1** will only reach **port 2**, and the device on **port 2** will only see `VLAN 2` traffic if it is configured to handle `VLAN 2`. If you connect a device to **port 2** without configuring `VLAN 2`, it will not receive any `VLAN 2` traffic and will reject it.

##### Vantages

- **Cost-effective**: You can share one NIC, one cable, and one switch port across multiple networks.

##### Drawbacks

- **Shared bandwidth**: Physical traffic and speed are shared between VLANs.
- **Complexity**: You need to keep track of which ports are assigned to which VLANs.
- **Host configuration**: Devices connected to tagged ports must be configured to handle the appropriate VLANs.

In our setup, we will configure three networks on the same interface. This means that traffic from the **LAN**, **GUEST**, and **PPPoE WAN** networks will share the same physical cable, effectively sharing bandwidth. For example, if you're streaming a movie, the traffic will be doubled: the Mac Mini will handle both the incoming traffic from the internet and the outgoing traffic to the device on your network.

On my 600 Mbps download and 150 Mbps upload connection, I haven't noticed any performance impact. This is because, while the Mac Mini is downloading content from the WAN, it is simultaneously uploading it to the LAN, effectively behaving like a "half-duplex" connection. Since many internet connections, including fiber, are already half-duplex, this setup doesn't introduce any significant performance issues. However, keep in mind that as if you saturate connection with more traffic, you may start to experience performance degradation.

## Network topology

Let's have the following networks:

| Network      | Interface | VLAN      |
|--------------|-----------|----------:|
|10.1.1.0/24   | Lan       | untagged  |
|10.1.30.0/24  | Guest     | 30        |
|10.1.90.0/24  | IoT       | 90        |
|PPPoE         | PPP0      | 2         |

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

As far as this Mac Mini only has one Gigabit Ethernet port, this NIC will be tied to VLANs.

#### Networks

- `10.1.1.0/24` is a bridge bound to the NIC. In my case `enp4s0f0`. I leave it as untagged to be easy to reach the computer over the network, if I have some ssue with my switch.
- `10.1.30.0/24` is `enp4s0f0.30` (VLAN 30) as `guest` network.
- `10.1.90.0/24` is `enp4s0f0.90` (VLAN 90) as `iot` network.
- `PPPoE` is `enp4s0f0.2` as `wan` network to PPPoE connection.

## NixOS config

*Some parts I took from [Francis Blog](https://francis.begyn.be/blog/nixos-home-router)*.

Let's configure our server by editing the `.nix` files accordingly. To maintain the organization, let's create discrete files for its sections as:

```bash
/etc/nixos
├── configuration.nix 
└── modules/ 
      ├── networking.nix  # Network settings/ enables NFTables
      ├── pppoe.nix       # PPPoE connection setup
      ├── services.nix    # Other services
      ├── nftables.nft    # NFT Rules
      └── dhcp_server.kea # DHCP Server Configuration
```

### 1. Configuration files and folders

Create all the necessary folders and files:

```bash
mkdir -p /etc/nixos/modules
touch /etc/nixos/modules/{{networking,pppoe,services}.nix,nftables.nft,dhcp_server.kea}
```

### 2. Basic config

Let's split our `configuration.nix` file into parts for better organization and maintainability.
Do not replace the entire file, but just add the following lines.

`/etc/nixos/configuration.nix`

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
  ...
  boot = {
    ...
    kernel.sysctl = {
      "net.ipv4.conf.all.forwarding" = true;
      "net.ipv6.conf.all.forwarding" = false;
    };
  };

  ...

  imports = [
    ./modules/networking.nix
    ./modules/services.nix
    ./modules/pppoe.nix
  ];

  environment.systemPackages = with pkgs; [
    bind
    conntrack-tools
    ethtool
    htop
    ppp
    openssl
    tcpdump
    vim
  ];

  ...

}
```

### 3. Networking

We have our **network configuration** on `modules/networking.nix`.
As mentioned before, our Mac Mini only has one NIC, this setup relies on VLANs to split the network into the intended parts.VLANs, 1, 30, and 90.

In the example, I'm using the Macmini's NIC `enp4s0f0`. Verify your NIC identification by running:

```bash
ip link
```

```txt
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: enp4s0f0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP mode DEFAULT group default qlen 1000
    link/ether c4:2c:90:65:50:13 brd ff:ff:ff:ff:ff:ff
3: wlp3s0b1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 60:34:4c:13:41:f0 brd ff:ff:ff:ff:ff:ff
```

`/etc/nixos/modules/networking.nix`

```nix
{ config, pkgs, ... }:
let nic = "enp1s0"; # Your main network adapter

{
  kea.dhcp4.enable = true;
  kea.dhcp4.configFile = ./dhcp_server.kea;
  networking = {
    useDHCP = false;
    hostName = "macmini";
    nameservers = [ "1.1.1.1" "8.8.8.8" ];
   
    # Define VLANS
    vlans = {
      wan = { id = 2; interface = "${nic}"; };
      guest = { id = 30; interface = "${nic}"; };
      iot = { id = 90; interface = "${nic}"; };
    };
    #Lan será uma ponte de rede.
    bridges = {
      "lan" = { interfaces = [ "${nic}" ]; };
    };
    interfaces = {
      "${nic}".useDHCP = false;
      # Gerenciando as VLAns
      wan.useDHCP = false;
      lan = { ipv4.addresses = [{ address = "10.1.1.1";  prefixLength = 24; } ]; };
      guest = { ipv4.addresses = [{ address = "10.1.30.1"; prefixLength = 24; }]; };
      iot = { ipv4.addresses = [{ address = "10.1.90.1"; prefixLength = 24; } ]; };
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

The Firewall configuration is done with `nftables`. We will do a very basic, but secure firewall configuration in the file `nftables.nft`. This setup will prevent any connection incoming from the internet, as well as from the guest network, while keeping everything open to the private network.
The `flow offloading` rule. Which is aimed to improve network performance through the networks and the internet didn't worked as expected for me and because of that, I leaved it commented out on this tutorial, as you can try by yourself. [Details here](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3).

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  # Flow offloading for better throughput. Remove it you you have troubles with.
  flowtable f {
    hook ingress priority 0
    devices = { ppp0, lan }
  }

  chain input {
    type filter hook input priority filter 
    policy drop

    # Allow trusted networks to access the router
    iifname {"lan","enp6s0"} counter accept

    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }

  chain output {
    type filter hook output priority 100
    policy accept
  }

  chain forward {
    type filter hook forward priority filter 
    policy drop

    # enable flow offloading for better throughput
    ip protocol { tcp, udp } flow offload @f

    # Allow trusted network WAN access
    iifname { "lan",} oifname "ppp0" counter accept comment "Allow trusted LAN to WAN"

    # Allow established WAN to return
    iifname "ppp0" oifname {"lan",} ct state established,related counter accept comment "Allow established back to LANs"
    # https://samuel.kadolph.com/2015/02/mtu-and-tcp-mss-when-using-pppoe-2/
    # Clamp MSS to PMTU for TCP SYN packets
    oifname "ppp0" tcp flags syn tcp option maxseg size set rt mtu
  }
}

table ip nat {
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
  }
  # Setup NAT masquerading on the ppp0 interface
  chain postrouting {
    type nat hook postrouting priority filter; policy accept;
    oifname "ppp0" masquerade
  }
}
```

### 6. DHCP Server

Our **DHCP Server** configuration wil be done by `kea.dhcp4`

`/etc/nixos/modules/dhcp_server.kea`

```json
{
  "Dhcp4": {
    "valid-lifetime": 4000,
    "renew-timer" : 1000,
    "rebind-timer": 200,

    "interfaces-config" : { 
      "interfaces": [ "lan", "guest", "iot" ]
    },

    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/dhcp4.leases"
    },
    
    "subnet4" : [
      {
        "id": 1,
        "interface" : "lan",
        "subnet": "10.1.1.0/24",
        "pools": [ { "pool": "10.1.1.100 - 10.1.1.200" } ],
        "option-data": [
          { "name": "routers", "data": "10.1.1.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8" },
          { "name": "domain-search", "data": "example.com" }
        ]
      },
      {
        "id": 2,
        "interface" : "guest",
        "subnet": "10.1.30.0/24",
        "pools": [ { "pool": "10.1.30.100 - 10.1.30.200" } ],
        "option-data": [
          { "name": "routers", "data": "10.1.30.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8" },
        ]
      },
      {
        "id": 3,
        "interface" : "iot",
        "subnet": "10.1.90.0/24",
        "pools": [ { "pool": "10.1.90.100 - 10.1.90.200" } ],
        "option-data": [
          { "name": "routers", "data": "10.1.90.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8" },
        ]
      }
    ]
  }
}
```

### 7. Services

On `services.nix` file we have most of the services we need. We will enable the **SSH service** as the **Kea DHCP Server** service.
As a temporary measure, let's enable login SSH with user `root` with password authentication.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    # Enable SSH Service
    openssh = {
      enable = true;
      settings.PermitRootLogin = "yes"; # Allow root login (optional, for security reasons you may want to disable this)
      settings.PasswordAuthentication = true; # Enable password authentication
    };
  };
}
```

### 8. Apply changes

As initially we not have configured the boot partition, we need to mount the partitions first.

```bash
mount /dev/sda2 /boot
```

To changes take effect, is needed to apply the changes made so far executing the following command:

```bash
nixos-rebuild switch
```

## Conclusion

That's all for now! In the next part, we'll focus on enhancing security by disabling root account login, enabling SSH access via key-based authentication, and further hardening the firewall with more granular rules and permissions.

- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)

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

As far as this Mac Mini only has one Gigabit Ethernet port, this NIC will be tied to VLANs.

#### Networks

- **Home** : `10.1.1.0/24` is a bridge `br0`. I leave it as untagged to be easy to reach the computer over the network.
- **Guest**: `10.1.30.0/24` is `enge0.30` (VLAN 30).
- **IoT**  : `10.1.90.0/24` is `enge0.90` (VLAN 90).
- **WAN**  : `PPPoE` is `enge0.2` network to **PPPoE** connection.

My network interface is named originally as `enp4s0f0`. This is a persistent name defined by the driver and physical connection of the NIC on the bus, but this name can change sometimes. So I prefer to rename it to another thing more persistent. At case `enge0` tied to the **MAC Address**.

## NixOS config

*Some parts I took from [Francis Blog](https://francis.begyn.be/blog/nixos-home-router)*.

Let's configure our server by editing the `.nix` files accordingly. To maintain the organization, let's create discrete files for its sections as:

```bash
/etc/nixos
├── configuration.nix 
└── modules/ 
      ├── kea_dhcp4_server.nix # DHCP Server Configuration
      ├── networking.nix       # Network settings/ enables NFTables
      ├── pppoe.nix            # PPPoE connection setup
      ├── services.nix         # Other services
      └── nftables.nft         # NFT Rules
```

### 1. Configuration files and folders

Create all the necessary folders and files:

```bash
mkdir -p /etc/nixos/modules
touch /etc/nixos/modules/{{kea_dhcp4_server,networking,pppoe,services}.nix,nftables.nft}
```

### 2. Basic config

Let's split our `configuration.nix` file into parts for better organization and maintainability.
Do not replace the entire file, but just add the following lines.

As will act as a router, add **forwarding** instruction to the kernel as well.

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
  ...
    ...
    [ 
      <nixos-hardware/apple/macmini/4> #Specific for the Mac Mini 2010
      ./hardware-configuration.nix
      ./modules/kea_dhcp4_server.nix
      ./modules/networking.nix
      ./modules/services.nix
      ./modules/pppoe.nix
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

As you can see, there's tree interfaces:

1. `lo` which is the **Loopback interface,**
2. `wlp3s0` which is the **Wireless interface**
3. `enp4s0f0` being the **Ethernet interface**

The interface we going to rename is `enp4s0f0` with the **MAC Address** `c4:2c:03:36:46:38`. The new name will be `enge0`, meaning **Ethernet Gigabit 0**. Avoid names like `enoX`, `enpX`, `ensX`, `ethX` and so on.
The name pattern was chosen by following the naming mentioned on this blog post: [www.apalrd.net/posts/2023/tip_link/](https://www.apalrd.net/posts/2023/tip_link/#solution)

I would also define discrete **Mac addresses** by interface as this:

- A **Mac address** is formed of 6 bytes, or 6 segments of 1 byte each.
- Every interface will have it's **MAC address** defined by the first **5 bytes** followed by it's **Network ID**:
  - **br0** : `c4:2c:03:36:46`**`:01`**
  - **enge0.2** : `c4:2c:03:36:46`**`:02`**
  - **enge0.30** : `c4:2c:03:36:46`**`:30`**
  - **enge0.90** : `c4:2c:03:36:46`**`:90`**

To achieve that, those **variable**:

- `mac_addr`: The real **Mac address**, in my case `c4:2c:03:36:46:38`.
- `mac_addr_refix:`: The four left bytes of the **Mac address**, `c4:2c:03:36:46`
- `nic`: Intended interface name, `enge0` at this case.

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
  services.udev.extraRules = ''
    SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="${mac_addr}", NAME="${nic}"
  '';
  
  networking = {
    useDHCP = false;
    hostName = "macmini";
    nameservers = [ "8.8.8.8" "8.8.4.4" ];

    # Define VLANS
    vlans = {
      "${nic}.2" = { id = 2; interface = "${nic}"; };
      "${nic}.30" = { id = 30; interface = "${nic}"; };
      "${nic}.90" = { id = 90; interface = "${nic}"; };
    };

    # Lan will be a bridge to the main adapter.
    bridges = {
      br0 = { interfaces = [ "${nic}" ]; };
    };

    interfaces = {
      "${nic}".useDHCP = false;

      # Handle VLANs
      "${nic}.2" = {
        useDHCP = false;
        macAddress = "${mac_addr_prefix}:02";
      };
      "br0" = {
        macAddress = "${mac_addr_prefix}:01";
        ipv4.addresses = [{ address = "10.1.1.1"; prefixLength = 24; }];
      };
      "${nic}.30" = {
        macAddress = "${mac_addr_prefix}:30";
        ipv4.addresses = [{ address = "10.1.30.1"; prefixLength = 24; }];
      };
      "${nic}.90" = {
        macAddress = "${mac_addr_prefix}:90";
        ipv4.addresses = [{ address = "10.1.90.1"; prefixLength = 24; }];
      };
    };

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
          nic-enge0.2
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
  flowtable ftable {
    hook ingress priority filter
    devices = { "br0", "ppp0" }
  }

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

### 6. DHCP Server

Our **DHCP Server** configuration wil be done by `kea.dhcp4`

`/etc/nixos/modules/kea_dhcp4_server.nix`

```nix
{ config, pkgs, ... }:
{ 
  systemd.services.kea-dhcp4-server = {
    enable = true;
    preStart = ''
      for iface in br0 enge0.30 enge0.90; do
        while ! ${pkgs.iproute2}/bin/ip link show "$iface" up &> /dev/null; do
          echo "Waiting for interface $iface to be up..."
          sleep 1
        done
        echo "Interface $iface is up"
      done
      sleep 5
      exit 0
    '';
  };
  services.kea.dhcp4.enable=true;
  services.kea.dhcp4.settings = {
    interfaces-config = {
      interfaces = ["br0" "enge0.30" "enge0.90"];
      dhcp-socket-type= "raw";
    };
    lease-database = {
      name = "/var/lib/kea/kea-leases4.csv";
      persist = true;
      type = "memfile";
    };
    rebind-timer = 2000;
    renew-timer = 1000;
    valid-lifetime = 4000;
    subnet4 = [
      {
        subnet = "10.1.1.0/24";
        interface = "br0";
        description = "Home";
        pools = [ { pool = "10.1.1.100 - 10.1.1.200"; } ]; 
        option-data = [
          { name = "routers"; data = "10.1.1.1"; }
          { name = "domain-name-servers"; data = "8.8.8.8"; } 
          { name = "domain-search"; data = "example.com"; } 
        ];
      }
      {
        subnet = "10.1.30.0/24";
        interface = "enge0.30";
        description = "Guest"
        pools = [ { pool = "10.1.30.100 - 10.1.30.200"; } ];
        option-data = [
          { name = "routers"; data = "10.1.30.1"; }
          { name = "domain-name-servers"; data = "8.8.8.8"; } 
        ];
      }
      {
        subnet = "10.1.90.0/24";
        interface = "enge0.90";
        description = "IoT";
        pools = [ { pool = "10.1.90.100 - 10.1.90.200"; } ]; 
        option-data = [
          { name = "routers"; data = "10.1.90.1"; }
          { name = "domain-name-servers"; data = "8.8.8.8"; } 
        ];
      }
    ];
  };
}
```

### 7. Services

Remove the `services` from `configuration.nix` and place it at `services.nix` file we have most of the services we need. We will enable the **SSH service** as the **Kea DHCP Server** service.
As a temporary measure, let's enable login SSH with user `root` with password authentication.

`/etc/nixos/modules/services.nix`

```nix
{ config, pkgs, ... }:

{
  services = {
    envfs.enable = true;
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

In case of having **hardware-configuration** set, as is the first time we rebuild the configuration, is needed to add the channels as did during the installation.

```bash
sudo nix-channel --add https://github.com/NixOS/nixos-hardware/archive/master.tar.gz nixos-hardware
sudo nix-channel --update
```

To changes take effect, is needed to apply the changes made so far executing the following command:

```bash
nixos-rebuild switch
```

## Conclusion

That's all for now! In the next part, we'll focus on enhancing security by disabling root account login, enabling SSH access via key-based authentication, and further hardening the firewall with more granular rules and permissions.

- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)

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
other-langs : [{"lang":"pt","article":"roteador-internet-linux-parte-2-rede"}]
---

This is the second part of a multipart series describing how to build your own Linux router.

* Part 1: [Initial Setup](/articles/diy-linux-router-part-1-initial-setup)

In the first part, we covered the hardware setup and installed a basic Linux system using NixOS on top of a ZFS filesystem.
In this part, we will configure VLANs and their networks, set up a PPPoE connection, configure the DHCP server, and implement basic firewall rules.

![Network](/assets/images/diy-linux-router/network.webp)

### VLANs

TL-SG108E is the Switch I am using on this setup with the following config:

#### What is VLAN

To properly assign the different networks using a single NIC, we need to leverage on VLANs, but what is a VLAN.

**VLAN** or **Virtual LAN**, is the ability for creating virtual networks, as virtual NICs for splitting our network in two or more networks. On switch, it's possible to create VKANs and assign ports from switch to each VLAN as both *tagged* on *untagged*.

* You can assing many *tagged* networks as you want to a single port.
* You can only assing one network as *untagged* to a port.

##### Untagged VLANs

On a manageable switch, is possible to create two or more VLANs and split the network. At that way, is as if you have two switchs at the same phisical hardware. Per example: lets say we want to create two discrete networks with one not being able to talk with other. We can create a VLAN 1 at ports 1 to 4, and VLAN 2 at ports 2 to 4. Any traffic comming from Port 1 will be able to reach ports 2, 3 and 4. But unable to reach any host phisically connected to ports 5, 6, 7 8.

##### Tagged VLANs

At the same manner, it's possible to tag a port using something named VLAN tags. To this way, you can address one of the ports from the switch to talk with the two VLANs we created, as far as the package comming from the host is properly tagged. In pratice, doing that is like having two distinct network adapter connected to two distinct network switches, but sharing the same physical network interface, the same cable and the same port on switch, Example:
Port 1 tagged with VLAN 1 and tagged with VLAN 2. Ports 2 to 4 is untagged to VLAN 1, and ports 4 to 8 is untagged to VLAN 2.
Any traffic comming from port 1 tagged as VLAN 1 will reach any host on ports 2 to 4, but neither one from 5 to 8, while any traffic comming from port 1 tagged as VLAN2 will reach any host on ports 5 to 8, but neither from 2 to 4.

##### Mixing Tagged with Untagged

The third option isn't compatible with all switches, which is mixing **tagged** and **untagged** traffic to some ports. This is useful when you want to share ports from switch with two or more networks. Looks a bit complicated but is simple. Let's see:
Suppose we have company network for private traffic and we want to allow guests to use the companies Wifi connection, but unable to access our private network. On our gateway, we will have two virtual LANs sharing the same NIC. A Private LAN configured as standard and Guest LAN configured as VLAN 2. We also deployed APs with the same configuration, two virtual LANs tied to two Wireless connections, **Private** as default and **guest** with VLAN2.
Our switch configuration will be:

* VLAN 1 **untagged** to all ports.
* Ports 1 and 2 as **tagged** ports on VLAN 2

Our gateway is connected to **port 1**, while the AP is connected to **port 2**. Any traffic comming from any port will communicate with any device connected from port 1 to 8 without any issue. Traffic comming from port 1 tagged as VLAN 2 will only reach port 2 as tagged and the device on the port 2 will only be able to see the traffic from VLAN 2 only if the the VLAN2 is configured at the target device. If you connect any device to port 2 without configuring the VLAN 2 on this device, it will be unable to receive any traffic tagged as VLAN2 and will reject any traffic comming from VLAN2.

##### Vantages

* Cost less to implement, as you share one NIC, one cable and one port from switch.

##### Drawbacks

* Phisical traffic and speed is shared between VLANs.
* Needs to take note of what ports are tied to what VLAN.
* Configure VLANs on hosts tied to tagged ports of the switch.

## Network topology

Let's have the following networks:

| Network      | Interface | VLAN      |
|--------------|-----------|----------:|
|10.1.144.0/24 | LAN       | untagged  |
|10.1.222.0/24 | GUEST     | 222       |
|PPPoE         | PPP0      | 333       |

Let's focus only on IPV4 for now. But we can have IPV6 later.


* The switch has 8 ports.
* **VLAN 144**: Ports 1, 3, 4, 5, 6, 7, 8 are untagged.
* **VLAN 222**: Ports 1 and 2 are tagged.
* **VLAN 333**: Port 1 and 3 are tagged.

```txt
    ┌─────────────► Mac Mini
    │   ┌─────────► AP Unifi U6 Lite
    │   │   ┌─────► WAN PPPoE
    │   │   │   ┌─► Private Network
    │   │   │   │   ▲   ▲   ▲   ▲
┌───┴───┴───┴───┴───┴───┴───┴───┴───┐    
| ┌───┬───┬───┬───┬───┬───┬───┬───┐ |
| │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ |
| └───┴───┴───┴───┴───┴───┴───┴───┘ |
└───┬───┬───┬───┬───────────────────┘
    │   │   │   └─► 4-8 Untagged VLAN 144
    │   │   └─────► Untagged VLAN 333
    │   └─────────► Untagged VLAN 144, Tagged VLAN 222
    └─────────────► Untagged VLAN 144, Tagged VLAN 333, 222
```

### Mac Mini

As far as this Mac Mini only has one Gigabit Ethernet port, this NIC will be tied to VLANs.

#### Networks

* `10.1.144.0/24` is a bridge bound to the NIC. In my case `enp4s0f0`. I leave it as untagged to be easy to reach the computer over the network, if I have some issue with my switch.
* `10.1.222.0/24` is `enp4s0f0.222` (VLAN 222) as `guest` network.
* `PPPoE` is `enp4s0f0.333` as `wan` network.

## NixOS config

*Some parts I took from [Francis Blog](https://francis.begyn.be/blog/nixos-home-router)*.

Let's configure our server by editing the `.nix` files accordingly. To maintain the organization, let's create discrete files for its sections as:

```bash
/etc/nixos
├── configuration.nix 
└── modules/ 
      ├── networking.nix # Network settings/ enables NFTables
      └── pppoe.nix      # PPPoE connection setup
      └── services.nix   # Other services
      └── nftables.nft   # Firewall's NFTables rules
```

### 1. Basic config

Let's split our `configuration.nix` file into parts. As we are already editing the file, let's take advantage and enable packet forwarding, as the most basic thing a router does, and route traffic between networks.

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
  system.stateVersion = "24.05";
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.supportedFilesystems = [ "zfs" ];

    boot.kernel.sysctl = {
    "net.ipv4.conf.all.forwarding" = true;
    "net.ipv6.conf.all.forwarding" = false;
  };

  fileSystems = {
    "/" = {
      device = "rpool/root/nixos";
      fsType = "zfs";
    };

    "/boot" = {
      device = "/dev/sda1"; 
      fsType = "vfat";
      options = [ "noatime" "discard" ];
    };
  };
    
  
  # Importing the other modules
  imports = [
    ./modules/networking.nix
    ./modules/firewall.nix
    ./modules/services.nix
    ./modules/pppoe.nix
    ./modules/dhcp_server.nix
  ];

  environment.systemPackages = with pkgs; [
    vim
    htop
    ppp
    ethtool
    tcpdump
    conntrack-tools
  ];

  # Set the hostId for ZFS
  networking.hostId = "38e3ee20";
}
```

### 2. Networking

Let's add our network configuration to `modules/networking.nix`.
As mentioned before, our Mac Mini only has one NIC, this setup relies on VLANs to split the network into the intended parts.VLANs, 144, 222, and 333.

`/etc/nixos/modules/networking.nix`

```nix
{ config, pkgs, ... }:
let nic = "enp1s0"; # Your main network adapter
in
{
  networking = {
    useDHCP = false;
    hostName = "macmini";
   
    # Define VLANS
    vlans = {
      wan = {
        id = 333;
        interface = nic;
      };
      guest = {
        id = 222;
        interface = nic;
      };
    };
    #Lan will be a bridge to the main adapter. Easier to maintain
    bridges = {
      "lan" = { 
        interfaces = [ nic];
      };
    };
    interfaces = {
      # Don't request DHCP on the physical interfaces
      "${nic}".useDHCP = false;
      # Handle VLANs
      wan = {
        useDHCP = false;
      };
      guest = {
        ipv4.addresses = [{
          address = "10.1.222.1";
          prefixLength = 24;
        }];
      };
      lan = {
        ipv4.addresses = [{ 
          address = "10.1.144.1"; 
          prefixLength = 24; } 
        ];
      };
    };
    #Firewall
    firewall.enable = false;
    nftables = {
      #Workaround mentioned at the firewall section
      preCheckRuleset = "sed 's/.*devices.*/devices = { lo }/g' -i ruleset.conf";
      enable = true;
      rulesetFile = ./nftables.nft;
      flattenRulesetFile = true;
    };
  };
}
```

### 5. PPPoE connection

WAN connection will be managed by a PPPoE connection, which will be available in `modules/pppoe.nix`

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

### 6. Firewall

The Firewall configuration is done with `nftables`. We will do a very basic, but secure firewall configuration in the file `nftables.nft`. This setup will prevent any connection incoming from the internet, as well as from the guest network, while keeping everything open to the private network.
It's important to note that there's a problem with the `flow offloading` rule. When validating the rules, it checks for flow offloading configuration, but the routine gives an error because the interface `ppp0` does not exist during the build time of NixOS. However, there's a [workaround](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3) by adding:

`/etc/nixos/modules/nftables.nft`

```nix
table inet filter {
  # enable flow offloading for better throughput
  flowtable f {
    hook ingress priority 0;
    devices = { ppp0, lan };
  }

  chain output {
    type filter hook output priority 100; policy accept;
  }

  chain input {
    type filter hook input priority filter; policy drop;

    # Allow trusted networks to access the router
    iifname {
      "lan","enp6s0"
    } counter accept

    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }

  chain forward {
    type filter hook forward priority filter; policy drop;

    # enable flow offloading for better throughput
    ip protocol { tcp, udp } flow offload @f

    # Allow trusted network WAN access
    iifname {
            "lan",
    } oifname {
            "ppp0",
    } counter accept comment "Allow trusted LAN to WAN"

    # Allow established WAN to return
    iifname {
            "ppp0",
    } oifname {
            "lan",
    } ct state established,related counter accept comment "Allow established back to LANs"
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

### 7. DHCP Server

If somebody connects to the network, they need to have an IP address. Let's configure our DHCP server.

`/etc/nixos/modules/dhcp_server.nix`

```nix
{ config, pkgs, ... }:
{
  services.dnsmasq = {
    enable = true;
    settings = {
      interface = [ "lan" "guest" ];
      dhcp-range = [
        "lan,10.1.144.100,10.1.144.150,12h"  # LAN range
        "guest,10.1.222.100,10.1.222.150,12h"  # Guest range
      ];
      dhcp-option = [
        "6,10.1.1.62,8.8.8.8,8.8.4.4,208.67.222.22,208.67.220.220"  
      ];
    };
  };
}
```

### 8. Services

Everything seems to be configured as intended, but services. Enabling root password login is a temporary measure, as it is risky to leave it that way. This will be temporary, and soon we will address that.

`/etc/nixos/modules/services.nix`

```nix
{config, pkgs, ... }: {
  # Enable SSH service
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "yes"; # Allow root login (optional, for security reasons you may want to disable this)
      PasswordAuthentication = true;  # Enable password authentication
    };
  };
}
```

## Conclusion

That's all for now! In the next part, we'll focus on enhancing security by disabling root account login, enabling SSH access via key-based authentication, and further hardening the firewall with more granular rules and permissions.

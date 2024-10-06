---
title: "DIY Linux Router - Part 2 - Network and Internet"
articleId: "diy-linux-router-part-2-network-and-internet"
date: "2024-10-06"
author: "Carlos Junior"
category: "Linux"
brief: "Doing a new life to an old Mac Mini as a capable Linux router and homelab"
image: "/assets/images/what-is-cloudflare/macmini.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-internet-linux-parte-1-configuracao-inicial"}]
---

This is the second part of a multipart series describing how to build your own Linux router.

* Part 1: [Initial Setup](/articles/diy-linux-router-part-1-initial-setup)

In the first part, we approached into the hardware and installed the basic Linux system with NixOS on top of a ZFS filesystem.
To this step, let's setup VLANs and it's networks.

## Network topology

Let's have the following networks:

| Network     | Interface | VLAN      |
|-------------|-----------|----------:|
|10.1.144.0/24| lan       | untagged  |
|10.1.222.0/24| guest     | 222       |
|PPPoE        | ppp0      | 333       |

Let's focus only on IPV4 for now. But we will can have IPV6 later.

### Switch

TL-SG108E is the Switch I using on this setup with the following config:

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

As far as this Mac Mini only have one Gigabit Ethernet port, this NIC will be tied to VLANs.

#### Networks

* `10.1.144.0/24` is a bridge bound to the NIC. In my case `enp4s0f0`. I leave it as untagged to be easy to reach the computer over the network, if I have some issue with my switch.
* `10.1.222.0/24` is `enp4s0f0.222` (VLAN 222) as `guest` network.
* `PPPoE` is `enp4s0f0.333` as `wan` network.

## NixOS config

*Some parts I took from [Francis Blog](https://francis.begyn.be/blog/nixos-home-router)*.

Let's configure our server editing the `.nix` files acordingly. To maintain the organization, let's create discrete files for it's sections as:

```bash
/etc/nixos
├── configuration.nix 
└── modules/ 
      ├── networking.nix # Network settings/ enables NFTables
      └── pppoe.nix      # PPPoE connection setup
      └── services.nix   # Other services
      └── nftables.nix   # Firewall's NFTables rules
```

### 1. Basic config

Lets split our `configuration.nix` file into parts, as we are already editing the file, let's take advantage and already enable package forwarding, as the most basic thing a router does, and route traffic between networks.

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
As our Macmini does only have one NIC. This setup relies on VLANs to split the network in the intended parts. As mentioned above, our switch needs to be configured with three VLANs, 144, 222, and 333, configuring ports as shown at the diagram above.

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

WAN connection will be managed by a PPPoE connection, that will be available on `modules/pppoe.nix`

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

The Firewall configuration is done with `nftables`. We will do a very basic, but secure firewall configuration at the file `nftables.nft`. This setup will prevent any connection incomming from internet, as from the guest network, while will keep everithing open to the private network.
It's valuable to say there's a problem with the `flow offloading` rule. Validating the rules, When it checks for flow offloading configuration, the routine gives a error because the interface `ppp0` does not exists during the build time of NixOS. But there's a [workaround](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031/3)
 by adding:

`/etc/nixos/modules/nftables.nft`

```nft
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

    # Allow returning traffic from ppp0 and drop everthing else
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

If somebody connects to network. this person needs to have an IP address. Let's configure our DHCP server.

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

Everything seens to be configured as intended, but services. Enabling root password login is a temporary measure, as is risky let at that way. This will be temporary and soom we gonna address that.

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

And that it. next part is configuring our Podman services, being Unbound with ad-blocks one of them, as hardering our Firewall with fine grained permission, making our server secure.

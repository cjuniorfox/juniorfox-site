---
title: "DIY Linux Router - Part 9 - IoT Network"
articleId: "diy-linux-router-part-9-iot-network"
date: "2025-03-20"
author: "Carlos Junior"
category: "Linux"
brief: "In the ninght part of this series, it's time to make our network more secure restricting network access to IoT devices."
image: "/assets/images/diy-linux-router/iot.webp"
keywords : ["macmini","router", "linux", "nixos", "file", "iot", "nftables", "network"
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-9-iot"}]
---

This is the eighth part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security, and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wi-Fi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- Part 7: [File Sharing](/article/diy-linux-router-part-7-file-sharing)
- Part 8: [Backup](/article/diy-linux-router-part-8-backup)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

Out Linux router already is a strong part of our network. Let's increase our security by restricting access of IoT devices.

![Backup](/assets/images/iot.webp)
*Backup*

## Table of Contents

- [Introduction](#introduction)
- [Security Measurements](#security_measurements)
- [Let's get started](#lets_get_started)
- [Conclusion](#conclusion)

## Introduction

We live in a highly connected world ever and our homes never was so smart as now. There's a lot of gagdets hangling around your home network, like Chromecasts, Smart TVs, Alexas, Smartlamps, Wifi Printers, smart boxes and so on.

Many of these are fairly capable machines doing simple things. Many of them also are older devices being aroung some years without receiving any security patches. They are share the same Layer 2 network with devices like your work's laptop, your mobile that you use to do online bank transactions and share up your online profile.

This combination is dangerous, as we don't really know what those smart gadgets are doing. There's some reports of some chinese smartlamps doing nasty things on the network, like capturing TCP packets and sending to some remote datacenter without the owner's concern. There's also security breaches long discovered, but unpatched on older printers that does not receive security update from 5 years or more, that puts those simple devices in a position of a threat for your home network. Even devices from reputable companies, like the **Google Chromecast** or their well faded **Google Stadia** are discontinued and there's no security updates anymore. Those devices open holes on your network and are security breaches that can be exploited anytime.

We can't deny that many of the important services that we are using online are fairy secure, with connections protected by SSL certificates and cryptographic algorithms. This is good, but we can't rely our online security and privacy solely on third-parties. We have to do our part to make sure that we are on a secure environment.

## Security Measuraments

Let's state some guidelines to increase the security on home network

### 1. Protect and isolate our Layer 2 network

The network is layered on 7 layers. This is the OSI model. You can learn more about [at this link](https://www.cloudflare.com/learning/network-layer/what-is-the-network-layer/) but to make it simple.

**Layer 1** is the physical layer. The physical cables that you connect together. **Layer 2** is the data link layer. Is the basic logic level of two network devices connecting together. If two devices shares the same **layer 2 network** they can contact each other. So, if your **Smartlamp** connects to the same **Wifi** as your **Works's laptop**, your **smartphone** or your **TV Box**, they are at the same layer 2 and they can talk each other. So, splitting your layer 2 between discrete networks is essential for protecting undesired connections between unwanted devices. If you're following this guide since from beginning, you already have done that on the [Network and Internet](/article/diy-linux-router-part-2-network-and-internet) article by relying on **Smart Switches** and **VLANs**.

### 2. Restrict internet access for IoT devices

Restricting or completely denying internet access for undesired gadgets will protect your network. Your Echo Dot, or your Smart TV hardly needs to connnect make other than **HTTP** and **HTTPs** connections. So restricting their internet access to only those ports is a good security measure. Just make sure that is not restricing the access for **OTA** updates. Other devices like **Wifi Printers** or **Smartlamps** generally does not neeed internet access at all, except occasionally to update the firmware.

### 3. Allow some connections between networks, but not all of them

There's some praticalities, like casting a **YouTube** video to a TV on **Smartphone** or controlling your **Chromecast** from your Smartphone is a praticality that, by default, splitting your **Layer 2 Network** you lose. But there's some connections that can be allowed between them.

## Let's get started

So whitout further redo, let get started.

### Recap the part 2 - Network and Internet

At the part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet), we already had split the network between **Home**, **IoT** and **Guest**. Those networks are at their own **Layer 2 Network** and isolated each other. So, do the recap for this article.

### Remove the IoT internet connectivity

Currently, all devices on the **IoT** network can access the internet. As we will fine grain the internet connectivity for our **IoT** devices, remove the internet connectivity by default from this network by updating the `nftables` rules

`cat /etc/nixos/nftables/rules.nft`

```nftables
...
# Remove these lines. Keep the rest as is

#    iifname @IOT oifname @WAN counter accept comment "Allow LAN to IoT"
#    iifname @WAN oifname @IOT ct state established,related counter accept comment "Allow established back to LAN"

```

You can check if the adjust worked by rebuilding `NixOS` and connecting to the IoT network.

```bash
nixos-rebuild switch
```

### Assign fixed IPs for IoT devices

As we are using the DHCP server from `systemd-networkd`, we have to determine the IP address for our gadgets. 
In this example, we will configure three devices. **Chromecast**, **SmartTV** and a **Printer**.
Do this by checking out the `Mac address` of the IoT devices. You can check out at the **Unifi Network Application** if you are using the **Unifi AP** that I mentioned at the [part 5: Wi-Fi](/article/diy-linux-router-part-5-wifi). Make a configuration for every device on `networking.nix` as follows:

`/etc/nixos/modules/networking.nix`

```nix
{ config, pkgs, ... }:
{
  ...
  systemd.network = {
    networks = {
      ...
      "10-${iot}" = {
        matchConfig.Name = "${iot}";
        networkConfig.Address = "${ip_iot}/24";
        networkConfig.DHCPServer = "yes";
        dhcpServerConfig.DNS = [ "${ip_iot}" ];
        dhcpServerStaticLeases = [
          {
            # Chromecast (IOT)
            dhcpServerStaticLeaseConfig = { Address = "10.30.85.80"; MACAddress = "c9:41:25:ff:c8:44"; };
          }{
            # Smart TV (IOT)
            dhcpServerStaticLeaseConfig = { Address = "10.30.85.82"; MACAddress = "fa:a1:db:c4:ee:32"; };
          }{
            # Brother Printer (IOT)
            dhcpServerStaticLeaseConfig = { Address = "10.30.85.86"; MACAddress = "f9:3a:22:4a:c4:ce"; };
          }
        ];
      };
    }
  ...
  }
}
```

Again, you can check out if the configuration works by rebuilding the NixOS and reconnecting those devices on the network

```bash
nixos-rebuild switch
```

### Handle mDNS between networks

Since we want to be able to see those devices on the network for things like printing and casting content from the Smartphone to the TV or Chromecast. Let's **mDNS**. Is the **mDNS** that allows up to see the **Cast to Chromecast** icon on a YouTube video, or shows up the printer then we want to print something over the network. For allowing the **mDNS** announce across networks, let's enable the **mDNS reflector** using **Avahi**. Again, NixOS make this task too easy:

`/etc/nixos/modules/networking.nix`

```nix
  services.avahi = {
      publish.enable = true;
      publish.userServices = true;
      enable = true;
      reflector = true;
      allowInterfaces = [ "${lan}" "${guest}" "${iot}" ];
  };
```

### NFTables Rules

The idea here is:

- Allow restricted internet traffic for the IoT devices
- Allow hosts on the **Home** and **Guest** network to reach some of the **IoT** devices, but not the other way around, except already established and related connections.

Create a new **NFTables** file

`/etc/nixos/nftables/static_forwards.nft`

```nftables
define chromecast = 10.30.85.80
define smartv     = 10.30.85.82 
define brother    = 10.30.85.86 

table inet filter {
  set ALLOW_WAN_HTTPS { 
    type ipv4_addr; 
    elements = { 
      $smartv
    }; 
  }
  set ALLOW_WAN {
    type ipv4_addr;
    elements = { 
      $chromecast 
    };
  }
  set ALLOW_LAN {
    type ipv4_addr; 
    elements = { 
      $chromecast,
      $smartv,
      $brother
    };
  } 
  set ALLOW_GUEST {
    type ipv4_addr; 
    elements = { 
      $chromecast,
      $smartv
    };
  }
  chain IOT_WAN_HTTPS_FORWARD {
    iifname @IOT ip saddr @ALLOW_WAN_HTTPS oifname @WAN tcp dport { http, https } counter accept comment "Forward IoT devices to WAN on HTTP/HTTPS"
    iifname @WAN oifname @IOT ip daddr @ALLOW_WAN_HTTPS ct state { established, related } counter accept comment "Allow established back from HTTP/HTTPS to IOT"
  }
  chain IOT_WAN_FORWARD {
    iifname @IOT ip saddr @ALLOW_WAN oifname @WAN counter accept comment "Allow IoT devices to WAN"
    iifname @WAN oifname @IOT ip daddr @ALLOW_WAN ct state { established, related } counter accept comment "Allow established back to IOT"
  } 
  
  chain LAN_IOT_FORWARD {
    iifname @LAN oifname @IOT ip daddr @ALLOW_LAN counter accept comment "Forward LAN to IoT devices";
    iifname @IOT ip saddr @ALLOW_LAN oifname @LAN ct state { established, related } counter accept comment "Allow established back to LAN from IOT"
  }
  chain GUEST_IOT_FORWARD {
    iifname @LAN  oifname @IOT ip daddr @ALLOW_GUEST counter accept comment "Forward Guest to IoT devices"
    iifname @IOT ip saddr @ALLOW_GUEST oifname @GUEST ct state { established, related } counter accept comment "Allow established back to Guest from IOT"
  }
  
  chain IOT_LAN_MULTICAST {
    iifname @IOT oifname @LAN ip daddr 239.255.255.250 udp dport 1900 counter accept comment "Allow SSDP multicast from IOT to LAN"
    iifname @LAN oifname @IOT ip daddr 239.255.255.250 udp dport 1900 counter accept comment "Allow SSDP multicast from LAN to IOT"
  }
  chain STATIC_FORWARDS {
    jump IOT_WAN_HTTPS_FORWARD 
    jump IOT_WAN_FORWARD
    jump LAN_IOT_FORWARD
    jump GUEST_IOT_FORWARD
    jump IOT_LAN_MULTICAST
  }
}
```

Also, update the **NFT Rules** to jump to this new configuration.

`/etc/nixos/nftables/rules.nft`

```nftables
table inet filter {
  chain forward {
    jump STATIC_FORWARDS
    ...
  }
}
```
Don't forget to add the new file as `include` at the `networking.nix` file as follows:

```nix
networking = {
    nftables = {
      enable = true;
      rulesetFile = pkgs.writeText "ruleset.conf" ''
        ...
        include "${../nftables/static_forwards.nft}"
        include "${../nftables/rules.nft}"
        ...
      '';
    };
  };
```

Apply the configuration

```bash
nixos-rebuild switch
```

What we did so far:

- **Allow internet connectivity to Chromecast**

    I tried to restrict the Chromecast conectivity by only allowing it to connect to the internet over certain ports as mentioned on [this blog post](https://baihuqian.github.io/2020-12-13-secure-home-network-using-chromecast-across-vlans/) but it didn't work. So I temporarily allowing the **Chromecast** to connect to the internet as a whole. I'll revisit this configuration a little later.

- **Allow HTTP and HTTPS connections to the SmarTV**

    To the SmarTV the things were simpler, Just allowing **HTTP** and **HTTPS** is enough. This also applies for many of the other gadgets, like **Amazon Echo Dot**, **Roku** and so on.

- **Allow connections from LAN to IoT**

    I don't want to change the Wifi connection to print or cast something from my smartphone to TV, so I allow the devices on the **LAN** network to talk with devices on the **IoT** network.

- **Allow connections from Guest to some IoT**

    When I have a guest on my house, I don't need to give it the **LAN** connection. Instead I give the **Guest** Wifi connection and is nice allowing them to cast content to some of my home devices.

## Conclusion

This is just a basic grasp which what can be done for increasing the security of the home network. There's a lot more can be done, but this covers the basic. I believe that concludes this series. Thank you for being with me at this far. There's more things that can be done, like configuring an Web administrator with **Cockpit** and adding some great observability tools that I just don't have time to cover right now.

So, many thanks, we see around.
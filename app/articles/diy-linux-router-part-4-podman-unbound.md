---
title: "DIY Linux Router - Part 4 - Podman and Unbound"
articleId: "diy-linux-router-part-4-podman-unbound"
date: "2024-10-15"
author: "Carlos Junior"
category: "Linux"
brief: "In this fourth part of this series, it's time to install Podman, a drop-in replacement for Docker with some interesting features, and configure Unbound to run on it."
image: "/assets/images/diy-linux-router/seal-pod-and-rope.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unbound", "podman", "docker"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-4-podman-unbound"}]
---

This is the fourth part of a multipart series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)

In the previous parts, we installed the operating system, configured the gateway internet functionality with PPPoE, and made some security adjustments by defining the authentication method and configuring the firewall.

Now, it's time to install **Podman**, a drop-in replacement for Docker with some interesting features, and configure **Unbound** to run on it.

![Seal in front a rope](/assets/images/diy-linux-router/seal-pod-and-rope.webp)
*AI Generated image by Google's [Gemini](https://gemini.google.com/)*

## Table of Contents

- [About Podman](#about-podman)
  - [Why Podman instead of Docker?](#why-podman-instead-of-docker)
- [About Unbound](#about-unbound)
- [Podman Setup](#podman-setup)
  - [1. Update NixOS Configuration File](#1-update-nixos-configuration-file)
  - [2. Setup Firewall for Podman Default Network](#2-setup-firewall-for-podman-default-network)
- [Unbound-setup](#unbound-setup)
  - [1. Create directories and volumes for unbound](#1-create-directories-and-volumes-for-unbound)
  - [2. Build the YAML Deployment File](#2-build-the-yaml-deployment-file)
  - [3. Additional Configuration Files](#3-additional-configuration-files)
  - [4. Create a Podman Network for Unbound](#4-create-a-podman-network-for-unbound)
  - [5. Add the Newly Created Network to the Firewall](#5-add-the-newly-created-network-to-the-firewall)
  - [6. Start the Unbound Container](#6-start-the-unbound-container)
- [Firewall Rules](#firewall-rules)
  - [1. Update Firewall Configuration](#1-update-firewall-configuration)
  - [2. Rebuild NixOS](#2-rebuild-nixos)
  - [3. Reload Unbound Pod](#3-reload-unbound-pod)

## About Podman

Given that **NixOS** is configured using `.nix` files, it might seem straightforward to simply install the necessary services without worrying about containerization. In many cases, this approach makes sense, as the overhead and complexity of containerization may not always be justified. However, considering the vast number of pre-configured **Docker** images available that meet our needs, I see no reason not to take advantage of them by using **Podman**.

### Why Podman Instead of Docker?

There are several advantages to using **Podman** over **Docker**. While this topic could easily warrant its own article, here are a few key points:

1. **Daemonless Architecture**: Podman does not require a central daemon to run containers. Each container runs as a child process of the Podman command, improving security and reducing the risk of a single point of failure.
2. **Rootless Containers**: Podman allows containers to be run without requiring root privileges, enhancing security by reducing the attack surface.
3. **Kubernetes Compatibility**: Podman can generate Kubernetes YAML files directly from running containers or pods, making it easier to transition from local development to Kubernetes environments.
4. **Docker-Compatible CLI**: Most Docker commands can be used with Podman without modification, making the transition from Docker to Podman seamless.

## About Unbound?

**Unbound** is a local DNS server that caches DNS queries in a local repository, improving DNS resolution times, reducing internet traffic, and slightly increasing internet speed. Additionally, with some scripting, **Unbound** can function as an ad blocker by blacklisting as many ad-related hosts as possible.

For this project, I'll use a Docker image of **Unbound** that I created some time ago: [cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). This image performs three main functions:

- DNS name resolution.
- Ad-blocking by applying the [StevenBlack/hosts](https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts) list daily.
- Name resolution for the local network by retrieving hostnames from the **DHCP Server** and assigning them to **Unbound's** nameserver addresses.

## Podman Setup

Let's begin by installing **Podman** on our **NixOS** system.

### 1. Update NixOS Configuration File

*Note: Only update the relevant parts of the file. Do not replace the entire file with the content below.*

Edit the `/etc/nixos/configuration.nix` file:

```nix
{ config, pkgs, ... }:
{
  ...
  boot = {
    kernelParams = [ "systemd.unified_cgroup_hierarchy=1" ];
    ...
  };
  ...
  imports = [
    ...
    ./modules/podman.nix
  ]
}
```

Create `modules/podman.nix` file

`/etc/nixos/modules/podman.nix`

```nix
{ pkgs, config, ... }:
{
  virtualisation.containers.enable = true;
  virtualisation = {
    podman = {
      enable = true;
      defaultNetwork.settings.dns_enabled = true;
    };
  };
  environment.systemPackages = with pkgs; [
    dive # look into docker image layers
    podman-tui # status of containers in the terminal
  ];
}
```

Let's apply those changes to have **Podman** up and running.

```bash
nixos-rebuild switch
```

### 2. Setup Firewall for Podman Default Network

Since we are using `nftables`, Podman does not automatically apply firewall rules. Therefore, to enable access, such as internet connectivity, for networks created by **Podman**, it is necessary to manually add entries to the `nftables.nft` file. But first, let's check which networks **Podman** has configured.

```bash
podman network ls
# NETWORK ID    NAME                         DRIVER
# 000000000000  podman                       bridge
# 6b3beeb78ea9  podman-default-kube-network  bridge
```

Currently, there are two networks: `podman`, which is the default network for any container created without specifying a network, and `podman-default-kube-network`, which is the default for pods created with `podman kube play`.

Now let's check the network ranges for those networks.

```bash

podman network inspect podman --format '{{range .Subnets}}{{.Subnet}}{{end}}'
# 10.88.0.0/16

podman network inspect podman-default-kube-network --format '{{range .Subnets}}{{.Subnet}}{{end}}'
# 10.89.0.0/24
```

With the network ranges, it's time to configure our `nftables.nft`.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain podman_networks_input {
    ip saddr 10.88.0.0/16 accept comment "Podman default network"
    ip saddr 10.89.0.0/24 accept comment "Podman default Kube network"
  }

  chain podman_networks_forward {
    ip saddr 10.88.0.0/16 accept comment "Podman default network"
    ip daddr 10.88.0.0/16 accept comment "Podman default network"
    
    ip saddr 10.89.0.0/24 accept comment "Podman default Kube network"
    ip daddr 10.89.0.0/24 accept comment "Podman default Kube network"
  }

  chain input {
    type filter hook input priority filter; policy drop;
    
    jump podman_networks_input;
    ...
  }

  chain forward {
    type filter hook forward priority filter; policy drop;
    ...
    jump podman_networks_forward;
    ...
  }
}
```

Rebuild NixOS configuration

```sh
nixos-rebuild switch
```

## Unbound Setup

With **Podman** installed, it's time to set up **Unbound**. I'll be using the **Docker** image [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Since **Podman** supports **Kubernetes-like** `yaml` deployment files, we'll create our own based on the example provided in the [GitHub repository](https://github.com/cjuniorfox/unbound/) for this image, specifically in the [kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes) folder.

### 1. Create Directories and Volumes for Unbound

First, create a directory to store Podman's deployment `yaml` file and volumes. In this example, I'll create the directory under `/opt/podman` and place an `unbound` folder inside it. Additionally, the `volumes/unbound-conf/` directory will be created to store extra configuration files.

```sh
mkdir -p /opt/podman/unbound/volumes/unbound-conf/
```

### 2. Build the YAML Deployment File

Next, create a `pod.yaml` file in `/opt/podman/unbound/`. This file is based on the example provided in the **Docker** image repository [cjuniorfox/unbound](https://github.com/cjuniorfox/unbound/).

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>pod.yaml</b> file.</summary>

`/opt/podman/unbound/pod.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: unbound
  labels:
    app: unbound
spec:
  automountServiceAccountToken: false
  containers:
    - name: server
      image: docker.io/cjuniorfox/unbound:1.20.0
      resources:
        limits:
          memory: 200Mi
          ephemeral-storage: "1Gi"
        requests:
          cpu: 0.5
          memory: 100Mi
          ephemeral-storage: "500Mi"
      env:
        - name: DOMAIN
          value: "localdomain" # Same as defined in the dnsmasq configuration
        - name: DHCPSERVER
          value: "dnsmasq" # DHCP server used on our server
      ports:
        - containerPort: 53
          protocol: UDP
          hostPort: 53
          hostIP: 10.1.144.1 # LAN network
        - containerPort: 53
          protocol: UDP
          hostPort: 53
          hostIP: 10.1.222.1 # Guest network
      volumeMounts:
        - name: dhcp-volume
          mountPath: /dhcp.leases
        - name: unbound-conf-volume
          mountPath: /unbound-conf
        - name: unbound-conf-d-pvc
          mountPath: /etc/unbound/unbound.conf.d
  restartPolicy: Always
  volumes:
    - name: dhcp-volume
      hostPath:
        path: /var/lib/dnsmasq/dnsmasq.leases
    - name: unbound-conf-volume
      hostPath:
        path: /opt/podman/unbound/volumes/unbound-conf/
    - name: unbound-conf-d-pvc
      persistentVolumeClaim:
        claimName: unbound-conf
```

</details> <!-- markdownlint-enable MD033 -->

### 3. Additional Configuration Files

You can place additional configuration files in the `volumes/unbound-conf/` directory. These files can be used to enable features like a **TLS DNS server** for internet traffic or to define DNS names for hosts on your network. You can also block DNS resolution for specific hosts on the internet. This step is optional. Below is an example configuration that enables DNS resolution for the **Mac Mini** gateway server on the `lan` network.

`/opt/podman/unbound/volumes/unbound-conf/local.conf`

```conf
server:
  private-domain: "localdomain."
  local-zone: "localdomain." static
  local-data: "macmini.localdomain. IN A 10.1.144.1"
```

### 4. Create a Podman Network for Unbound

**Unbound** will play a major role in our solution. There will be specific rules for it, such as redirecting all **DNS requests** on the local network to **Unbound**, regardless of the **DNS server IP** configured on individual hosts. Therefore, having a dedicated network with a **fixed IP address** is crucial.

With that in mind, let's create a network for **Unbound**. This network will require two IP addresses: one for the **host machine** to act as the **Internet Gateway**, allowing **Unbound** to query **DNS names** from the **internet**, and one for the **Unbound** container itself. Since we only need a small number of IPs, we'll create a network with just **6 IPs**. We'll place this network at the very end of the `10.89.1.xxx` range, specifically at `10.89.1.248/30`.

```bash
podman network create \
  --driver bridge \
  --gateway 10.89.1.249 \
  --subnet 10.89.1.248/30 \
  --ip-range 10.89.1.250/30 \
  unbound-net
```

### 5. Add the Newly Created Network to the Firewall

As previously mentioned, it is mandatory to add the new network to the `nftables.nft` file.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain podman_networks_input {
    ip saddr 10.88.0.0/16 accept comment "Podman default network"
    ip saddr 10.89.0.0/24 accept comment "Podman default Kube network"
    ip saddr 10.89.1.248/30 accept comment "Podman unbound-net network"
  }

  chain podman_networks_forward {
    ip saddr 10.88.0.0/16 accept comment "Podman default network"
    ip daddr 10.88.0.0/16 accept comment "Podman default network"
    
    ip saddr 10.89.0.0/24 accept comment "Podman default Kube network"
    ip daddr 10.89.0.0/24 accept comment "Podman default Kube network"
    
    ip saddr 10.89.1.248/30 accept comment "Podman unbound-net network"
    ip daddr 10.89.1.248/30 accept comment "Podman unbound-net network"
  }
  ...
}
```

Apply new firewall rules

```sh
nixos-rebuild switch
```

### 6. Start the Unbound Container

Start the **Unbound** container on the `unbound-net` network with the fixed IP address `10.89.10.100`. This IP address will be useful for configuring firewall rules later.

```bash
podman kube play --replace \
  /opt/podman/unbound/pod.yaml \
  --network unbound-net \
  --ip 10.89.1.250
```

## Firewall Rules

**Podman** configures most of the **firewall rules** for us, and at this point, **Unbound** is already resolving nameservers. Any host on your network can now use the gateway as a DNS server. You can test this by running the following command and checking for a response:

```bash
dig @10.1.144.1 google.com

; <<>> DiG 9.18.28 <<>> @10.1.144.1 google.com
; (1 server found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41111
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;google.com.			IN	A

;; ANSWER SECTION:
; google.com.		170	IN	A	142.251.129.78

;; Query time: 286 msec
;; SERVER: 10.1.144.1#53(10.1.144.1) (UDP)
;; WHEN: Wed Oct 16 12:41:21 UTC 2024
;; MSG SIZE  rcvd: 55
```

However, there are still a few more things to configure. One important task is to prevent hosts on the `lan` network from using any **DNS server** other than ours. This is necessary because some devices are hardcoded to use Google's `8.8.8.8` DNS server, regardless of the network configuration. To address this, we'll configure the firewall to redirect any DNS requests (port `53`) made through our gateway to **Unbound**.

### 1. Update Firewall Configuration

Edit the `nftables.nft` file by adding the following:

`/etc/nixos/modules/nftables.nft`

```conf
...
table nat {
  chain unbound_prerouting {
    iifname {"lan", } ip daddr != 10.89.1.250 udp dport 53 dnat to 10.89.1.250:53
  }
  ...
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    jump unbound_prerouting;
  }
}
```

### 2. Rebuild NixOS

```bash
nixos-rebuild switch
```

### 3. Reload Unbound Pod

Everytime **Firewall rules** are reloaded, is good to reload Pods, so they can reconfigure forward ports defined on `pod.yaml`.

```bash
podman pod restart unbound
```

## Conclusion

In this part of the series, we successfully installed **Podman** as a container engine and configured **Unbound** to run within it, providing DNS resolution and ad-blocking capabilities for our network. By leveraging **Podman**, we benefit from a more secure, rootless container environment while still utilizing the vast ecosystem of pre-configured Docker images. Additionally, we set up firewall rules to ensure that all DNS traffic is routed through our **Unbound** server, further enhancing the security of our network.

With **Podman** and **Unbound** now in place, our DIY Linux router has become a robust and flexible solution for managing network traffic, blocking ads, and improving DNS resolution. In the next part, we will explore additional services and optimizations to further enhance the functionality of our router.

Next, we will configure our wireless network using a **Ubiquiti UniFi AP**.

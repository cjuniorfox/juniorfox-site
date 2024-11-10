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
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, and made security adjustments by setting up authentication methods and configuring the firewall.

Now, it's time to install **Podman**, a drop-in replacement for Docker with some interesting features, and configure **Unbound** to run on it.

![Seal in front a rope](/assets/images/diy-linux-router/seal-pod-and-rope.webp)
*AI Generated image by Google's [Gemini](https://gemini.google.com/)*

## Table of Contents

- [About Podman](#about-podman)
  - [Why Podman instead of Docker?](#why-podman-instead-of-docker)
- [About Unbound](#about-unbound)
- [Podman Setup](#podman-setup)
- [Unbound Setup](#unbound-setup)
- [Podman Setup](#podman-setup)
- [Firewall Rules](#firewall-rules)
- [Update DHCP Settings](#update-dhcp-settings)
- [Conclusion](#conclusion)

## About Podman

Since **NixOS** is configured using `.nix` files, it might seem straightforward to install the necessary services directly, without containerization. In many cases, this approach makes sense, as the overhead and complexity of containerization may not always be justified. However, considering the vast number of pre-configured **Docker** images available that meet our needs, I see no reason not to take advantage of them by using **Podman**.

### Why Podman Instead of Docker?

There are several advantages to using **Podman** over **Docker**. While this topic could warrant its own article, here are a few key points:

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

### 1. Create pool and a dataset for Podman

If you choose to create a separate **ZFS pool**, it's time to create a partition for it, the **ZFS Pool** and a intended dataset for **Podman**.

As we don't have `parted` installed on our system, we can just open a `nix-shell` containing `parted` utility to use it for now.

```bash
nix-shell parted
```

```bash
DISK=/dev/disk/by-id/scsi-SATA_disk1
ZDATA=zdata
```

```bash
parted ${DISK} mkpart ZFS 32G 100%
#Assuming the data partition is the partition 4.
DATA_PART="/dev/disk/by-partuuid/"$(blkid -s PARTUUID -o value ${DISK}-part4)
zpool create -f -o ashift=12 -O atime=off -O compression=lz4 -O xattr=sa -O acltype=posixacl ${ZDATA} ${DATA_PART}
```

Assuming the new pool is **zdata** let's create mountpoints considering `/zdata/containers` as default container path.

```bash
zfs create zdata/containers
```

Let's begin by installing **Podman** on our **NixOS** system.

### 2. Update NixOS Configuration File

*Note: Only update the relevant parts of the file. Do not replace the entire file with the content below.*

Edit the `/etc/nixos/configuration.nix` file:

```nix
{ config, pkgs, ... }:
{
  ...
  boot.kernelParams = [ "systemd.unified_cgroup_hierarchy=1" ];  
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
  virtualisation = {
    containers.enable = true;
    containers.storage.settings = {
      storage = {
        driver = "zfs";
        graphroot = "/zdata/containers";
        runroot = "/run/containers/storage";
      };
  };

    podman = {
      enable = true;
      defaultNetwork.settings.dns_enabled = true;
    };
  };

  environment.systemPackages = with pkgs; [
    dive # look into docker image layers
    podman-tui # status of containers in the terminal
  ];

  systemd.services.podman-autostart = {
    enable = true;
    after = [ "podman.service" ];
    wantedBy = [ "multi-user.target" ];
    description = "Automatically start containers with --restart=always tag";
    serviceConfig = {
      Type = "idle";
      ExecStartPre = ''${pkgs.coreutils}/bin/sleep 1'';
      ExecStart = ''/run/current-system/sw/bin/podman --all --filter restart-policy=always'';
      User = "podman"; # In case of rootless https://discourse.nixos.org/t/rootless-podman-compose-configuration/52523/4
    };
  };
}
```

Let's apply those changes to have **Podman** up and running.

```bash
nixos-rebuild switch
```

## Unbound Setup

Now that **Podman** is installed, it's time to set up **Unbound**. I'll be using the **Docker** image [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Since **Podman** supports **Kubernetes-like** `yaml` deployment files, we'll create our own based on the example provided in the [GitHub repository](https://github.com/cjuniorfox/unbound/) for this image, specifically in the [kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes) folder. We'll also setup as rootless for security reasons. Log out from the server and log as `podman` user. If you setup your `~/.ssh/config` as I did, it's just:

```bash
ssh podman-admin
```

### 1. Create Directories and Volumes for Unbound

First, create a directory to store Podman's deployment `yaml` file and volumes. In this example, I'll create the directory under `/home/podman/deployments` and place an `unbound` folder inside it. Additionally, create the `volumes/unbound-conf/` directory to store extra configuration files.

```sh
mkdir -p /home/podman/deployments/unbound/
```

### 2. Build the YAML Deployment File

Next, create a `unbound.yaml` file in `/opt/podman/unbound/`. This file is based on the example provided in the **Docker** image repository [cjuniorfox/unbound](https://github.com/cjuniorfox/unbound/).

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>unbound.yaml</b> file.</summary>

`/opt/podman/unbound/unbound.yaml`

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
          value: "example.com" # Same as defined in the kea configuration
        - name: DHCPSERVER
          value: "kea" # DHCP server used on our server
      ports:
        - containerPort: 853 # DNS over TLS for all networks
          protocol: TCP
          hostPort: 853
        - containerPort: 53
          protocol: UDP
          hostPort: 53
          hostIP: 10.1.1.1 # LAN network
        - containerPort: 53
          protocol: UDP
          hostPort: 53
          hostIP: 10.1.30.1 # Guest network
        - containerPort: 90
          protocol: UDP
          hostPort: 90
          hostIP: 10.1.90.1 # IoT network
      volumeMounts:
        - name: var-lib-kea-dhcp4.leases-host
          mountPath: /dhcp.leases
        - name: opt-podman-unbound-confd-host
          mountPath: /unbound-conf
        - name: unbound-conf-pvc          
          mountPath: /etc/unbound/unbound.conf.d
  restartPolicy: Always
  volumes:
    - name: var-lib-kea-dhcp4.leases-host
      hostPath:
        path: /var/lib/kea/dhcp4.leases
    - name: opt-podman-unbound-confd-host
      hostPath:
        path: /opt/podman/unbound/conf.d/
    - name: unbound-conf-pvc      
      persistentVolumeClaim:
        claimName: unbound-conf
```

</details> <!-- markdownlint-enable MD033 -->

### 3. Additional Configuration Files

You can place additional configuration files in the `volumes/unbound-conf/` directory. These files can be used to enable features like a **TLS DNS server** for internet traffic or to define DNS names for hosts on your network. You can also block DNS resolution for specific hosts on the internet. This step is optional. Below is an example configuration that enables DNS resolution for the **Mac Mini** gateway server on the `lan` network.

`/opt/podman/unbound/conf.d/local.conf`

```conf
server:
  private-domain: "example.com."
  local-zone: "example.com." static
  local-data: "macmini.example.com. IN A 10.1.1.1"
  local-data: "macmini.example.com. IN A 10.1.30.1"
  local-data: "macmini.example.com. IN A 10.1.90.1"
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

As mentioned earlier, it is mandatory to add the new network to the `nftables.nft` file.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain podman_networks_input {
    ...
    ip saddr 10.89.1.248/30 accept comment "Podman unbound-net network"
  }

  chain podman_networks_forward {
    ...
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

Start the **Unbound** pod on the `unbound-net` network with the fixed IP address `10.89.1.250`. This IP address will be useful for configuring firewall rules later.

```bash
podman kube play --replace \
  /opt/podman/unbound/unbound.yaml \
  --network unbound-net \
  --ip 10.89.1.250
```

## Firewall Rules

**Podman** has set up the ports specified in the `pod.yaml` file, and **Unbound** is now successfully resolving DNS queries for your gateway. Any device on your network can now use the gateway as its DNS server. You can verify this by running the following command and checking the response:

```bash
dig @10.1.1.1 google.com

; <<>> DiG 9.18.28 <<>> @10.1.144.1 google.com
; (1 server found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41111
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;google.com.  IN  A

;; ANSWER SECTION:
; google.com.  170  IN  A 142.251.129.78

;; Query time: 286 msec
;; SERVER: 10.1.144.1#53(10.1.144.1) (UDP)
;; WHEN: Wed Oct 16 12:41:21 UTC 2024
;; MSG SIZE  rcvd: 55
```

However, there are devices tending to use other DNS servers than Unbound, which I don't want to. So, I made a rule that redirects every DNS request on network **LAN** to **Unbound**. The client has no idea what happens.

### Update Firewall Configuration

Edit the `nftables.nft` file by adding the following:

`/etc/nixos/modules/nftables.nft`

```conf
...
table nat {
  chain redirect_dns {
    iifname "lan" ip daddr != 10.89.1.250 udp dport 53 dnat to 10.89.1.250:53
  }
  ...
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    jump redirect_dns
  }
}
```

## Update DHCP Settings

Setup the `DHCP Server` to announce the server as the `DNS Server`. Remember that at `lan` network, every DNS server used for any client will be redirected to the local **Unbound server**.

**Leave the rest of the configuration as it is.**

`/etc/nixos/modules/dhcp_server.kea`

```json
  
  "subnet4" : [
      {
        "interface" : "lan",
        "option-data": [
          { "name": "domain-name-servers", "data": "10.1.1.1" },
        ]
      },
      {
        "interface" : "guest",
        "option-data": [
          { "name": "domain-name-servers", "data": "10.1.30.1" },
        ]
      },
      {
        "interface" : "iot",
        "option-data": [
          { "name": "domain-name-servers", "data": "10.1.90.1" },
        ]
      }
    ]
```

### Rebuild NixOS

```bash
nixos-rebuild switch
```

### Reload Unbound Pod

Everytime **Firewall rules** are reloaded, is good to reload Pods, so they can reconfigure the expected forward ports.

```bash
podman pod restart unbound
```

## Conclusion

In this part of the series, we successfully installed Podman as a container engine and configured **Unbound** to run within it, providing DNS resolution and ad-blocking capabilities for our network. By leveraging **Podman**, we benefit from a more secure, rootless container environment while still utilizing the vast ecosystem of pre-configured Docker images. Additionally, we set up firewall rules to ensure that all DNS traffic is routed through our **Unbound** server, further enhancing the security of our network.

Next, we will configure our wireless network using a **Ubiquiti UniFi AP**.

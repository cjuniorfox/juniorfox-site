---
title: "DIY Linux Router - Part 4 - Podman and Unbound"
articleId: "diy-linux-router-part-4-unbound"
date: "2024-10-15"
author: "Carlos Junior"
category: "Linux"
brief: "In this fourth part of this series, it's time to install Podman, a drop-in replacement for Docker with some interesting features, and configure Unbound to run on it."
image: "/assets/images/diy-linux-router/seal-pod-and-rope.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unbound", "podman", "docker"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-4-unbound"}]
---

This is the fourth part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, and made security adjustments by setting up authentication methods and configuring the firewall.

Now, it's time to install **Podman**, a drop-in replacement for Docker with some interesting features, and configure **Unbound** to run on it.

![Seal in front a rope](/assets/images/diy-linux-router/seal-pod-and-rope.webp)
*AI-Generated image by Google's [Gemini](https://gemini.google.com/)*

## Table of Contents

- [About Podman](#about-podman)
  - [Why Podman instead of Docker?](#why-podman-instead-of-docker)
- [About Unbound](#about-unbound)
- [Podman Setup](#podman-setup)
- [Unbound Setup](#unbound-setup)
- [Podman Setup](#podman-setup)
- [Firewall Rules](#firewall-rules)
- [Conclusion](#conclusion)

## About Podman

Since **NixOS** is configured using `.nix` files, it might seem straightforward to install the necessary services directly, without containerization. In many cases, this approach makes sense, as the overhead and complexity of containerization may not always be justified. However, considering the vast number of pre-configured **Docker** images available that meet our needs, I see no reason not to take advantage of them by using **Podman**.

### Why Podman Instead of Docker?

There are several advantages to using **Podman** over **Docker**. While this topic could warrant its article, here are a few key points:

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

### 1. Create the dataset for Podman

Create the intended dataset for **Podman**. I will do this on the `zdata` dataset created at [part 1](/articles/diy-linux-router-part-1-initial-setup).

```bash
ZDATA=zdata
```

Assuming the data pool is **zdata** let's create mountpoints considering `/mnt/zdata/containers` as the default container path. The idea is to store the **Rootfull Containers** on `/mnt/zdata/containers/root` and for **rootless**, store on `/mnt/zdata/containers/podman`

```bash
zfs create -o canmount=off ${ZDATA}/containers
zfs create ${ZDATA}/containers/root
zfs create ${ZDATA}/containers/podman
zfs create -o canmount=off ${ZDATA}/containers/root/storage
zfs create -o canmount=off ${ZDATA}/containers/root/storage/volumes
zfs create -o canmount=off ${ZDATA}/containers/podman/storage
zfs create -o canmount=off ${ZDATA}/containers/podman/storage/volumes
chown -R podman:containers /mnt/${ZDATA}/containers/podman
```

Make sure that the additional `zdata` pool is set on `hardware-configuration.nix`

`/etc/nixos/hardware-configuration.nix`

 ```nix
 ...
   boot.zfs.extraPools = [ "zdata" ];
 ...
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

Create `modules/podman.nix` file. In this file, we have the **Podman** configuration itself as `systemd`user service for starting rootless pods as **Podman User**.

`/etc/nixos/modules/podman.nix`

```nix
{ pkgs, config, ... }:
{
  virtualisation = {
    containers.enable = true;
    containers.storage.settings = {
      storage = {
        driver = "zfs";
        graphroot = "/mnt/zdata/containers/root/storage";
        runroot = "/run/containers/storage";
        rootless_storage_path = "/mnt/zdata/containers/$USER/storage";
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
}
```

### 4. Create systemd unit to start Podman pods

By default, the **Podman** installation, install some `systemd` units by default, but there are none for dealing with **pods** properly. There's a `systemd` unit for deploying **Kubernetes Pods** that comes closer to what I need but demands an internet connection right at the moment to start Pods, which there's no way to guarantee during the system initialization. Also, my installation made use of the newer [Pasta Network provider](https://docs.podman.io/en/latest/markdown/podman-network.1.html#pasta), which is great if you compare it to the older [slirp4netns](https://github.com/rootless-containers/slirp4netns), but, at least on my setup, enabling the pod to start with the server gets me an issue because, during the pod's initialization, the **Pasta Network** is not ready yet, preventing containers to initiate. So, I wrote my parametrized systemd unit to deal with **rootless pods**, doing two things:

- On `ExecStartPre`, it tries to raise the `hello-word` container. If the lack of **Pasta Network** readiness prevents the container from starting, it waits 2 seconds and then it tries again.
- Creates an `ExecStart` and `ExecStop` receiving the pod name as a parameter.

So, let's write our `.nix` file to compose the intended unit service:

`/etc/nixos/modules/podman-pod-systemd.nix`

```nix
{ config, pkgs, ... }:

let
  podman = "${config.virtualisation.podman.package}/bin/podman";
  logLevel= "--log-level info";
  podmanReadness = pkgs.writeShellScript "podman-readness.sh" ''
    #!/bin/sh
    while ! ${podman} run --rm docker.io/hello-world:linux > /dev/null; do 
      ${pkgs.coreutils}/bin/sleep 2; 
    done
    echo "Podman is ready."
  ''; 
in {
  systemd.user.services."podman-pod@" = {
    description = "Run podman workloads via podman pod start";
    documentation = [ "man:podman-pod-start(1)" ];
    wants = [ "network.target" ];
    after = [ "network.target" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStartPre = "${podmanReadness}";
      ExecStart = "${podman} pod ${logLevel} start %I";
      ExecStop = "${podman} pod ${logLevel} stop %I";
      RemainAfterExit = "true";
    };
    wantedBy = [ "default.target" ];
  };
}
```

Add the new .nix file to the section `imports` from `configuration.nix` file.

`/etc/nixos/configuration.nix`

```nix
imports =
    [ 
      ...
      ./modules/podman.nix
      ./modules/podman-pod-systemd.nix
      ...
    ];

```

### 5. Rebuild the system configuration

To made Podman available, rebuild the system configuration:

```bash
nixos-rebuild switch
```

## Unbound Setup

Now that **Podman** is installed, it's time to set up **Unbound**. I'll be using the **Docker** image [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Since **Podman** supports **Kubernetes-like** **YAML** deployment files, we'll create our own based on the example provided in the [GitHub repository](https://github.com/cjuniorfox/unbound/) for this image, specifically in the [Kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes) folder. We'll also set up as rootless for security reasons. Log out from the server and log in as the `podman` user. If you set your `~/.ssh/config` as I did, it's just:

```bash
ssh router-podman
```

### 1. Create Directories and Volumes for Unbound

First, create a directory to store Podman's deployment **YAML** files and volumes. In this example, I'll create the directory under `/home/podman/deployments` and place an `unbound.yaml` inside it. Additionally, create the **container volume** `unbound-conf` to store extra configuration files.

```sh
mkdir -p /home/podman/deployments/
podman volume create unbound-conf
```

### 2. Build the YAML Deployment File

Next, create a `unbound.yaml` file in `/home/podman/deployments/unbound/`. This file is based on the example provided in the **Docker** image repository [cjuniorfox/unbound](https://github.com/cjuniorfox/unbound/).

`/home/podman/deployments/unbound.yaml`

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
          value: "home.example.com" # The same as defined on DHCP server section of network.nix
      ports:
        - containerPort: 53
          protocol: UDP
          hostPort: 1053
      volumeMounts:
        - name: unbound-conf-pvc          
          mountPath: /unbound-conf
  restartPolicy: Always
  volumes:
    - name: unbound-conf-pvc      
      persistentVolumeClaim:
        claimName: unbound-conf
```

### 4. Additional Configuration Files

Hosts with **fixed IP**, **fixed leases**, and their own **Router identification** itself can be placed on a customized configuration file that makes the **DNS Server** return properly DNS queries about. Let's put this configuration file into the newly created volume `unbound-conf`. You will find its path at `/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/`

`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

```conf
server:
  private-domain: "example.com."
  local-zone: "macmini.home.example.com." static
  local-data: "macmini.home.example.com. IN A 10.1.78.1"
  local-data: "macmini.home.example.com. IN A 10.30.17.1"
  local-data: "macmini.home.example.com. IN A 10.90.85.1"
```

### 5. Start the unbound pod and check its status

With everything set, start the Unbound Pod with the following command:

```bash
podman kube play --log-level info --replace /home/podman/deployments/unbound.yaml 
```

Check it status by doing:

```bash
podman pod logs -f unbound
```

You can also check if **DNS queries** are being properly processed by doing:

```bash
dig @localhost -p 1053 google.com
```

 ```txt
; <<>> DiG 9.18.28 <<>> @localhost -p 1053 google.com
; (2 servers found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 64081
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;google.com.			IN	A

;; ANSWER SECTION:
google.com.		48	IN	A	142.250.79.46

;; Query time: 0 msec
;; SERVER: ::1#1053(localhost) (UDP)
;; WHEN: Thu Nov 14 17:47:19 -03 2024
;; MSG SIZE  rcvd: 55
```

### 6. Enable Systemd Service for Unbound

It's time to make use of the `systemd` unit created above, by enabling our Pod startup during system initialization. Do the following command:

```bash
systemctl --user enable --now podman-pod@unbound.service
```

You can reboot the machine to see if the service starts up with no issues

```bash
systemctl --user status podman-pod@unbound.service
```

```txt
podman-pod@unbound.service - Run podman workloads via podman pod start
     Loaded: loaded (/home/podman/.config/systemd/user/podman-pod@unbound.service; enabled; preset: enabled)
     Active: active (exited) since Thu 2024-11-14 16:48:04 -03; 1h 2min ago
...
```

## Firewall Rules

By default, **Linux** does not allow opening ports lower than port 1024 as rootless. As the default DNS port is 53, We have to redirect port **1053** to **53**.

Update firewall rules as follows:

### Services

Add `unbound_dns_input` **chain** to `services.nft` file. Leave the remaining **services chains** as is.

`/etc/nixos/nftables/services.nft`

```conf 
 ...
 chain unbound_dns_input {
    udp dport 1053 ct state { new, established } counter accept comment "Allow Unbound DNS server"
    tcp dport 1853 ct state { new, established } counter accept comment "Allow Unbound TLS-DNS server"
  }
...
```

Do not forget to add the service to intended zones. At that case **LAN**, **GUEST** and **IOT**.
Just add `jump unbound_dns_input` to the intended **zone chains**.

`/etc/nixos/nftables/zones.nft`

```conf
chain LAN_INPUT {
    ...
    jump unbound_dns_input
    ...
  }

  chain GUEST_INPUT {
    ...
    jump unbound_dns_input
    ...
  }

  chain IOT_INPUT {
    ...
    jump unbound_dns_input
    ...
  }
...
```

### NAT Redirect

As far as rootless pods can't open ports below `1024` and DNS works on ports `53` and `853`, we need to redirect any request from `53` and `853` to `1053` and `1853` respectively.

#### NAT Chains

`/etc/nixos/nftables/nat_chains.nft`

```conf
table ip nat {
  chain unbound_redirect {
    ip daddr { $ip_lan, $ip_guest, $ip_iot } udp dport 53 redirect to 1053 
    ip daddr { $ip_lan, $ip_guest, $ip_iot } tcp dport 853 redirect to 1853 
  }
  
  chain unbound_redirect_lan {
    udp dport 53 redirect to 1053 
    tcp dport 853 redirect to 1853 
  }
}
```

- `unbound_redirect_lan` redirects any request to port `53` to unbound, no matter what host is wanted by the client. This is to avoid some hosts that uses other **DNS servers** than **Unbound** on **LAN**.
- `unbound_redirect` only redirect connections to **Gateway IPs**, allowing the use of other **DNS server** if the client wanted to do so.

#### NAT Zones

Add intended chains to **NAT Zones**.

`/etc/nixos/nftables/nat_zones.nft`

```conf
   table ip nat {
  chain LAN_PREROUTING {
    jump unbound_redirect_lan
  }

  chain GUEST_PREROUTING {
    jump unbound_redirect
  }

  chain IOT_PREROUTING {
    jump unbound_redirect
  }
}
```

### Rebuild NixOS

```bash
nixos-rebuild switch
```

### Reload Unbound Pod

Every time **Firewall rules** are reloaded, is good to reload Pods, so they can reconfigure the expected forward ports.

Run as `podman` user:

```bash
systemctl --user restart unbound.service
```

## Conclusion

In this part of the series, we successfully installed Podman as a container engine and configured **Unbound** to run within it, providing DNS resolution and ad-blocking capabilities for our network. By leveraging **Podman**, we benefit from a more secure, rootless container environment while still utilizing the vast ecosystem of pre-configured Docker images. Additionally, we set up firewall rules to ensure that all DNS traffic is routed through our **Unbound** server, further enhancing the security of our network.

Next, we will configure our wireless network using a **Ubiquiti UniFi AP**.

- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)

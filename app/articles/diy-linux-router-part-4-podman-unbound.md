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

## Introduction

In the previous sections, we covered installing the operating system, configuring internet connectivity using PPPoE, and securing our gateway by setting up authentication and a robust firewall. Now, it’s time to take our DIY Linux router to the next level by containerizing services with **Podman** and setting up **Unbound** for DNS resolution and ad-blocking.

![Seal in front of a rope](/assets/images/diy-linux-router/seal-pod-and-rope.webp)  
*AI-Generated image by Google's [Gemini](https://gemini.google.com/)*  

---

### Table of Contents

1. [Introduction](#introduction)  
2. [About Podman](#about-podman)  
   - [Why Choose Podman?](#why-choose-podman)  
3. [About Unbound](#about-unbound)  
4. [Podman Setup](#podman-setup)  
   - [Create the ZFS Dataset](#create-the-zfs-dataset)  
   - [Update the NixOS Configuration](#update-the-nixos-configuration)  
   - [Configure Podman Service](#configure-podman-service)  
   - [Rebuild System Configuration](#rebuild-system-configuration)  
5. [Unbound Setup](#unbound-setup)  
   - [Prepare Directories and Volumes](#prepare-directories-and-volumes)  
   - [Create Unbound Deployment File](#create-unbound-deployment-file)  
   - [Configure Unbound](#configure-unbound)
   - [Start Unbound](#start-unbound)
   - [Enable Unbound as a Service](#enable-unbound-as-a-service)
6. [Firewall Configuration](#firewall-configuration)  
   - [Open Service Ports](#open-service-ports)  
   - [Apply the Configuration](#apply-the-configuration)  
   - [Reload Unbound Pod](#reload-unbound-pod)  
7. [Conclusion](#conclusion)  

---

## About Podman  

### Why Choose Podman?  

While **NixOS** excels at directly managing services through configuration files, leveraging containerization offers additional flexibility, especially when using prebuilt Docker images tailored for specific needs. Enter **Podman**—a powerful, daemonless alternative to Docker. Here's why Podman is worth considering:  

1. **Daemonless Design**  
   Unlike Docker, Podman doesn't rely on a central daemon. Each container runs as a separate process, eliminating a single point of failure and improving security.  

2. **Rootless Operation**  
   Podman enables containers to run without requiring root privileges, reducing the risk of privilege escalation and making it ideal for multi-user systems.  

3. **Kubernetes-Friendly**  
   Podman can generate Kubernetes YAML files directly from your container setups, simplifying the migration to Kubernetes or hybrid environments.  

4. **Docker-Compatible CLI**  
   Transitioning from Docker is seamless, as Podman supports most Docker CLI commands with minimal adjustments.  

5. **Lightweight and Flexible**  
   Podman integrates well with Linux-native tools and provides tighter control over containerized services.  

By combining Podman with **NixOS**, we can achieve a highly modular, secure, and easily reproducible infrastructure.  

---

## About Unbound  

**Unbound** is a high-performance, recursive DNS resolver designed for privacy and security. It can significantly improve DNS resolution speeds, reduce internet traffic, and enhance privacy by preventing DNS queries from being logged by third parties.  

In this project, we’ll use **Unbound** not only for DNS resolution but also for:  

- **Caching DNS Queries**  
   Speeds up repeated requests by storing resolved queries locally.  

- **Ad Blocking**  
   Incorporates blocklists like [StevenBlack’s hosts file](https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts) to filter out advertisements and trackers.  

- **Local DNS Resolution**  
   Dynamically resolves local network hostnames by integrating with our DHCP server.  

For this setup, we’ll use a prebuilt Docker image: [cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/), designed to integrate seamlessly with the functionality mentioned above.  

---

## Podman Setup

### Create the ZFS Dataset

We will create a dedicated dataset for **Podman** on the `zdata` pool (introduced in [Part 1](/articles/diy-linux-router-part-1-initial-setup)). The container storage structure will be organized as follows:

- **Rootful containers**: `/mnt/zdata/containers/root`
- **Rootless containers**: `/mnt/zdata/containers/podman`

Run the following commands to create the required datasets and set permissions:

```bash
ZDATA=zdata

# Create container datasets
zfs create -o canmount=off ${ZDATA}/containers
zfs create ${ZDATA}/containers/root
zfs create ${ZDATA}/containers/podman

# Create storage subdirectories
zfs create -o canmount=off ${ZDATA}/containers/root/storage
zfs create -o canmount=off ${ZDATA}/containers/root/storage/volumes
zfs create -o canmount=off ${ZDATA}/containers/podman/storage
zfs create -o canmount=off ${ZDATA}/containers/podman/storage/volumes

# Set ownership for rootless Podman
chown -R podman:containers /mnt/${ZDATA}/containers/podman
```

Ensure the `zdata` pool is listed in the `hardware-configuration.nix` file:

`/etc/nixos/hardware-configuration.nix`

```nix
...
boot.zfs.extraPools = [ "zdata" ];
...
```

---

### Update the NixOS Configuration

We will configure Podman as a system service and set up storage paths. Open `/etc/nixos/configuration.nix` and make the following changes:

1. **Add kernel parameter** for the unified cgroup hierarchy:

   ```nix
   boot.kernelParams = [ "systemd.unified_cgroup_hierarchy=1" ];
   ```

2. **Include the Podman configuration module**:

   ```nix
   imports = [
     ...
     ./modules/podman.nix
   ];
   ```

3. **Create the Podman module**: `/etc/nixos/modules/podman.nix`

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
       dive      # Inspect Docker image layers
       podman-tui # Terminal-based Podman UI
     ];
   }
   ```

---

### Configure Podman Service

By default, Podman installs systemd units for containers, but these don’t handle pods effectively. A custom systemd unit will allow pods to start correctly, even if the Pasta network interface isn’t ready during system boot.

Create a custom module for the Podman pod service:  
`/etc/nixos/modules/podman-pod-systemd.nix`

```nix
{ config, pkgs, ... }:

let
  podman = "${config.virtualisation.podman.package}/bin/podman";
  logLevel = "--log-level info";
  podmanReadiness = pkgs.writeShellScript "podman-readiness.sh" ''
    #!/bin/sh
    while ! ${podman} run --rm docker.io/hello-world:linux > /dev/null; do
      ${pkgs.coreutils}/bin/sleep 2;
    done
    echo "Podman is ready."
  '';
in
{
  systemd.user.services."podman-pod@" = {
    description = "Manage Podman pods";
    documentation = [ "man:podman-pod-start(1)" ];
    wants = [ "network.target" ];
    after = [ "network.target" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStartPre = "${podmanReadiness}";
      ExecStart = "${podman} pod ${logLevel} start %I";
      ExecStop = "${podman} pod ${logLevel} stop %I";
      RemainAfterExit = "true";
    };
    wantedBy = [ "default.target" ];
  };
}
```

Include the new module in your `configuration.nix`:

`/etc/nixos/configuration.nix`

```nix
imports = [
  ...
  ./modules/podman.nix
  ./modules/podman-pod-systemd.nix
  ...
];
```

---

### Rebuild System Configuration

To apply the changes and make Podman available, rebuild the system configuration:

```bash
sudo nixos-rebuild switch
```

After the rebuild completes, Podman is installed and ready for further configuration.

---

## Unbound Setup

Now that **Podman** is installed, it's time to set up **Unbound**. I'll be using the **Docker** image [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Since **Podman** supports **Kubernetes-like** **YAML** deployment files, we'll create our own based on the example provided in the [GitHub repository](https://github.com/cjuniorfox/unbound/) for this image, specifically in the [Kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes) folder. We'll also set up as rootless for security reasons. Log out from the server and log in as the `podman` user. If you set your `~/.ssh/config` as I did, it's just:

```bash
ssh router-podman
```

### Prepare Directories and Volumes

First, create a directory to store Podman's deployment **YAML** files and volumes. In this example, I'll create the directory under `/home/podman/deployments` and place an `unbound.yaml` inside it. Additionally, create the **container volume** `unbound-conf` to store extra configuration files.

```sh
mkdir -p /home/podman/deployments/
podman volume create unbound-conf
```

### Create Unbound Deployment File

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

---

### Configure Unbound

To handle **DNS queries** for hosts with **fixed IPs**, **static leases**, or **custom router identifiers**, you can use a customized Unbound configuration file. This file will ensure that DNS queries are resolved correctly for these hosts. The configuration file will be placed in the volume `unbound-conf`, created earlier.

The path to the configuration file is:  
`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

Example configuration (`local.conf`):

```conf
server:
  private-domain: "example.com."
  local-zone: "macmini.home.example.com." static
  local-data: "macmini.home.example.com. IN A 10.1.78.1"
  local-data: "macmini.home.example.com. IN A 10.30.17.1"
  local-data: "macmini.home.example.com. IN A 10.90.85.1"
```

This configuration defines the following:

- **Private-domain**: Restricts the scope of DNS queries to the domain `example.com`.
- **Local-zone**: Marks the domain `macmini.home.example.com` as static, indicating no further lookups should be done outside the local configuration.
- **Local-data**: Maps `macmini.home.example.com` to multiple IP addresses (`10.1.78.1`, `10.30.17.1`, and `10.90.85.1`).

Make sure to place this file correctly in the specified path to ensure Unbound uses it during runtime.

---

### Start Unbound

With the configuration complete, you can start the Unbound Pod using the following command:

```bash
podman kube play --log-level info --replace /home/podman/deployments/unbound.yaml
```

To monitor the pod’s output and verify that it is running correctly, use:

```bash
podman pod logs -f unbound
```

You can also test if **DNS queries** are being processed by Unbound with the `dig` command:

```bash
dig @localhost -p 1053 google.com
```

Expected output:

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
;google.com.            IN      A

;; ANSWER SECTION:
google.com.     48      IN      A       142.250.79.46

;; Query time: 0 msec
;; SERVER: ::1#1053(localhost) (UDP)
;; WHEN: Thu Nov 14 17:47:19 -03 2024
;; MSG SIZE  rcvd: 55
```

This confirms that Unbound is resolving DNS queries successfully.

---

### Enable Unbound as a Service

To ensure the Unbound Pod starts automatically at boot, enable the `systemd` unit created earlier. Use the following command:

```bash
systemctl --user enable --now podman-pod@unbound.service
```

You can reboot the machine to verify that the service starts without any issues. After rebooting, check the service status with:

```bash
systemctl --user status podman-pod@unbound.service
```

Example output:

```txt
podman-pod@unbound.service - Run podman workloads via podman pod start
     Loaded: loaded (/home/podman/.config/systemd/user/podman-pod@unbound.service; enabled; preset: enabled)
     Active: active (exited) since Thu 2024-11-14 16:48:04 -03; 1h 2min ago
     ...
```

This indicates that the Unbound Pod is running and configured to start on system boot.

---

## Firewall Configuration

By default, **Linux** does not allow rootless services to bind to ports below 1024. Since the DNS server typically listens on port 53, we need to redirect traffic from **port 53** to **port 1053** (used by Unbound in the rootless container). Similarly, DNS over TLS traffic on **port 853** needs to be redirected to **port 1853**.

Follow these steps to configure the firewall rules:

---

### Open Service Ports

First, add a new `unbound_dns_input` chain to the `services.nft` file. This chain allows traffic to Unbound’s DNS and DNS over TLS services. Keep the existing service chains unchanged.

`/etc/nixos/nftables/services.nft`

```nft
...
chain unbound_dns_input {
    udp dport 1053 ct state { new, established } counter accept comment "Allow Unbound DNS server"
    tcp dport 1853 ct state { new, established } counter accept comment "Allow Unbound TLS-DNS server"
}
...
```

Next, include this new chain in the relevant network zones (**LAN**, **GUEST**, and **IOT**) by adding a `jump` rule in the zone chains.

`/etc/nixos/nftables/zones.nft`

```nft
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

---

### Configure NAT Rules

Since rootless containers cannot bind to privileged ports, we need to redirect DNS traffic to higher, non-privileged ports. Specifically, **port 53** traffic will be redirected to **port 1053**, and **port 853** will be redirected to **port 1853**.

---

#### Defining NAT Chains

Add the following NAT chains to handle redirection for both gateway IPs and unrestricted DNS requests.

`/etc/nixos/nftables/nat_chains.nft`

```nft
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

- **`unbound_redirect_lan`** ensures that all DNS requests on the LAN are redirected to Unbound, regardless of the requested host. This prevents clients from bypassing Unbound by using alternative DNS servers.
- **`unbound_redirect`** redirects only requests targeted at gateway IPs, allowing clients to use alternative DNS servers if desired.

---

#### Setting Up NAT Zones

To apply the NAT rules, update the NAT zone configuration by adding the corresponding chains for each zone.

`/etc/nixos/nftables/nat_zones.nft`

```nft
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

---

### Apply the Configuration

Once all the changes are made, rebuild the NixOS configuration to apply the updated firewall rules:

```bash
nixos-rebuild switch
```

---

### Reload Unbound Pod

Whenever firewall rules are reloaded, it’s a good practice to restart the Unbound Pod to ensure it properly reconfigures its port bindings:

```bash
systemctl --user restart unbound.service
```

---

## Conclusion

In this part of the series, we configured **Podman** as our container engine and set up **Unbound** to provide DNS resolution and ad-blocking capabilities within a rootless container. By utilizing **Podman**, we achieved a more secure and flexible environment compared to traditional root-based containers while leveraging a pre-built image to simplify the deployment process.

We also implemented custom **firewall rules** to ensure all DNS traffic, including DNS over TLS, is routed through our **Unbound** server, enhancing the security and control of our network traffic. 

In the next part, we will extend our setup to configure a wireless network using a **Ubiquiti UniFi Access Point**.

- Part 5: [Wi-Fi Configuration](/article/diy-linux-router-part-5-wifi)

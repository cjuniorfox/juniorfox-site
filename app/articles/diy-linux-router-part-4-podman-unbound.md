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

Assuming the new pool is **zdata** let's create mountpoints considering `/zdata/containers` as default container path. The idea is storing the rootfull containers on /zdata/containers/root and for rootless, store at /zdata/containers/podman

```bash
zfs create -o canmount=off zdata/containers
zfs create zdata/containers/root
zfs create zdata/containers/podman
chown podman:podman /zdata/containers/podman
```

To make new new pool available during boot, you have to add a boot entry into `configuration.nix`

`/etc/nixos/configuration.nix`

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

Create `modules/podman.nix` file. In this file we have the podman configuration itself as `systemd`user service for starting rootless pods as **Podman User**.

`/etc/nixos/modules/podman.nix`

```nix
{ pkgs, config, ... }:
{
  virtualisation = {
    containers.enable = true;
    containers.storage.settings = {
      storage = {
        driver = "zfs";
        graphroot = "/zdata/containers/root";
        runroot = "/run/containers/storage";
        rootless_storage_path = "/zdata/containers/$USER";
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

  systemd.user.services.podman-autostart = {
    enable = true;
    after = [ "podman.service" ];
    wantedBy = [ "multi-user.target" ];
    description = "Automatically start containers with --restart=always tag";
    serviceConfig = {
      Type = "idle";
      ExecStartPre = ''${pkgs.coreutils}/bin/sleep 1'';
      ExecStart = ''/run/current-system/sw/bin/podman start --all --filter restart-policy=always'';
    };
  };
}
```

### 3. Enable Linger to user podman

To start the service without logging into it, you should enable `linger` to user `podman`. Run the following command with `sudo`

```bash
loginctl enable-linger podman
```

## Kea Watcher

Rootless pods by default are unable to read Kea leases file. Unbound needs to read this file to make available resources into the network, but because our pod will run on a rootless environment. It will not able to do. To overcome this, let's create a single service to copy **leases file** contents to another place.

`/etc/nixos/modules/watch_kea_leases.nix`

```nix
{ config, pkgs, ... }:

let
  # The destination directory for the copied leases file
  destinationDir = "/tmp/";
  # Path to the watcher script
  watcherScript = pkgs.writeShellScript "watch_kea_leases.sh" ''
    #!/bin/bash
    # Source and destination
    SOURCE_FILE="/var/lib/kea/kea-leases4.csv"
    DEST_DIR="${destinationDir}"
    
    # Ensure the destination directory exists
    mkdir -p "$DEST_DIR"
    if [ -f "$SOURCE_FILE" ]; then
       cat "$SOURCE_FILE" > "$DEST_DIR/kea-leases4.csv"
    fi
    # Watch the source file for modifications
    /run/current-system/sw/bin/inotifywait -m -e modify "$SOURCE_FILE" | while read path action file; do
      # When the file changes, copy its contents to the destination directory
      cat "$SOURCE_FILE" > "$DEST_DIR/kea-leases4.csv"
      echo "Leases file updated and copied to $DEST_DIR"
    done
  '';
  
in {
  systemd.services.watch_kea_leases = {
    enable = true;
    description = "Watch Kea Leases and Copy to Destination";
    after = [ "network.target" ];
    serviceConfig.ExecStart = "${watcherScript}";
    serviceConfig.Restart = "always";
    serviceConfig.User = "root";
  };
  users.users.root.extraGroups = [ "podman" ];
  environment.systemPackages = [
    pkgs.coreutils
  ];

  systemd.tmpfiles.rules = [
    "d ${destinationDir} 0755 root root"
  ];
  #Make destination directory readable from user podman
}
```

Also, edit `configuration.nix` and add to it `inotify-tools`. The tool used to watch the leases file for any change, as the import for the newly created `.nix` file.

`/etc/nixos/configuration.nix`

```nix
imports =
    [ 
      ...
      ./modules/watch_kea_leases.nix
    ];

...

environment.systemPackages = with pkgs; [
    ...
    inotify-tools #To unbound watcher
    ...
  ];
```

Let's apply those changes to have **Podman** up and running.

```bash
nixos-rebuild switch
```

## Unbound Setup

Now that **Podman** is installed, it's time to set up **Unbound**. I'll be using the **Docker** image [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Since **Podman** supports **Kubernetes-like** `yaml` deployment files, we'll create our own based on the example provided in the [GitHub repository](https://github.com/cjuniorfox/unbound/) for this image, specifically in the [kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes) folder. We'll also setup as rootless for security reasons. Log out from the server and log as `podman` user. If you setup your `~/.ssh/config` as I did, it's just:

```bash
ssh podman-macmini
```

### 1. Create Directories and Volumes for Unbound

First, create a directory to store Podman's deployment `yaml` file and volumes. In this example, I'll create the directory under `/home/podman/deployments` and place an `unbound` folder inside it. Additionally, create the `volumes/unbound-conf/` directory to store extra configuration files.

```sh
mkdir -p /home/podman/deployments/unbound/conf.d/
```

### 2. Build the YAML Deployment File

Next, create a `unbound.yaml` file in `/home/podman/deployments/unbound/`. This file is based on the example provided in the **Docker** image repository [cjuniorfox/unbound](https://github.com/cjuniorfox/unbound/).

`/home/podman/deployments/unbound/unbound.yaml`

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
        - containerPort: 1053
          protocol: UDP
          hostPort: 1053
      volumeMounts:
        - name: tmp-kealeases4-host
          mountPath: /dhcp.leases
        - name: home-podman-deployments-unbound-confd-host
          mountPath: /unbound-conf
        - name: unbound-conf-pvc          
          mountPath: /etc/unbound/unbound.conf.d
  restartPolicy: Always
  volumes:
    - name: tmp-kealeases4-host
      hostPath:
        path: /tmp/kea-leases4.csv
    - name: home-podman-deployments-unbound-confd-host
      hostPath:
        path: /home/podman/deployments/unbound/conf.d/
    - name: unbound-conf-pvc      
      persistentVolumeClaim:
        claimName: unbound-conf
```

### 4. Additional Configuration Files

You can place additional configuration files in the `unbound/conf.d/` directory. These files can be used to enable features like a **TLS DNS server** for internet traffic or to define DNS names for hosts on your network. You can also block DNS resolution for specific hosts on the internet. This step is optional. Below is an example configuration that enables DNS resolution for the **Mac Mini** gateway server on the `lan` network.

`/home/podman/deployments/unbound/conf.d/local.conf`

```conf
server:
  private-domain: "example.com."
  local-zone: "example.com." static
  local-data: "macmini.example.com. IN A 10.1.1.1"
  local-data: "macmini.example.com. IN A 10.1.30.1"
  local-data: "macmini.example.com. IN A 10.1.90.1"
```

### 5. Start the Unbound Container

Start the **Unbound** pod with the following command:.

```bash
podman kube play --replace \
  /opt/podman/unbound/unbound.yaml
```

## Firewall Rules

By default, Linux does not allow opening ports lower than port 1024. As the default DNS port is 53, We have to forward port 1053 to 53.

Edit the `nftables.nft` file by adding the following:

## Open port

`/etc/nixos/modules/nftables.nft`

```conf
table 
...
table inet filter {
  ...
  chain unbound_dns_input {
    iifname {"lan", "guest", "iot" } udp dport 1053 ct state { new, established } counter accept comment "Allow Unbound DNS server"
  } 
  ...
  chain input {
    ...
    jump unbound_dns_input
    ...
  }

}
```

### NAT Redirect

`/etc/nixos/modules/nftables.nft`

```conf
table 
...
table nat {
  chain unbound_redirect {
    # Redirect all DNS requests to any host to Unbound
    iifname "lan" udp dport 53 redirect to 1053 
    # Redirect DNS to unbound, allow third-party DNS servers
    ip daddr {10.1.30.1, 10.1.90.1 } udp dport 53 redirect to 1053 
  }
  ...
  chain prerouting {
    ...
    jump unbound_redirect 
  }
}
```

## Update DHCP Settings

Setup the `DHCP Server` to announce the server as the `DNS Server`. Remember that at `lan` network, every DNS server used for any client will be redirected to the local **Unbound server**.

**Leave the rest of the configuration as it is.**

`/etc/nixos/modules/dhcp_server.kea`

```nix
  
    subnet4 = [
      {
        subnet = "10.1.1.0/24";
        interface = "lan";
        pools = [ { pool = "10.1.1.100 - 10.1.1.200"; } ]; 
        option-data = [
          { name = "routers"; data = "10.1.1.1, 8.8.8.8, 8.8.4.4"; }
          { name = "domain-name-servers"; data = "8.8.8.8"; } 
          { name = "domain-search"; data = "example.com"; } 
        ];
      }
      {
        subnet = "10.1.30.0/24";
        interface = "guest";
        pools = [ { pool = "10.1.30.100 - 10.1.30.200"; } ];
        option-data = [
          { name = "routers"; data = "10.1.30.1"; }
          { name = "domain-name-servers"; data = "10.1.30.1, 8.8.8.8, 8.8.4.4"; } 
        ];
      }
      {
        subnet = "10.1.90.0/24";
        interface = "iot";
        pools = [ { pool = "10.1.90.100 - 10.1.90.200"; } ]; 
        option-data = [
          { name = "routers"; data = "10.1.90.1, 8.8.8.8, 8.8.4.4"; }
          { name = "domain-name-servers"; data = "8.8.8.8"; } 
        ];
      }
    ];
```

### Rebuild NixOS

```bash
nixos-rebuild switch
```

### Reload Unbound Pod

Everytime **Firewall rules** are reloaded, is good to reload Pods, so they can reconfigure the expected forward ports.

Run as `podman` user:

```bash
podman pod restart unbound
```

## Conclusion

In this part of the series, we successfully installed Podman as a container engine and configured **Unbound** to run within it, providing DNS resolution and ad-blocking capabilities for our network. By leveraging **Podman**, we benefit from a more secure, rootless container environment while still utilizing the vast ecosystem of pre-configured Docker images. Additionally, we set up firewall rules to ensure that all DNS traffic is routed through our **Unbound** server, further enhancing the security of our network.

Next, we will configure our wireless network using a **Ubiquiti UniFi AP**.

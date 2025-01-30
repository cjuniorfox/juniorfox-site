---
title: "DIY Linux Router - Part 6 - Nextcloud and Jellyfin"
articleId: "diy-linux-router-part-6-nextcloud-jellyfin"
date: "2024-11-05"
author: "Carlos Junior"
category: "Linux"
brief: "In the sixth part of this series, we will install Jellyfin, a private media server for home use, and Nextcloud, a private cloud storage solution."
image: "/assets/images/diy-linux-router/nextcloud-jellyfin.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unbound", "podman", "docker"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-6-nextcloud-jellyfin"}]
---

This is the sixth part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 7: [File Sharing](/article/diy-linux-router-part-7-file-sharing)
- Part 8: [Backup](/article/diy-linux-router-part-8-backup)
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

## Table of Contents

- [Introduction](#introduction)
  - [What is Nextcloud](#what-is-nextcloud)
  - [What is Jellyfin](#what-is-jellyfin)
- [Setting up the Storage](#setting-up-the-storage)
  1. [Create the Dataset for the Nextcloud Storage](#create-the-dataset-for-the-nextcloud-storage)
  2. [Create Another Dataset for Media Files](#create-another-dataset-for-media-files)
- [Ingress](#ingress)
  1. [Setup Subdomains](#setup-subdomains)
  2. [Podman Network for Ingress](#podman-network-for-ingress)
  3. [Ingress pod](#ingress-pod)
  4. [Firewall](#firewall)
  5. [Let's Encrypt](#lets-encrypt)
- [Nextcloud](#nextcloud)
- [Jellyfin](#jellyfin)
- [Set up Ingresses](#set-up-ingresses)
- [Conclusion](#conclusion)

---

## Introduction

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, and set up Firewall and Unbound as DNS Servers.
It's time to expand this machine's capabilities by adding services like Nextcloud and Jellyfin

![Jellyfin, Nextcloud](/assets/images/diy-linux-router/nextcloud-jellyfin.webp)
*Jellyfin and Nextcloud*

### What is Nextcloud

There are plenty of cloud services for file storage over the internet. However they tend to be costly if you need storage space, and there are privacy concerns, like using the stored data content for advertisement as one example. By Nextcloud being a private cloud solution, you can store your data from everywhere in your storage box. With the auxiliary of the Nextcloud App, you can sync files, like videos and photos from your mobile to Nextcloud.

### What Is Jellyfin

There's a lot of on-demand media streaming services like Netflix, Prime Video, Looke, and so on. This means, there are a lot of pay bills to concern. There's also the issue of some content that you wanted to watch vanishing from the platform. This is because you have access granted to the content as you pay for it, but you don't own the content itself. They can be removed from the catalog as the license contract ends with the producer.
So, why not own your proper content and run your own on-demand media server? Jellyfin addresses just that for you.

---

## Setting Up the Storage

Both **Jellyfin** and **Nextcloud** store and access files. We could create folders for them, but setting up the storage correctly is better for backing up data correctly. **ZFS** has made it quite easy to create the intended **Datasets** for each of them.

Run with `sudo`:

Assuming the data storage pool name is `zdata`.

```bash
ZDATA=zdata
```

### Create the Dataset for the Nextcloud Storage

```bash
zfs create ${ZDATA}/containers/podman/storage/volumes/nextcloud-html
zfs create ${ZDATA}/containers/podman/storage/volumes/nextcloud-db
chown -R podman:podman /mnt/${ZDATA}/containers/podman/storage/volumes/nextcloud-*
```

### Create Another Dataset for Media Files

```bash
zfs create -o canmount=off -o mountpoint=/srv ${ZDATA}/srv
zfs create ${ZDATA}/srv/media
```

---

## Ingress

Each service runs on its own **HTTP** port. To make these services available to the Internet, the ideal is to set up an **Ingress Service**. Ingress is an **NGINX** reverse proxy to consolidate all services on the **HTTPS** protocol on port **443**. If you want to make these services available to the Internet, need to have a **FQDN domain** and **create subdomains** on it, since having a **public IPv4 address** is also good. So, if you don't have a domain. You need to buy one to use it. It's pretty cheap these days. There are even free options. If you don't have a **publicly available IP address**, you can use a **VPS** in the Cloud to act as a proxy and join you. **Oracle** per example offers a **free lifetime VPS** that [you can check out](https://www.oracle.com/br/cloud/compute/), to set up a **Wireguard** VPN and configure a connection between your **VPS** and your **Gateway**. There is an article here about [Wireguard](/articles/wireguard-vpn)

### Setup Subdomains

On the domain administrator panel, you have to add two DNS entries for your **IPv4** (A entry) with your **public IP Address**. The `nextcloud.example.com` and the `jellyfin.example.com`,
 as `example.com` being your *FDQN*. If you do not have a **fixed IP**, but instead an IP that changes between connections, you can use [CloudDNS](https://www.cloudns.net/) that offers a **daemon** to update DNS entries upon **IP Changing** dynamically.

### Podman Network for Ingress

As **Nextcloud** and **Jellyfin**, our **Ingress** will live into a **Podman's Pod**. The **Ingress** needs to be able to talk with the **Nextcloud** and **Jellyfin** pods. So let's create a network for them.

Run as `podman` user:

```bash
podman network create ingress-net
```

---

### Ingress Pod

Configuration for the **NGINX** Podman pod to act as our **Ingress** service.

1. **Create the `ingress-conf volume**:

```bash
podman volume create ingress-conf
```

2. **Create a basic configuration for NGINX**: `/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/default_server.conf`

```conf
server {
    listen 80 default_server;
    server_name _;

    location ~ /.well-known/acme-challenge/ {
      root /var/www/;
    }
}
```

3. **Create the ingress deployment file**: `/home/podman/deployments/ingress.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: ingress
  name: ingress
spec:
  networks:
    - name: ingress-net
  containers:
    - name: nginx
      image: docker.io/library/nginx:1.27.2-alpine
      ports:
      - containerPort: 80
        hostPort: 1080
      - containerPort: 443
        hostPort: 1443
      volumeMounts:
      - mountPath: /etc/localtime
        name: etc-localtime-host
      - mountPath: /etc/nginx/conf.d
        name: ingress-conf-pvc
      - mountPath: /var/www
        name: ingress-www-pvc
      - mountPath: /etc/letsencrypt 
        name: certificates-pvc
  restartPolicy: Always
  volumes:
  - name: etc-localtime-host
    hostPath:
      path: /etc/localtime
      type: File
  - name: ingress-conf-pvc
    persistentVolumeClaim:
      claimName: ingress-conf
  - name: ingress-www-pvc
    persistentVolumeClaim:
      claimName: ingress-www
  - name: certificates-pvc
    persistentVolumeClaim:
      claimName: certificates
```

4. **Start the Ingress Pod:**:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/ingress.yaml 
```

5. **Enable its `systemd` service file**:

```bash
systemctl --user enable podman-pod@ingress.service --now
```

The Ingress pod creates additional volumes, like `ingress-www` and `certificates` that will be used to validate the **SSL Certificates**, to be created at the next step. You can check it's creations by running `podman volume list`.

---

### Firewall

Because Ingress pod runs as rootless, it can't open ports below of`1024`.  Because `HTTP` and `HTTPS` are below this value, the ingress service will be configured to open ports `1080` and `1443`, and redirect the incoming traffic from ports `80` and `443`  to `1080` and `1443` respectively.

Add those chains and rules for the Ingress accordingly.

`/etc/nixos/nftables/services.nft`

```conf
...
  chain ingress_input {
    tcp dport 1080 ct state { new, established } counter accept comment "Ingress HTTP"
    tcp dport 1443 ct state { new, established } counter accept comment "Ingress HTTPS"
  }
...
```

`/etc/nixos/nftables/zones.nft`

```conf
  chain LAN_INPUT {
    jump ingress_input
    ...
  }
  ...
  chain WAN_INPUT {
    jump ingress_input
    ...
  }
```

`/etc/nixos/nftables/nat_chains.nft`

```conf
  ...
  chain ingress_redirect {
    ip daddr { $ip_lan, $ip_guest, $ip_iot } tcp dport  80 redirect to 1080
    ip daddr { $ip_lan, $ip_guest, $ip_iot } tcp dport 443 redirect to 1443
  }

  chain ingress_redirect_wan {
    tcp dport  80 redirect to 1080
    tcp dport 443 redirect to 1443
  }
  ...
```

`/etc/nixos/nftables/nat_zones.nft`

```conf
  chain LAN_PREROUTING {
    jump ingress_redirect
    ...
  }
  ...
  chain WAN_PREROUTING {
    jump ingress_redirect_wan
  }
```

#### Rebuild NixOS configuration

```bash
nixos-rebuild switch
```

### Let's Encrypt

The **Let's Encrypt** is a free service that provides **SSL Certificates**. It uses a utility named **certbot** to renew our certificates.

These certificates expire in a short period. So having a systemd unit to renew the service every month prevents your domains from having their certificates expire. Replace the `DOMAINS` list with your domains, as `EMAIL` with your e-mail address.

1. **Create the `systemd` unit**: `/home/podman/.config/systemd/user/certbot.service`

```ini
Description=Lets encrypt renewal with Certbot
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
Environment="DOMAINS=unifi.example.com,nextcloud.example.com,jellyfin.example.com"
Environment="EMAIL=your_email@gmail.com"
ExecStart=/run/current-system/sw/bin/podman run --rm \
          -v ingress-www:/var/www \
          -v certificates:/etc/letsencrypt \
          --log-level info --network ingress-net \
          docker.io/certbot/certbot:v3.0.0 \
              certonly --agree-tos --non-interactive -v \
              --webroot -w /var/www --force-renewal \
              --email ${EMAIL} \
              --domains ${DOMAINS}

```

2. **Create a `timer` unit**: `/home/podman/.config/systemd/user/certbot.timer`

This timer will trigger the renewal event once a month.

```ini
[Unit]
Description=Renew certificates using certbot montly.

[Timer]
OnCalendar=monthly
Persistent=true

[Install]
WantedBy=timers.target
```

3. **Enable and start** `certbot.service`: 

Check logs to see if the registration was successful.

```bash
systemctl --user daemon-reload
systemctl --user enable certbot.timer
systemctl --user start certbot.service
journalctl --user -eu certbot.service
```

```txt
...
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/example.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/example.com/privkey.pem
This certificate expires on 2025-02-10.
NEXT STEPS:
- The certificate will need to be renewed before it expires. Certbot can automatically renew the certificate in the background, but you may need to take steps to enable that functionality. See https://certbot.org/renewal-setup for instructions.
```

4. **Update the configuration of Ingress**:

Use the configuration path provided by the `certbot` service output.

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/default_server.conf`

```conf
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem; 

server {
    listen 80 default_server;
    server_name _;

    location ~ /.well-known/acme-challenge/ {
      root /var/www/;
    }
}
```

5. **Restart `ingress` pod**:

```bash
systemctl --user restart podman-pod@ingress.service
```

---

## Nextcloud

Now that we have the **Ingress** ready, we can start creating the **Nextcloud** service.

### Secrets

Create a **secret** for the **Nextcloud** service. This secret will be used to store the **Nextcloud** database password. Make use of the same script we did for Unifi Network before.

1. **Create the secrets file**:

```sh
cd /home/podman/deployments/
export MARIADB_ROOT_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MYSQL_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"

cat << EOF > nextcloud-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: nextcloud-secret
data:
  mariadbRootPassword: $(echo -n ${MARIADB_ROOT_PASSWORD} | base64)
  mysqlPassword: $(echo -n ${MYSQL_PASSWORD} | base64)
EOF

echo "Secret file created with the name nextcloud-secret.yaml"
```

2. **Deploy the created secrets file**:

```bash
podman kube play /home/podman/deployments/nextcloud-secret.yaml
```

3. **Check for the newly created secret**:

```bash
podman secret list
```

```txt
ID                         NAME               DRIVER      CREATED             UPDATED
b22f3338bbdcec1ecd2044933  nextcloud-secret   file        About a minute ago  About a minute ago
```

4. **Delete the `secret.yaml` file**:

It's a good practice to delete the secret file after deployment. Be aware that you cannot retrieve it's secret contents again in the future.

```bash
rm -f /home/podman/deployments/nextcloud-secret.yaml
```

### YAML for Nextcloud

Create the `yaml` file for deploying **Nextcloud** on **Podman**

`/home/podman/deployments/nextcloud.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: nextcloud
  name: nextcloud

spec:
  restartPolicy: Always
  containers:
    - image: docker.io/nextcloud:28.0.4
      name: server
      resources:
        limits:
          memory: 300Mi
          ephemeral-storage: 1000Mi
        requests:
          cpu: 20.0
          memory: 50Mi
          ephemeral-storage: 50Mi
      volumeMounts:
      - mountPath: /var/www/html
        name: nextcloud-html-pvc
      env:
      - name: MYSQL_DATABASE
        value: nextcloud
      - name: MYSQL_HOST
        value: nextcloud-db
      - name: MYSQL_USER
        value: nextcloud
      - name: MYSQL_PASSWORD
        valueFrom:
          secretKeyRef:
            name: nextcloud-secret
            key: mysqlPassword

    - image: docker.io/mariadb:11.5.2
      name: db
      resources:
        limits:
          memory: 500Mi
          ephemeral-storage: 500Mi
        requests:
          cpu: 1.0
          memory: 100Mi
          ephemeral-storage: 100Mi
      volumeMounts:
      - mountPath: /var/lib/mysql
        name: nextcloud-db-pvc
      env:
      - name: MYSQL_DATABASE
        value: nextcloud
      - name: MYSQL_USER
        value: nextcloud
      - name: MYSQL_PASSWORD
        valueFrom:
          secretKeyRef:
            name: nextcloud-secret
            key: mysqlPassword
      - name: MARIADB_ROOT_PASSWORD
        valueFrom:
          secretKeyRef:
            name: nextcloud-secret
            key: mariadbRootPassword

  volumes:
  - name: nextcloud-html-pvc
    persistentVolumeClaim:
      claimName: nextcloud-html
  - name: nextcloud-db-pvc
    persistentVolumeClaim:
      claimName: nextcloud-db
```

This `yaml` file will create a **Nextcloud** service with a **MariaDB** database.

The **volumes** `nextcloud-data` and `nextcloud-html` are placed into the intended datasets created at the beginning of this article.

### Start Nextcloud Pod

As did for Ingress, start the pod with the following command:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/nextcloud.yaml 
```

Enable **Nextcloud** `systemd` service:

```bash
systemctl --user enable --now podman-pod@nextcloud.service
```

---

## Jellyfin

Create the `jellyfin.yaml` file with the following content:

`/home/podman/deployments/jellyfin.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: jellyfin
  name: jellyfin
spec:
  restartPolicy: Always
  containers:
    - image: docker.io/jellyfin/jellyfin:10.9.1
      name: jellyfin
      resources:
        limits:
          memory: 500Mi
          ephemeral-storage: 500Mi
        requests:
          cpu: 1.0
          memory: 100Mi
          ephemeral-storage: 100Mi
      volumeMounts:
        - mountPath: /config
          name: jellyfin-config-pvc
        - mountPath: /cache
          name: jellyfin-cache-pvc
        - mountPath: /media
          name: srv-media-host
  volumes:
    - name: jellyfin-config-pvc
      persistentVolumeClaim:
        claimName: jellyfin-config
    - name: jellyfin-cache-pvc
      persistentVolumeClaim:
        claimName: jellyfin-cache
    - name: srv-media-host
      hostPath:
        path: /srv/media
```

Start **JellyFin** Pod and enable its `systemd` service:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/jellyfin.yaml 
```

Enable its `systemd` service

```bash
systemctl --user enable --now podman-pod@jellyfin.service
```

---

## Set up Ingresses

Our services are up and running. Let's set up the Ingresses for the following subdomains:

- **Nextcloud**: `nextcloud.example.com`.
- **Jellyfin**: `jellyfin.example.com`.

### 1. Create the **Nextcloud** configuration file

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/nextcloud.conf`

```conf
server {
    listen 80;
    server_name nextcloud.example.com;
    return 301 https://$host$request_uri;
}
server {
  set $upstream http://nextcloud;
  listen 443 ssl;
  server_name nextcloud.example.com;
  root /var/www/html;
  client_max_body_size 10G;
  client_body_buffer_size 400M;
  location / {
    proxy_pass $upstream;
  }
}
```

- **`client_max_body_size`**: This directive sets the maximum allowed size of the client request body. We set it to 10GB to allow large file uploads.
- **`client_body_buffer_size`**: This directive sets the buffer size for reading the request body. We set it to 400MB to allow large file uploads.

### 2. Create the **Jellyfin** configuration file

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/jellyfin.conf`

```conf
server {
    listen 80;
    server_name jellyfin.example.com;
    return 301 https://$host$request_uri;
}
server {
  set $upstream http://jellyfin:8096;
  listen 443 ssl;
  server_name jellyfin.example.com;
  location / {
    proxy_pass $upstream;
  }
}
```

### 3, Create a configuration file for Unifi Network

As we have the **Unifi Network Application** already set on server, we can create a ingress for it.

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/unifi.conf`

```conf
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}
server {
    listen 80;
    server_name unifi.example.com;
    return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  server_name unifi.example.com;
  set $upstream unifi:8443;

  location / {
    proxy_pass     https://$upstream;
    proxy_redirect https://$upstream https://$server_name;

    proxy_cache off;
    proxy_store off;
    proxy_buffering off;
    proxy_http_version 1.1;
    proxy_read_timeout 36000s;

    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Referer "";

    client_max_body_size 0;
  }
}
```

You can optionally remove the `forward port` for `8443/tcp` from the pod's `yaml`. To do so, it's just removing the following lines:

`/home/podman/deployments/unifi.yaml`

```yaml
...
spec:
  enableServiceLinks: false
  restartPolicy: Always
  containers:
  ...
  ports:
  ...
  # Remove these lines:
  - containerPort: 8443
      hostPort: 8443
      protocol: TCP
  ...
```

Redeploy the **Unifi Network Application** adding it to the network `ingress-net` as did with the other Pods.

`/home/podman/.config/systemd/user/podman-unifi.service`

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/unifi.yaml 
```

### 4. Configure the resolver

To **NGINX** reach services, it's necessary to set a resolver. To do that, do as follows:

1. Check the **ingress-net's gateway** configuration by typing:

```bash
podman network inspect ingress-net \
  --format 'Gateway: {{ range .Subnets }}{{.Gateway}}{{end}}'
```

```txt
Gateway: 10.89.1.1
```
<!-- markdownlint-disable MD029 -->
2. Create the resolver with the `IP Address` obtained:

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/resolver.conf`

```conf
resolver 10.89.1.1 valid=30s;
```

### 6. Configure Unbound to Resolve the hostsnames locally

My domain set on **Cloudflare**. To resolve my local DNS's, I will need to retrieve the DNS entries from **Cloudflare** and access those services via my **Public IP** over the Internet. This isn't needed, as I able to resolve the addresses locally. To do so, let's update the configuration for **Unbound** for resolving those addresses locally by editing the `local.conf`

`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

```conf
server:
  ...
  #Add the lines below. Leave the rest as is.
  local-data: "unifi.example.com. IN A 10.1.78.1"
  local-data: "nextcloud.example.com. IN A 10.1.78.1"
  local-data: "jellyfin.example.com. IN A 10.1.78.1"
```

Restart Ingress:

```bash
systemctl --user restart podman-pod@ingress.service
```

## Conclusion

Now that we have our services up and running, we can access them from our browser. We can access **Nextcloud** at `nextcloud.example.com` and **Jellyfin** at `jellyfin.example.com`. Configure the services, create accounts, and start using them.
On the next post, we will install **File servers** and configure **Cockpit** web interface to manage our services.

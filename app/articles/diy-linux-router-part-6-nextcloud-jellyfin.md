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

This is the fifth part of a multipart series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, setup Firewall and Unbound as DNS Server.

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, and set up Firewall and Unbound as DNS Servers.
In this chapter, let's do something more useful with our server, by installing some good services like Jellyfin and Nextcloud.

![Jellyfin, Nextcloud](/assets/images/diy-linux-router/nextcloud-jellyfin.webp)
*Jellyfin and Nextcloud*

## Table of Contents

- [What is Nextcloud](#what-is-nextcloud)
- [What is Jellyfin](#what-is-jellyfin)
- [Setting up the Storage](#setting-up-the-storage)
- [Ingress](#ingress)
  - [Setup Subdomains](#setup-subdomains)
  - [Podman Network for Ingress](#podman-network-for-ingress)
  - [Ingress pod](#ingress-pod)
  - [Let's Encrypt](#lets-encrypt)
- [Nextcloud](#nextcloud)
- [Jellyfin](#jellyfin)
- [Configure Ingress](#configure-ingress)
- [Conclusion](#conclusion)

## What is Nextcloud

There are plenty of cloud services for file storage over the internet. But everyone is way costly if you need storage space and there are privacy concerns, like the use of the stored data content for advertisement as being one example. Nextcloud addresses that by being a private cloud solution. With Nextcloud, you can store your data from everywhere in your storage box. With the auxiliary of the Nextcloud App, you can sync files, like videos and photos from your mobile to Nextcloud.

## What Is Jellyfin

It's very annoying paying a lot of on-demand media services like Netflix, Prime Video, Looke, and so on. More annoying when the content you wanted to watch simply vanishes from the platform. This is because you have access granted to the content as you pay for it, but you don't own the content itself. They can be removed from the catalog as the license contract ends with the producer.
So, why not own your proper content and run your own on-demand media server? Jellyfin addresses just that for you. Organizing and delivering content for you and your friends if you like.

## Setting Up the Storage

Both Jellyfin and Nextcloud store and access files. We could just create folders for them, but properly setting up the storage is better for properly backing up the data. With **ZFS** is fairly easy to create the intended **datasets** for each service.

```bash
zfs create -o mountpoint=none rpool/mnt
zfs create -o mountpoint=/mnt/container-volumes/nextcloud rpool/mnt/container-volumes/nextcloud
zfs create -o mountpoint=/mnt/shares/media rpool/mnt/shares/media
```

## Ingress

Every service lifts its own **HTTP** port. As far as the idea is to make those services available on the Internet, the ideal is to set up an ingress. Ingress is a **NGINX** service that will consolidate all services at **HTTPS** protocol on port **443**. Is important to **have an FQDN domain** and **create subdomains** on it as having a **public IPv4 address** is also good. If you don't have a domain. You could buy one to use it. Is fairly cheap these days. There are even free options. If you don't have a **publicly available IP address**, you can make use of a **VPS** on the Cloud to act as a proxy and ingress for you. **Oracle** per example offers a **Lifetime free of charge VPS** that [you can check it out](https://www.oracle.com/br/cloud/compute/). Just configure a **Wireguard** VPN and configure a connection between your **VPS** and your **Gateway**. There's an article about  **Wireguard** at [this link](/article/wireguard-vpn). Further, we will aboard **Wireguard** on this server, but to keep things simple, this tutorial will assume that you have a **publicity available IP address**.

### Setup Subdomains

On the domain administrator you have, add two DNS entries for your **IPv4** (A entry) with your **public IP Address** `nextcloud.example.com` and `jellyfin.example.com`
 as `example.com` being your *FDQN*. If you does not have a **fixed IP**, but instead an IP that changes, between connections, you can use [CloudDNS](https://www.cloudns.net/) that offers a **daemon** to automatically update DNS entries upon **IP Changing**.

### Podman Network for Ingress

As **Nextcloud** and **Jellyfin**, our **Ingress** will live into a **Podman's Pod** (or into a **VPS** for the case mentioned earlier). The **Ingress** needs to be able to talk with the **Nextcloud** and **Jellyfin** pods. So let's create a network for them.

```bash
podman network create \
  --driver bridge   \
  --gateway 10.90.1.1 \
  --subnet 10.90.1.0/24 \
  --ip-range 10.90.1.100/24  \
  ingress-net
```

Do not forget to add the new range to `nftables.nft`.

`/etc/nixos/modules/nftables.nft`

```conf
  chain podman_networks_input {
    ...
    ip saddr 10.90.1.0/24 accept comment "Podman ingress-net network"
  }

  chain podman_networks_forward {
    ...
    ip saddr 10.90.1.0/24 accept comment "Podman ingress-net network"
    ip daddr 10.90.1.0/24 accept comment "Podman ingress-net network"
  }
```

```bash
nixos-rebuild switch
```

### Ingress Pod

It's time to create our `ingress-pod`. As still there's none of the services running, this will be just a placeholder for setting up the **SSL Certificate**.

#### 1. Create a folder to act as **conf** volume

```bash
mkdir -p /opt/podman/ingress/conf
```

#### 2. Create a basic configuration for **NGINX**

`/opt/podman/ingress/conf/default_server.conf`

```conf
server {
    listen 80 default_server;
    server_name _;

    location ~ /.well-known/acme-challenge/ {
      root /var/www/;
    }
}
```

#### 3. Create the **ingress.yaml** file

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>ingress.yamll</b>.</summary>

`/opt/podman/ingress/ingress.yaml`

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
        hostPort: 80
      - containerPort: 443
        hostPort: 443
      volumeMounts:
      - mountPath: /etc/localtime
        name: etc-localtime-host
      - mountPath: /etc/nginx/conf.d
        name: opt-podman-ingress-conf-host
      - mountPath: /var/www
        name: ingress-www-pvc
      - mountPath: /etc/certificates
        name: certificates-pvc
  restartPolicy: Always
  volumes:
  - name: etc-localtime-host
    hostPath:
      path: /etc/localtime
      type: File
  - name: opt-podman-ingress-conf-host
    hostPath:
      path: /opt/podman/ingress/conf
      type: Directory
  - name: ingress-www-pvc
    persistentVolumeClaim:
      claimName: ingress-www
  - name: certificates-pvc
    persistentVolumeClaim:
      claimName: certificates
```

</details> <!-- markdownlint-enable MD033 -->

#### 4. Start the **ingress** pod by running the following command

```bash
podman kube play \
  /opt/podman/ingress/ingress.yaml \
  --replace --network ingress-net
```

By doing this, the `ingress-www` and `certificates` volumes will be used to validate the **SSL Certificates**, to be created at the next step.

### Let's Encrypt

The **Let's Encrypt** is a free service that provides **SSL Certificates**. It's also a service that is very easy to use. To use it, we will need to create a **pod** for it.

#### 1. Create an `yaml` file with the following content

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>lets-encrypt.yaml</b>.</summary>

`/opt/podman/ingress/lets-encrypt.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: lets-encrypt
  name: lets-encrypt
spec:
  networks:
    - name: ingress-net
  restartPolicy: Never
  containers:
    - name: certbot
      image: docker.io/certbot/certbot:v2.11.0
      args:
      - certonly
      - --agree-tos
      - --non-interactive
      - -v
      - --webroot
      - -w
      - /var/www/
      - --force-renewal
      - --email
      - your_email@gmail.com # Replace with your email
      - -d
      - jellyfin.example.net # as `example.net` being your FQDN
      - -d
      - nextcloud.example.net # as `example.net` being your FQDN
      volumeMounts:
      - name: certificates-pvc
        mountPath: /etc/letsencrypt
      - name: ingress-www-pvc
        mountPath: /var/www

  volumes:
    - name: ingress-www-pvc
      persistentVolumeClaim:
        claimName: ingress-www
  
    - name: certificates-pvc
      persistentVolumeClaim:
        claimName: certificates
```

</details> <!-- markdownlint-enable MD033 -->

#### 2. Run **lets-encrypt** pod with the following command

```bash
podman kube play \
  /opt/podman/ingress/lets-encrypt.yaml \
  --replace --network ingress-net
```

By running this **pod**, the **SSL Certificate** will be created and stored at the `certificate` volume. The `ingress-www` one was used to validate the **SSL Certificate**. With the certificate, let's update the ingress pod to serve **HTTPS** traffic with this certificate.

The **lets-encrypt** pod will be stopped after the **SSL Certificate** is created. You will need to run the **lets-encrypt** pod again from time to time to renew the **SSL Certificate**.

The certificate will be created at the `certificates` volume. You can check the logs of the **lets-encrypt** pod with the following command:

```bash
podman pod logs lets-encrypt
```

Update the configuration of the **nginx** with the certitication path.

`/opt/podman/ingress/conf/default_server.conf`

```conf
ssl_certificate     /etc/certificates/live/example.com/fullchain.pem;
ssl_certificate_key /etc/certificates/live/example.com/privkey.pem; 

server {
    listen 80 default_server;
    server_name _;

    location ~ /.well-known/acme-challenge/ {
      root /var/www/;
    }
}
```

#### 3. Restart the **ingress** pod

```bash
podman pod restart ingress
```

## Nextcloud

Now that we have the **Ingress** ready, we can start creating the **Nextcloud** service.

Create a path to place **Nextcloud** configuration files.

```bash
mkdir -p /opt/podman/nextcloud/
```

### Secrets

We will need to create a **secret** for the **Nextcloud** service. This secret will be used to store the **Nextcloud** database password. This secret will be placed in a `yaml` file to be deployed on **Podman**. I wrote a simple script to create the secret for us with a random 32-digits password. You can use it to create the secret for you.

#### 1. Create the secret file

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>create_secret.sh</b> file.</summary>
  
`/opt/podman/nextcloud/create_secret.sh`

```sh
#!/bin/bash

export MARIADB_ROOT_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MYSQL_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"

cat << EOF > secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: nextcloud-secrets
data:
  mariadbRootPassword: $(echo -n ${MARIADB_ROOT_PASSWORD} | base64)
  mysqlPassword: $(echo -n ${MYSQL_PASSWORD} | base64)
EOF

echo "Secret file created with the name secret.yaml"
```

```bash
chmod +x /opt/podman/nextcloud/create_secret.sh
cd /opt/podman/nextcloud
./create_secret.sh
```

```txt
Secret file created with the name secret.yaml
```

</details> <!-- markdownlint-enable MD033 -->

#### 2. Deploy the secret file created

```bash
podman kube play /opt/podman/nextcloud/secret.yaml
```

#### 3. Check for the newly created secret

You can check it out if the secret was created by running the following command:

```bash
podman secret list
```

```txt
ID                         NAME               DRIVER      CREATED             UPDATED
b22f3338bbdcec1ecd2044933  nextcloud-secrets  file        About a minute ago  About a minute ago
```

#### 4. Delete the `secret.yaml` file

Maintaining the secret file can be a security flaw. It's a good practice to delete the secret file after deployment. Be aware that you cannot retrieve it's secret contents again in the future.

```bash
rm -f /opt/podman/nextcloud/secret.yaml
```

### YAML for Nextcloud

The **Nextcloud** service will be deployed on **Podman**. To do this, we will need to create a `yaml` file with the following content:

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>nextcloud.yaml</b>.</summary>

`/opt/podman/nextcloud/nextcloud.yaml`

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
        name: mnt-container-volumes-nextcloud-html-host
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
            name: nextcloud-secrets
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
            name: nextcloud-secrets
            key: mysqlPassword
      - name: MARIADB_ROOT_PASSWORD
        valueFrom:
          secretKeyRef:
            name: nextcloud-secrets
            key: mariadbRootPassword

  volumes:
  - name: mnt-container-volumes-nextcloud-html-host
    hostPath:
      path: /mnt/container-volumes/nextcloud/html
      type: Directory


  - name: nextcloud-db-pvc
    persistentVolumeClaim:
      claimName: nextcloud_db
```

</details> <!-- markdownlint-enable MD033 -->

This `yaml` file will create a **Nextcloud** service with a **MariaDB** database. It will use `/srv/nextcloud` as the **Nextcloud** data directory. Start the **Nextcloud** service with the following command:

```bash
mkdir -p /mnt/container-volumes/nextcloud/html/
podman kube play \
  /opt/podman/nextcloud/nextcloud.yaml \
  --replace --network ingress-net
```

## Jellyfin

As usual, create a directory to maintain **Jellyfin** configuration files.

```bash
mkdir -p /opt/podman/jellyfin
```

The **Jellyfin** service will be deployed on **Podman**. To do this, we will need to create a `yaml` file with the following content:

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Click to expand the <b>jellyfin.yaml</b>.</summary>

`/opt/podman/jellyfin/jellyfin.yaml`

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
          name: mnt-shares-media-host
  volumes:
    - name: jellyfin-config-pvc
      persistentVolumeClaim:
        claimName: jellyfin_config
    - name: jellyfin-cache-pvc
      persistentVolumeClaim:
        claimName: jellyfin_cache
    - name: mnt-shares-media-host
      hostPath:
        path: /mnt/shares/media
```

</details> <!-- markdownlint-enable MD033 -->

This `yaml` file will create a **Jellyfin** service. Start the **Jellyfin** service with the following command:

```bash
podman kube play \
  /opt/podman/jellyfin/jellyfin.yaml \
  --replace --network ingress-net
```

## Configure Ingress

Our services are up and running on our Gateway and comes the time to configure our ingress to proxy the ingresses connections from `nextcloud.example.com` and `jellyfin.example.com` to proxy the `nextcloud` **Pod** and `jellyfin` **Pod** respectively.

### 1. Crete the **Nextcloud** configuration file

`/opt/podman/ingress/conf/nextcloud.conf`

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

`/opt/podman/ingress/conf/jellyfin.conf`

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

### 3, Create a configuration file for **unifi**

As we have the **Unifi Network Application** already set on server, we can create a ingress for it.

`/opt/podman/ingress/conf/unifi-network.conf`

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
  set $upstream unifi-network:8443;

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

`/opt/podman/unifi-network/unifi-network.yaml`

```yaml
...
spec:
  enableServiceLinks: false
  restartPolicy: Always
  containers:
  ...
  ports:
  ...
  # Remove these lines below:
  - containerPort: 8443
      hostPort: 8443
      hostIP: 10.1.1.1
      protocol: TCP
  ...
```

Redo the deployment of `unifi-network` pod with parameter `--network=ingress-net`:

```bash
podman kube play --replace /opt/podman/unifi-network/unifi-network.yaml --network ingress-net
```

### 4. Configure the resolver

To **NGINX** reach services, it's necessary to set a resolver. To do that, do as follows:

1. Check the **ingress-net's gateway** configuration by typing:

```bash
podman network inspect ingress-net \
  --format 'Gateway: {{ range .Subnets }}{{.Gateway}}{{end}}'
```

```txt
Gateway: 10.90.1.1
```
<!-- markdownlint-disable MD029 -->
2. Create the resolver with the `IP Address` obtained:

`/opt/podman/ingress/conf/resolver.conf`

```conf
resolver 10.90.1.1 valid=30s;
```

### 5. Restart **ingress**

Everything is set. Restart the **ingress** service.

```bash
podman pod restart ingress
```

### 6. Configure `Unbound` to Resolve the hostsnames locally

My domain set on **Cloudflare**. To resolve my local DNS's, I will need to retrieve the DNS entries from **Cloudflare** and access those services via my **Public IP** over the Internet. This isn't needed, as I able to resolve the addresses locally. To do so, let's update the configuration for **Unbound** for resolving those addresses locally by editing the `local.conf`

`/opt/podman/unbound/conf.d/local.conf`

```conf
server:
  private-domain: "example.com."
  local-zone: "example.com." static
  local-data: "macmini.example.com. IN A 10.1.1.1"
  local-data: "macmini.example.com. IN A 10.1.30.1"
  local-data: "macmini.example.com. IN A 10.1.90.1"
  local-data: "unifi.example.com. IN A 10.1.1.1"
  local-data: "nextcloud.example.com. IN A 10.1.1.1"
  local-data: "jellyfin.example.com. IN A 10.1.1.1"
```

Restart Unbound:

```bash
podman kube play --replace /opt/podman/unbound/unbound.yaml
```

## Conclusion

Now that we have our services up and running, we can access them from our browser. We can access **Nextcloud** at `nextcloud.example.com` and **Jellyfin** at `jellyfin.example.com`. Configure the services, create accounts, and start using them.
On the next post, we will install **File servers** and configure **Cockpit** web interface to manage our services.

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

In the previous parts, we installed the operating system, configured the gateway's internet functionality using PPPoE, and set up Firewall and Unbound as DNS Servers.
In this chapter, let's do something more useful with our server by installing some good services like Jellyfin and Nextcloud.

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

Run with `sudo`:

Assuming that the **data** storage pool is named `zdata`. If you has choosen to use the same Pool for root, apply the correct names.

```bash
ZDATA=zdata
```

### Create a dataset for Nextcloud Storage

```bash
zfs create ${ZDATA}/containers/podman/storage/volumes/nextcloud-html
zfs create ${ZDATA}/containers/podman/storage/volumes/nextcloud-db
chown -R podman:podman /mnt/${ZDATA}/containers/podman/storage/volumes/nextcloud-*
```

### Create another dataset for storing media files

```bash
zfs create -o canmount=off ${ZDATA}/shares
zfs create ${ZDATA}/shares/media
```

## Ingress

Every service runs on its own **HTTP** port. As far as the idea is to make those services available on the Internet, the ideal is to set up an **Ingress Service**. Ingress is a **NGINX** service to act as a **proxy** to consolidate all services at **HTTPS** protocol on port **443**. If you do want to make these services available to the internet, you will have to buy a **FQDN domain** and **create subdomains** on it as having a **public IPv4 address** is also good. If you don't have a domain. You could buy one to use it. Is fairly cheap these days. There are even free options. If you don't have a **publicly available IP address**, you can make use of a **VPS** on the Cloud to act as a proxy and ingress for you. **Oracle** per example offers a **Lifetime free of charge VPS** that [you can check it out](https://www.oracle.com/br/cloud/compute/). Just configure a **Wireguard** VPN and configure a connection between your **VPS** and your **Gateway**. There's an article about  **Wireguard**

### Setup Subdomains

On the domain administrator you have, add two DNS entries for your **IPv4** (A entry) with your **public IP Address** `nextcloud.example.com` and `jellyfin.example.com`
 as `example.com` being your *FDQN*. If you does not have a **fixed IP**, but instead an IP that changes, between connections, you can use [CloudDNS](https://www.cloudns.net/) that offers a **daemon** to automatically update DNS entries upon **IP Changing**.

### Podman Network for Ingress

As **Nextcloud** and **Jellyfin**, our **Ingress** will live into a **Podman's Pod** (or into a **VPS** for the case mentioned earlier). The **Ingress** needs to be able to talk with the **Nextcloud** and **Jellyfin** pods. So let's create a network for them.

Run as `podman` user:

```bash
podman network create ingress-net
```

### Ingress Pod

It's time to create our `ingress-pod`. As still there's none of the services running, this will be just a placeholder for setting up the **SSL Certificate**.

#### 1. Create the ingress-conf volume

```bash
podman volume create ingress-conf
```

#### 2. Create a basic configuration for **NGINX**

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/default_server.conf`

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

Create the pod file for ingress:

`/home/podman/deployments/ingress.yaml`

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

As you can see, because of the limitation to open ports below `1024` on `rootless` mode, the `HTTP` and `HTTPS` ports will be redirect. `80` to `1080` and `443` to `1443`.

We need to open these ports and redirect them on Firewall back to `80` and `443` to make it work as intended.
With `sudo`, let's adjust our `nftables` configuration. Remember to after that, login back to the `podman` user, as there's other things needed to be done with **podman** user.

##### Table `inet filter`

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain ingress_dns_input {
    tcp dport 1080 ct state { new, established } counter accept comment "Ingress HTTP"
    tcp dport 1443 ct state { new, established } counter accept comment "Ingress HTTPS"
  }

  chain input {
    ...
    jump ingress_dns_input  

    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }
}
```

##### Table `nat`

`/etc/nixos/modules/nftables.nft`
table ip nat {
  ...
  chain ingress_redirect {
    ip daddr { 10.1.1.1, 10.1.30.1, 10.1.90.1 } tcp dport  80 redirect to 1080
    ip daddr { 10.1.1.1, 10.1.30.1, 10.1.90.1 } tcp dport 443 redirect to 1443
    iifname "ppp0" tcp dport  80 redirect to 1080
    iifname "ppp0" tcp dport 443 redirect to 1443
  }
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    tcp flags syn tcp option maxseg size set 1452
    jump unbound_redirect
    jump ingress_redirect
  }
}
`

We can also close the port `8443` used by **Unifi Network** as we will access these service through **ingress**.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  chain unifi_network_input {
    iifname "br0" udp dport 3478 ct state { new, established } counter accept comment "Unifi STUN"
    iifname "br0" udp dport 10001 ct state { new, established } counter accept comment "Unifi Discovery"
    iifname "br0" tcp dport 8080 ct state { new, established } counter accept comment "Unifi Communication"
    # Remove the
    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }
}
```

##### Table NAT

`/etc/nixos/modules/nftables.nft`
table ip nat {
  ...
  chain ingress_redirect {
    ip daddr { 10.1.1.1, 10.1.30.1, 10.1.90.1 } tcp dport  80 redirect to 1080
    ip daddr { 10.1.1.1, 10.1.30.1, 10.1.90.1 } tcp dport 443 redirect to 1443
    iifname "ppp0" tcp dport  80 redirect to 1080
    iifname "ppp0" tcp dport 443 redirect to 1443
  }
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    tcp flags syn tcp option maxseg size set 1452
    jump unbound_redirect
    jump ingress_redirect
  }
}
`

We can also close the port `8443` used by **Unifi Network** as we will access these service through **ingress**.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  chain unifi_network_input {
    iifname "br0" udp dport 3478 ct state { new, established } counter accept comment "Unifi STUN"
    iifname "br0" udp dport 10001 ct state { new, established } counter accept comment "Unifi Discovery"
    iifname "br0" tcp dport 8080 ct state { new, established } counter accept comment "Unifi Communication"
    # Remove the 8443 redirect, let the other ones.
  }
}
```

##### What we did?

- On **input**, we accepted every connection to ingress ports, at this case `1080` and `1443` regardless of the interface.
- On **rerouting** we have:
  - **Redirected** any connection comming from `ppp0` to the `ingress` pod from ports `80` and `443` to `1080` and `1443` respectively.
  - **Redirected** any connection from local network intended to reach the server to **ingress** pod.
  - **Removed** the `8443` port access from network, as is not needed anymore.

#### 4. Start the Ingress Pod and Enalbe Systemd Unit

Start the Ingress Pod by running:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/ingress.yaml 
```

Enable its `systemd` service file:

```bash
systemctl --user enable podman-pod@ingress.service --now
```

The Ingress pod creates additional volumes, like `ingress-www` and `certificates` that will be used to validate the **SSL Certificates**, to be created at the next step. You can check it's creations by running `podman volume list`.

### Let's Encrypt

The **Let's Encrypt** is a free service that provides **SSL Certificates**. We going to use a utility called **certbot** to renew our certificates.

#### Create a systemd unit service for renewal

These certificates expires in a short period of time. So having a systemd unit to renew the service every month avoid your domains to have their certificates expired. Replace the `DOMAINS` list with your domains, as `EMAIL` with your e-mail address.

- Create a systemd unit `certbot.service`

`/home/podman/.config/systemd/user/certbot.service`

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

- Create the `timer` unit which will trigger the renewal event once in a month

`/home/podman/.config/systemd/user/certbot.timer`

```ini
[Unit]
Description=Renew certificates using certbot montly.

[Timer]
OnCalendar=monthly
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start `certbot.service`. Check logs to see if the registration was successful.

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

Update the configuration of the **nginx** with the certitication path.

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

#### 3. Restart the **ingress** pod

```bash
systemctl --user restart podman-pod@ingress.service
```

## Nextcloud

Now that we have the **Ingress** ready, we can start creating the **Nextcloud** service.

### Secrets

We will need to create a **secret** for the **Nextcloud** service. This secret will be used to store the **Nextcloud** database password. This secret will be placed in a `yaml` file to be deployed on **Podman**. I wrote a simple script to create the secret for us with a random 32-digits password. You can use it to create the secret for you.

#### 1. Create the secret file

Create the secret file for the **Nextcloud** service:

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

#### 2. Deploy the secret file created

```bash
podman kube play /home/podman/deployments/nextcloud-secret.yaml
```

#### 3. Check for the newly created secret

You can check it out if the secret was created by running the following command:

```bash
podman secret list
```

```txt
ID                         NAME               DRIVER      CREATED             UPDATED
b22f3338bbdcec1ecd2044933  nextcloud-secret   file        About a minute ago  About a minute ago
```

#### 4. Delete the `secret.yaml` file

Maintaining the secret file can be a security flaw. It's a good practice to delete the secret file after deployment. Be aware that you cannot retrieve it's secret contents again in the future.

```bash
rm -f /home/podman/deployments/nextcloud-secret.yaml
```

### YAML for Nextcloud

The **Nextcloud** service will be deployed on **Podman**. To do this, we will need to create a `yaml` file with the following content:

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

This `yaml` file will create a **Nextcloud** service with a **MariaDB** database. It will use `/srv/nextcloud` as the **Nextcloud** data directory. Start the **Nextcloud** service with the following command:

### Start Pod and enable its systemd service

As did for Ingress, start the pod with the following command:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/nextcloud.yaml 
```

Enable **Nextcloud** `systemd` service:

```bash
systemctl --user enable --now podman-pod@nextcloud.service
```

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
          name: mnt-zdata-shares-media-host
  volumes:
    - name: jellyfin-config-pvc
      persistentVolumeClaim:
        claimName: jellyfin-config
    - name: jellyfin-cache-pvc
      persistentVolumeClaim:
        claimName: jellyfin-cache
    - name: mnt-zdata-shares-media-host
      hostPath:
        path: /mnt/zdata/shares/media
```

Start **JellyFin** Pod and enable its `systemd` service:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/jellyfin.yaml 
```

Enable its `systemd` service

```bash
systemctl --user enable --now podman-pod@jellyfin.service
```

## Configure Ingress

Our services are up and running on our Gateway and comes the time to configure our ingress to proxy the ingresses connections from `nextcloud.example.com` and `jellyfin.example.com` to proxy the `nextcloud` **Pod** and `jellyfin` **Pod** respectively.

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

### 3, Create a configuration file for **unifi**

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

### 6. Configure `Unbound` to Resolve the hostsnames locally

My domain set on **Cloudflare**. To resolve my local DNS's, I will need to retrieve the DNS entries from **Cloudflare** and access those services via my **Public IP** over the Internet. This isn't needed, as I able to resolve the addresses locally. To do so, let's update the configuration for **Unbound** for resolving those addresses locally by editing the `local.conf`

`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

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

Restart Ingress:

```bash
systemctl --user restart podman-pod@ingress.service
```

## Conclusion

Now that we have our services up and running, we can access them from our browser. We can access **Nextcloud** at `nextcloud.example.com` and **Jellyfin** at `jellyfin.example.com`. Configure the services, create accounts, and start using them.
On the next post, we will install **File servers** and configure **Cockpit** web interface to manage our services.

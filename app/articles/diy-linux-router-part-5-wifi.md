---
title: "DIY Linux Router - Parte 5 - Wifi"
articleId: "diy-linux-router-part-5-wifi"
date: "2024-11-04"
author: "Carlos Junior"
category: "Linux"
brief: "In this fifth part of this series, we will configure our wireless network using the Ubiquiti Unifi AP 6."
image: "/assets/images/diy-linux-router/unifi-c6-lite.webp"
keywords : ["macmini","roteador", "linux", "nixos", "ubuquiti", "unifi", "podman", "docker"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-5-wifi"}]
---

This is the fifth part of this series, we will configure our wireless network using the Ubiquiti Unifi AP 6.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 3: [Users, Security and Firewall](/article/diy-linux-router-part-3-users-security-firewall)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)

Já temos um roteador de internet funcional e confiável, mas ainda não configuramos nossa rede **Wifi** e este capítulo enderecerá isso.

![Stephen Herber's Unifi Logo as a dinner plate](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Stephen Herber's old blogpost about [DIY Linux as a router: Web archived link](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

- [Introduction](#introduction)
- [Physical Connection](#physical-connection)
- [Pod Setup](#pod-setup)
- [Firewall](#firewall)
- [Conclusion](#conclusion)

## Introduction

This **Mac mini**, like many machines, has a built-in wireless interface that could be used to create the intended wireless network. But, in most of cases, the card is not that reliable, and with a poor performance and low speed that does not worth using it. With this in mind, I choose touse a different approach. A proper **Acess Point** and this one provided by **Unifi** is reliable, cost-effective, and easy to use and setup.

## Physical Connection

As mentioned in [part 2](/articles/diy-linux-part-2-network-and-internet) the **Unifi AP** needs to be connected to the **Port 3** of the **Switch**, as this port was already configured the intended **VLANs** at this port.

Remember to install the **PoE feeder** to supply power for the **AP**. Check whether the LEDs lights up to confirm that everything is working.

```txt
            ┌─────► AP Unifi U6 Lite   
            │   
┌───────────┴───────────────────────┐    
| ┌───┬───┬───┬───┬───┬───┬───┬───┐ |
| │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ |
| └───┴───┴───┴───┴───┴───┴───┴───┘ |
└───────────┬───────────────────────┘
            │  
            └─────► Untagged VLAN 1, Tagged VLAN 30, 90
```

## Pod Setup

To manage this **AP** we need to install the **Unifi Network Application**. There's a **Docker Image** provided [LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/) that fits this purpose. Let's then set a **Pod** with.

Run all the commands as `podman` user:

```bash
ssh router-podman
```

### 1. Create the `unifi-secret.yaml` file

The **Unifi Network Application** uses a **MongoDB Database** to persist information, which demands setting up **usernames** and **passwords**. We could create a generic password as plain text, but this would be a security risk. It is better to use a complex password and store it securely. **Podman** offers a functionality of this which is the `secrets repository`. I made a simple script that generates the intended passwords randomly and then creates the `unifi-secret.yaml` file with it file for deployment.


```sh
cd /home/podman/deployments/

export MONGO_INITDB_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MONGO_PASS="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"

cat << EOF > unifi-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: unifi-secret
data:
  mongoRootPassword: $(echo -n ${MONGO_INITDB_PASSWORD} | base64)
  mongoPassword: $(echo -n ${MONGO_PASS} | base64)
EOF

echo "Secret file created with the name unifi-secret.yaml"
```

A file named `unifi-secret.yaml` wil be created at the directory you are in. Deploy it on `podman`:

```bash
podman kube play /home/podman/deployments/unifi-secret.yaml
```

If everything worked as intended. You had deployed a new secret into `podman`. You can check it by:

```bash
podman secret list
```

```txt
ID                         NAME                  DRIVER      CREATED        UPDATED
8aca9476dd8846f979b3f9054  unifi-secret          file        8 seconds ago  8 seconds ago
```

After deploying this secret, is a good practice to delete the `secret.yaml` file. Be aware that by doing so, you will be unable to delete and recreate this secret using the same password previously created.

```bash
rm /home/podman/deployments/unifi-secret.yaml
```

### 3. Create the `unifi.yaml` pod file

As **Podman** being able to natively deploy **Kubernetes** deployment files, let's create a deployment file for **Unifi Network Application**.

`/home/podman/deployments/unifi.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: unifi-initdb-mongo
data:
  init-mongo.sh: |
    #!/bin/bash
    if which mongosh > /dev/null 2>&1; then
      mongo_init_bin='mongosh'
    else
      mongo_init_bin='mongo'
    fi
    "${mongo_init_bin}" <<EOF
    use ${MONGO_AUTHSOURCE}
    db.auth("${MONGO_INITDB_ROOT_USERNAME}", "${MONGO_INITDB_ROOT_PASSWORD}")
    db.createUser({
      user: "${MONGO_USER}",
      pwd: "${MONGO_PASS}",
      roles: [
        { db: "${MONGO_DBNAME}", role: "dbOwner" },
        { db: "${MONGO_DBNAME}_stat", role: "dbOwner" }
      ]
    })
    EOF
---
apiVersion: v1
kind: Pod
metadata:
  name: unifi
  labels:
    app: unifi
spec:
  enableServiceLinks: false
  restartPolicy: Always
  containers:
  # Application container
  - name: application
    image: lscr.io/linuxserver/unifi-network-application:8.5.6
    resources:
      limits:
        memory: 1100Mi
        ephemeral-storage: 100Mi
      requests:
        cpu: 1.0
        memory: 600Mi
        ephemeral-storage: 50Mi
    volumeMounts:
    - mountPath: /config
      name: unifi-application-config-pvc
    env:
    - name: PGID
      value: "1000"
    - name: TZ
      value: America/Sao_Paulo
    - name: MONGO_USER
      value: unifi
    - name: MONGO_PASS
      valueFrom:
        secretKeyRef:
          name: unifi-secret
          key: mongoPassword
    - name: MONGO_HOST
      value: unifi-db
    - name: MONGO_PORT
      value: "27017"
    - name: MONGO_DBNAME
      value: unifi
    - name: MONGO_AUTHSOURCE
      value: admin
    - name: MEM_LIMIT
      value: "1024"
    ports:
    - containerPort: 3478
      hostPort: 3478
      protocol: UDP
    - containerPort: 10001
      hostPort: 10001
      protocol: UDP
    - containerPort: 8080
      hostPort: 8080
      protocol: TCP
    - containerPort: 8443
      hostPort: 8443
      protocol: TCP

  # MongoDB container
  - name: db
    image: docker.io/library/mongo:4.4
    resources:
      limits:
        memory: 200Mi
        ephemeral-storage: 100Mi
      requests:
        memory: 100Mi
        ephemeral-storage: 200Mi
    volumeMounts:
    - mountPath: /docker-entrypoint-initdb.d
      name: initdb-mongo-configmap
      readOnly: true
    - mountPath: /data/db
      name: unifi-mongo-db-pvc
    - mountPath: /data/configdb
      name: unifi-mongo-configdb-pvc 
    env:
    - name: MONGO_PASS
      valueFrom:
        secretKeyRef:
          name: unifi-secret
          key: mongoPassword
    - name: MONGO_INITDB_ROOT_PASSWORD
      valueFrom:
        secretKeyRef:
          name: unifi-secret
          key: mongoRootPassword
    - name: MONGO_INITDB_ROOT_USERNAME
      value: root
    - name: MONGO_USER
      value: unifi
    - name: MONGO_DBNAME
      value: unifi
    - name: MONGO_AUTHSOURCE
      value: admin

  volumes:
  - name: initdb-mongo-configmap
    configMap:
      name: unifi-initdb-mongo
  - name: unifi-mongo-db-pvc
    persistentVolumeClaim:
      claimName: unifi-mongo-db
  - name: unifi-mongo-configdb-pvc 
    persistentVolumeClaim:
      claimName: unifi-mongo-configdb
  - name: unifi-application-config-pvc
    persistentVolumeClaim:
      claimName: unifi-application-config
```

### 4. Start Pod and Enable its Systemd Unit

Start the pod and check if its working properly.

```bash
podman --log-level info kube play --replace /home/podman/deployments/unifi.yaml
```

Enable its `systemd` unit.

```bash
systemctl --user enable --now podman-pod@unifi.service
```

### 5. Add an A entry to Unbound

To allow the **AP** to be adopted, it needs to reach the **Unifi Network Painel** by concatcting a host named **unifi**. Let's add an A entry to **Unbound** configuration

`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

```conf
server:
  private-domain: "home.example.com."
  local-zone: "home.example.com." static
  local-data: "macmini.home.example.com. IN A 10.1.1.1"
  local-data: "macmini.home.example.com. IN A 10.1.30.1"
  local-data: "macmini.home.example.com. IN A 10.1.90.1"
  local-data: "unifi.home.example.com. IN A 10.1.1.1"
  local-data: "unifi. IN A 10.1.1.1"
```

## Firewall

To make **Unifi Network** available to the network, it's necessary to open firwall ports. As all the ports are above the `1024`, it's just a matter of opening them. The ports are:

- **3478/UDP** - Unifi STUN port.
- **10001/UDP** - Unifi Discovery port.
- **8080/TCP** - HTTP port for communication between Unifi devices.
- **8443/TCP** - HTTPS Web port. Will keep it open temporarely.

### Edit `nftables.nft`

Edit the file `nftables.nft` as described. You have to switch from user `podman` to user `admin` and do the firewall changes with `sudo`:

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain unifi_network_input {
    iifname "br0" udp dport 3478 ct state {new, established } counter accept comment "Unifi STUN"
    iifname "br0" udp dport 10001 ct state {new, established } counter accept comment "Unifi Discovery"
    iifname "br0" tcp dport 8080 ct state {new, established } counter accept comment "Unifi Communication"
    iifname "br0" tcp dport 8443 ct state {new, established } counter accept comment "Unifi Webmanager"
  }
  chain input {
    ...
    jump unbound_dns_input
    jump unifi_network_input   
 
    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" drop
  }
  ...
}
```

Rebuild **NixOS**

```bash
nixos-rebuild switch
```

## Configuration

1. Access the **Unifi Network Application** on **Web browser** at [10.1.1.1:8443](https://10.1.1.1:8443). This will placed under a **NGINX** proxy afterwards.
2. Define your `Server Name` and your `Country`.
3. Configure your **username** and **password**. You can create an account on [account.ui.com](https://account.ui.com/) or create an account locally.

### Device Adoption

The **Unifi Network** needs to adopt your **Unifi AP**. Since the application is running on **Podman** under an **IP Address** which is not accessible by other devices. So far, everything what we did would allow new devices to be automatically adoptable by the application, but if not, try as described below:

Change the **Inform IP Address**. This is done by going to **Settings** > **System** > **Advanced** and setting the **Inform Host** to a **hostname**, in that case, `macmini` or the **IP address** `10.1.1.1`. Additionally the checkbox **"Override"** has to be checked, so that devices can connect to the controller during adoption. More detailed information at the [LinuxServer.io documentation](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).

### Troubleshooting Adoption Problems

You you are having trouble with automatic adoption, you can double check if the settings are correct to made it work as intended:

- Ports `8080/tcp` and `3478/udp` being open and accessible.
- Changed the **inform host** mentioned [above](#device-adoption).

### Manual Adotion

If all the adjustaments did not made your **Unifi** device being adopted, maybe your device was adopted by other painel and needs to be manually adopted. You can do this by doing the following:

```bash
ssh ubnt@$AP-IP
set-inform http://10.1.1.1:8080/inform
```

Check the IP address of **AP** by looking at the `DHCP server` file at `/var/lib/kea/dhcp4.leases`.

The default username and password is `ubnt`. If the device was previously adopted, check on their previous panel what is the `username` and `password` set under **Settings** > **System** > **Advanced**. Generally, the `username` and `password` are the **Unifi account's** one. It's valuable to mention that every time you want to replace your Ubiquiti Network Application, is a good measure to remove your devices before decommissioning that panel. Making backups for your configuration is also a good measure to prevent headaches re-adopting devices—more details on [LinuxServer.io documentation](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).

## Conclusion

If you have this far, you successfully configured the main functionalities of your **Linux Router** and can use it as your main internet connection for your home. At the next chapter we will configure other services as **Jellyfin**, a private streaming service and **Nextcloud**, a private cloud solution.

- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)

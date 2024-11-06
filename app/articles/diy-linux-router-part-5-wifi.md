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
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)

Já temos um roteador de internet funcional e confiável, mas ainda não configuramos nossa rede **Wifi** e este capítulo enderecerá isso.

![Stephen Herber's Unifi Logo as a dinner plate](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Stephen Herber's old blogpost about [DIY Linux as a router: Web archived link](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

- [Introduction](#introduction)
- [Physical Connection](#physical-connection)
- [Pod Setup](#pod-setup)
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

Run all the commands as `sudo`:

```bash
sudo -i
```

### 1. Create directories for this Pod

Create a directory to contain all the files to manage this pod.

```bash
mkdir -p /opt/podman/unifi-network
```

### 2. Create the `secret.yaml` file

The **Unifi Network Application** uses a **MongoDB Database** to persist information, which demands setting up **usernames** and **passwords**. We could create a generic password as plain text, but this would be a security risk. It is better to use a complex password and store it securely. **Podman** offers a functionality of this which is the `secrets repository`. I made a simple script that generates the intended passwords randomly and then creates the `secret.yaml` file with it file for deployment.

Create a `sh` file with the following:

`/opt/podman/unifi-network/create_secret.sh`

```sh
#!/bin/bash

export MONGO_INITDB_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MONGO_PASS="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"

cat << EOF > secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: unifi-network-secret
data:
  mongoRootPassword: $(echo -n ${MONGO_INITDB_PASSWORD} | base64)
  mongoPassword: $(echo -n ${MONGO_PASS} | base64)
EOF

echo "Secret file created with the name secret.yaml"
```

Attribute to script the execution flag (`-x`) and run it.

```bash
chmod +x /opt/podman/unifi-network/create_secret.sh
cd /opt/podman/unifi-network/
./create_secret.sh
```

A file named `secret.yaml` wil be created at the directory you are in. Deploy it on `podman`:

```bash
podman kube play /opt/podman/unifi-network/secret.yaml
```

If everything worked as intended. You had deployed a new secret into `podman`. You can check it by:

```bash
podman secret list
```

```txt
ID                         NAME                  DRIVER      CREATED        UPDATED
8aca9476dd8846f979b3f9054  unifi-network-secret  file        8 seconds ago  8 seconds ago
```

After deploying this secret, is a good practice to delete the `secret.yaml` file. Be aware that by doing so, you will be unable to delete and recreate this secret using the same password previously created.

```bash
rm /opt/podman/unifi-network/secret.yaml
```

### 3. Create the `unifi-network.yaml` pod file

As **Podman** being able to natively deploy **Kubernetes** deployment files, let's create a deployment file for **Unifi Network Application**.

`/opt/podman/unifi-network/unifi-network.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: unifi-network-initdb-mongo
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
  name: unifi-network
  labels:
    app: unifi-network
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
      name: unifi-network-application-config-pvc
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
          name: unifi-network-secret
          key: mongoPassword
    - name: MONGO_HOST
      value: unifi-network-db
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
      hostIP: 10.1.1.1
      protocol: UDP
    - containerPort: 10001
      hostPort: 10001
      hostIP: 10.1.1.1
      protocol: UDP
    - containerPort: 8080
      hostPort: 8080
      hostIP: 10.1.1.1
      protocol: TCP
    - containerPort: 8443
      hostPort: 8443
      hostIP: 10.1.1.1
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
      name: unifi-network-mongo-db-pvc
    - mountPath: /data/configdb
      name: unifi-network-mongo-configdb-pvc 
    env:
    - name: MONGO_PASS
      valueFrom:
        secretKeyRef:
          name: unifi-network-secret
          key: mongoPassword
    - name: MONGO_INITDB_ROOT_PASSWORD
      valueFrom:
        secretKeyRef:
          name: unifi-network-secret
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
      name: unifi-network-initdb-mongo
  - name: unifi-network-mongo-db-pvc
    persistentVolumeClaim:
      claimName: unifi-network-mongo-db
  - name: unifi-network-mongo-configdb-pvc 
    persistentVolumeClaim:
      claimName: unifi-network-mongo-configdb
  - name: unifi-network-application-config-pvc
    persistentVolumeClaim:
      claimName: unifi-network-application-config

```

### 4. Deploy the Unifi Network Application

The deployment of the **Unifi Network Application** can be performed by running the following command:

```bash
podman kube play --replace /opt/podman/unifi-network/unifi-network.yaml
```

## Configuration

1. Access the **Unifi Network Application** on **Web browser** at [10.1.1.1:8443](https://10.1.1.1:8443). This will placed under a **NGINX** proxy afterwards.
2. Define your `Server Name` and your `Country`.
3. Configure your **username** and **password**. You can create an account on [account.ui.com](https://account.ui.com/) or create an account locally.

### Device Adoption

The **Unifi Network** needs to adopt your **Unifi AP**. Since the application is running on **Podman** under an **IP Address** which is not accessible by other devices, we have to change the **Inform IP Address**. This is done by going to **Settings** > **System** > **Advanced** and setting the **Inform Host** to a **hostname**, in that case, `macmini` or the **IP address** `10.1.1.1`. Additionally the checkbox **"Override"** has to be checked, so that devices can connect to the controller during adoption. More detailed information at the [LinuxServer.io documentation](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).

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

---
title: "Roteador Linux Parte 6 - Nextcloud e Jellyfin"
articleId: "roteador-linux-parte-6-nextcloud-jellyfin"
date: "2024-11-05"
author: "Carlos Junior"
category: "Linux"
brief: "Na sexta parte desta série, vamos instalar o Jellyfin, um servidor de mídia privado para uso doméstico, e o Nextcloud, uma solução de armazenamento em nuvem privada."
image: "/assets/images/diy-linux-router/nextcloud-jellyfin.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unbound", "podman", "docker"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-6-nextcloud-jellyfin"}]
---

Esta é a quinta parte de uma série de múltiplas partes que descreve como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 3: [Usuários, segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)

Nas partes anteriores, instalamos o sistema operacional, configuramos a funcionalidade de internet do gateway usando PPPoE e configuramos o Firewall e o Unbound como servidores DNS.

Nesta parte, vamos fazer algo mais útil com nosso servidor, instalando alguns bons serviços como o Jellyfin e o Nextcloud.

![Jellyfin, Nextcloud](/assets/images/diy-linux-router/nextcloud-jellyfin.webp)
*Jellyfin e Nextcloud*

## Índice

- [O que é o Nextcloud](#o-que-é-o-nextcloud)
- [O que é o Jellyfin](#o-que-é-o-jellyfin)
- [Configurando o Armazenamento](#configurando-o-armazenamento)
- [Ingress](#ingress)
  - [Configurar Subdomínios](#configurar-subdomínios)
  - [Rede Podman para Ingress](#rede-podman-para-ingress)
  - [Pod de Ingress](#pod-de-ingress)
  - [Let's Encrypt](#lets-encrypt)
- [Nextcloud](#nextcloud)
- [Jellyfin](#jellyfin)
- [Configurar Ingress](#configurar-ingress)
- [Conclusão](#conclusão)

## O que é o Nextcloud

Existem muitos serviços de armazenamento em nuvem pela internet. Mas todos eles são caros se você precisar de muito espaço de armazenamento, além de apresentarem preocupações com privacidade, como o uso do conteúdo armazenado para anúncios, sendo um exemplo. O Nextcloud resolve isso ao ser uma solução de nuvem privada. Com o Nextcloud, você pode armazenar seus dados de qualquer lugar em sua própria caixa de armazenamento. Com o auxílio do aplicativo Nextcloud, você pode sincronizar arquivos, como vídeos e fotos, do seu celular para o Nextcloud.

## O que é o Jellyfin

É muito irritante pagar por diversos serviços de mídia sob demanda, como Netflix, Prime Video, Looke, entre outros. Mais irritante ainda quando o conteúdo que você queria assistir simplesmente desaparece da plataforma. Isso ocorre porque você tem acesso ao conteúdo enquanto paga por ele, mas não possui o conteúdo em si. Eles podem ser removidos do catálogo assim que o contrato de licença com o produtor termina.
Então, por que não ter seu próprio conteúdo e executar seu próprio servidor de mídia sob demanda? O Jellyfin resolve exatamente isso para você, organizando e disponibilizando conteúdo para você e seus amigos, se desejar.

## Configurando o Armazenamento

Tanto o Jellyfin quanto o Nextcloud armazenam e acessam arquivos. Poderíamos simplesmente criar pastas para eles, mas configurar o armazenamento adequadamente é melhor para garantir o backup dos dados. Com o **ZFS**, é bastante fácil criar os **datasets** necessários para cada serviço.

```bash
zfs create -o canmount=off -o mountpoint=none rpool/mnt
zfs create -o canmount=off -o mountpoint=none rpool/mnt/container-volumes
zfs create -o canmount=off -o mountpoint=none rpool/mnt/shares
zfs create -o mountpoint=/mnt/container-volumes/nextcloud rpool/mnt/container-volumes/nextcloud
zfs create -o mountpoint=/mnt/shares/media rpool/mnt/shares/media
```

## Ingress

Cada serviço utiliza sua própria porta **HTTP**. Como a ideia é tornar esses serviços disponíveis na Internet, o ideal é configurar um ingress. O ingress é um serviço **NGINX** que consolidará todos os serviços no protocolo **HTTPS** na porta **443**. É importante **ter um domínio FQDN** e **criar subdomínios** nele, assim como também é bom ter um **endereço IPv4 público**. Se você não tiver um domínio, pode comprar um para utilizá-lo, pois está bem acessível hoje em dia. Existem até opções gratuitas. Se você não tiver um **endereço IP disponível publicamente**, pode usar um **VPS** na Nuvem para atuar como proxy e ingress para você. A **Oracle**, por exemplo, oferece um **VPS gratuito vitalício** que [você pode conferir](https://www.oracle.com/br/cloud/compute/). Basta configurar uma **VPN Wireguard** e estabelecer uma conexão entre seu **VPS** e seu **Gateway**. Há um artigo sobre o **Wireguard** [neste link](/article/wireguard-vpn). Mais adiante, abordaremos o **Wireguard** neste servidor, mas para simplificar, este tutorial assumirá que você tem um **endereço IP disponível publicamente**.

### Configurar Subdomínios

No administrador do domínio que você possui, adicione duas entradas DNS para o seu **IPv4** (entrada A) com seu **endereço IP público** `nextcloud.example.com` e `jellyfin.example.com`, sendo `example.com` seu *FQDN*. Se você não possui um **IP fixo**, mas um IP que muda entre as conexões, pode usar o [CloudDNS](https://www.cloudns.net/), que oferece um **daemon** para atualizar automaticamente as entradas DNS ao **mudar o IP**.

### Rede Podman para Ingress

Assim como o **Nextcloud** e o **Jellyfin**, nosso **Ingress** viverá em um **Pod do Podman** (ou em um **VPS** no caso mencionado anteriormente). O **Ingress** precisa ser capaz de se comunicar com os pods do **Nextcloud** e **Jellyfin**. Então, vamos criar uma rede para eles.

```bash
podman network create \
  --driver bridge   \
  --gateway 10.90.1.1 \
  --subnet 10.90.1.0/24 \
  --ip-range 10.90.1.100/24  \
  ingress-net
```

Não esqueça de adicionar a nova rede ao `nftables.nft`.

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

### Pod de Ingress

É hora de criar nosso `ingress-pod`. Como ainda não há nenhum dos serviços em execução, este será apenas um espaço reservado para configurar o **Certificado SSL**.

#### 1. Crie uma pasta para atuar como volume de **conf**

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

#### 3. Crie o arquivo **ingress.yaml**

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

#### 4. Inicie o pode de **ingress** rodando o seguinte comando

```bash
podman kube play \
  /opt/podman/ingress/ingress.yaml \
  --replace --network ingress-net
```

Ao fazer isso, os volumes `ingress-www` e `certificates` serão usados para validar os **Certificados SSL**, que serão criados na próxima etapa.

### Let's Encrypt

O **Let's Encrypt** é um serviço gratuito que fornece **Certificados SSL**. Além disso, é um serviço muito fácil de usar. Para utilizá-lo, precisaremos criar um **pod** para ele.

#### 1. Crie um arquivo `yaml` com o seguinte conteúdo

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Clique para expandir <b>lets-encrypt.yaml</b>.</summary>

`/opt/podman/ingress/lets-encrypt.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: "2024-09-12T19:53:43Z"
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
      - your_email@gmail.com # Substitua pelo seu e-mail
      - -d
      - jellyfin.example.net # `example.net`sendo seu FQDN
      - -d
      - nextcloud.example.net # `example.net` sendo seu FQDN
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

#### 2. Rode o pod **lets-encrypt** com o seguinte comando

```bash
podman kube play \
  /opt/podman/ingress/lets-encrypt.yaml \
  --replace --network ingress-net
```

Ao executar este **pod**, o **Certificado SSL** será criado e armazenado no volume `certificate`. O volume `ingress-www` foi usado para validar o **Certificado SSL**. Com o certificado, vamos atualizar o pod de ingress para servir o tráfego **HTTPS** com este certificado.

O **pod lets-encrypt** será parado após a criação do **Certificado SSL**. Você precisará executar o **pod lets-encrypt** novamente de tempos em tempos para renovar o **Certificado SSL**.

O certificado será criado no volume `certificates`. Você pode verificar os logs do **pod lets-encrypt** com o seguinte comando:

```bash
podman pod logs lets-encrypt
```

Atualize o arquivo de configuração do **nginx** com o caminho do arquivo de certificado.

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

#### 3. Reinicie o pod do **ingress**

```bash
podman pod restart ingress
```

## Nextcloud

Agora que temos o **Ingress** pronto, podemos começar a criar o serviço **Nextcloud**.

Crie um caminho para colocar os arquivos de configuração do **Nextcloud**.

```bash
mkdir -p /opt/podman/nextcloud/
```

### Segredos

Precisaremos criar um **segredo** para o serviço **Nextcloud**. Este segredo será usado para armazenar a senha do banco de dados **Nextcloud**. O segredo será colocado em um arquivo `yaml` para ser implantado no **Podman**. Eu escrevi um script simples para criar o segredo para nós com uma senha aleatória de 32 dígitos. Você pode usá-lo para criar o segredo.

#### 1. Crie o arquivo de segredo

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Clique para expandir o arquivo <b>create_secret.sh</b>.</summary>
  

`/opt/podman/nextcloud/create_secret.sh`

```sh
#!/bin/bash

export MARIADB_ROOT_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"
export MYSQL_PASSWORD="$(< /dev/urandom tr -dc _A-Z-a-z-0-9 | head -c${1:-32};echo;)"

cat << EOF > secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: nextcloud-secret
data:
  mariadbRootPassword: $(echo -n ${MARIADB_ROOT_PASSWORD} | base64)
  mysqlPassword: $(echo -n ${MYSQL_PASSWORD} | base64)
EOF

echo "Arquivo de segredo criado com o nome secret.yaml"
```

```bash
chmod +x /opt/podman/nextcloud/create_secret.sh
cd /opt/podman/nextcloud
./create_secret.sh
```

```txt
Arquivo de segredo criado com o nome secret.yaml
```

</details> <!-- markdownlint-enable MD033 -->

#### 2. Implante o arquivo de segredo criado

```bash
podman kube play /opt/podman/nextcloud/secret.yaml
```

#### 3. Verifique se o segredo foi corretamente criado

Verifique se o segredo foi corretamente criado executando o seguinte comando:

```bash
podman secret list
```

```txt
ID                         NAME               DRIVER      CREATED             UPDATED
b22f3338bbdcec1ecd2044933  nextcloud-secret  file        About a minute ago  About a minute ago
```

#### 4. Delete o arquivo `secret.yaml`

Manter o arquivo de segredo pode ser uma falha de segurança. É uma boa prática excluir o arquivo de segredo após o deployment. Esteja ciente de que você não poderá recuperar seu conteúdo secreto no futuro.

```bash
rm -f /opt/podman/nextcloud/secret.yaml
```

### YAML para Nextcloud

O serviço **Nextcloud** será implantado no **Podman**. Para isso, precisaremos criar um arquivo `yaml` com o seguinte conteúdo:

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Clique para expandir o arquivo <b>nextcloud.yaml</b>.</summary>

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
  - name: mnt-container-volumes-nextcloud-html-host
    hostPath:
      path: /mnt/container-volumes/nextcloud/html
      type: Directory


  - name: nextcloud-db-pvc
    persistentVolumeClaim:
      claimName: nextcloud_db
```

</details> <!-- markdownlint-enable MD033 -->

Este arquivo `yaml` criará um serviço **Nextcloud** com um banco de dados **MariaDB**. Ele usará `/srv/nextcloud` como o diretório de dados do **Nextcloud**. Inicie o serviço **Nextcloud** com o seguinte comando:

```bash
mkdir -p /mnt/container-volumes/nextcloud/html/
podman kube play \
  /opt/podman/nextcloud/nextcloud.yaml \
  --replace --network ingress-net
```

## Jellyfin

Crie um diretório para manter os arquivos de configuração do **Jellyfin**.

```bash
mkdir -p /opt/podman/jellyfin
```

O serviço **Jellyfin** será implantado no **Podman**. Para isso, precisaremos criar um arquivo `yaml` com o seguinte conteúdo:

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Clique para expandir o arquivo <b>jellyfin.yaml</b>.</summary>

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

Este arquivo `yaml` criará um serviço **Jellyfin**. Inicie o serviço **Jellyfin** com o seguinte comando:

```bash
podman kube play \
  /opt/podman/jellyfin/jellyfin.yaml \
  --replace --network ingress-net
```

## Configurar Ingress

Nossos serviços estão em funcionamento no nosso Gateway e chegou a hora de configurar o nosso ingress para fazer o proxy das conexões de ingress de `nextcloud.example.com` e `jellyfin.example.com` para o **Pod** do `nextcloud` e o **Pod** do `jellyfin`, respectivamente.

### 1. Crie o arquivo de configuração do **Nextcloud**

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

- **`client_max_body_size`**: Esta diretiva define o tamanho máximo permitido para o corpo da requisição do cliente. Definimos para 10GB para permitir o upload de arquivos grandes.
- **`client_body_buffer_size`**: Esta diretiva define o tamanho do buffer para ler o corpo da requisição. Definimos para 400MB para permitir o upload de arquivos grandes.

### 2. Crie o arquivo de configuração do **Jellyfin**

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

### 3. Crie um arquivo de configuração para **unifi**

Como já temos o **Unifi Network Application** configurado no servidor, podemos criar um ingress para ele.

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

Você pode opcionalmente remover o `forward port` para `8443/tcp` do arquivo `yaml` do pod. Para isso, basta remover as seguintes linhas:

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
  # Remova as linhas abaixo:
  - containerPort: 8443
      hostPort: 8443
      hostIP: 10.1.1.1
      protocol: TCP
  ...
```

Refaça o deploy do pod `unifi-network` com o parâmetro `--network=ingress-net`:

```bash
podman kube play --replace /opt/podman/unifi-network/unifi-network.yaml --network ingress-net
```

### 4. Configure o resolver

Para que o **NGINX** acesse os serviços, é necessário configurar um resolver. Para isso, faça o seguinte:

1. Verifique a configuração do **gateway do ingress-net** digitando:

```bash
podman network inspect ingress-net \
  --format 'Gateway: {{ range .Subnets }}{{.Gateway}}{{end}}'
```

```txt
Gateway: 10.90.1.1
```
<!-- markdownlint-disable MD029 -->
2. Crie o resolver com o `Endereço IP` obtido:

`/opt/podman/ingress/conf/resolver.conf`

```conf
resolver 10.90.1.1 valid=30s;
```

### 5. Reinicie o **ingress**

Tudo está configurado. Reinicie o serviço **ingress**.

```bash
podman pod restart ingress
```

### 6. Configure o `Unbound` para resolver os nomes de host localmente

Meu domínio está configurado no **Cloudflare**. Para resolver os DNSs  locais, terei que recuperar as entradas DNS no **Clouflare** e acessar esses serviços via **IP público** pela **Internet**. Isso não é necessário, pois consigo resolver os endereços localmente. Para fazer isso, vamos atualizar a configuração do **Unbound** para resolver esses endereços localmente, editando o arquivo `local.conf`.

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

Reinicie Unbound:

```bash
podman kube play --replace /opt/podman/unbound/unbound.yaml
```

## Conclusão

Agora que nossos serviços estão em funcionamento, podemos acessá-los pelo nosso navegador. Podemos acessar o **Nextcloud** em `nextcloud.example.com` e o **Jellyfin** em `jellyfin.example.com`. Configure os serviços, crie contas e comece a usá-los.
No próximo post, vamos instalar **servidores de arquivos** e configurar a interface web **Cockpit** para gerenciar nossos serviços.
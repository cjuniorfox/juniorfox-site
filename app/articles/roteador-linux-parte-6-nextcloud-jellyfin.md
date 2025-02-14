---
title: "Roteador Linux DIY - Parte 6 - Nextcloud e Jellyfin"
articleId: "roteador-linux-parte-6-nextcloud-jellyfin"
date: "2024-11-05"
author: "Carlos Junior"
category: "Linux"
brief: "Na sexta parte desta série, instalaremos o Jellyfin, um servidor de mídia privado para uso doméstico, e o Nextcloud, uma solução de armazenamento em nuvem privada."
image: "/assets/images/diy-linux-router/nextcloud-jellyfin.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unbound", "podman", "docker"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-6-nextcloud-jellyfin"}]
---

Esta é a sexta parte de uma série de várias partes que descreve como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 3: [Usuários, Segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)
- Parte 7: [Compartilhamento de Arquivos](/article/roteador-linux-parte-7-compartilhamento-de-arquivos)
- Parte 8: [Backup](/article/roteador-linux-parte-8-backup)
- [Armazenamento Impermanente](/article/roteador-linux-armazenamento-impermanente)

## Índice

- [Introdução](#introdução)
  - [O que é o Nextcloud](#o-que-é-o-nextcloud)
  - [O que é o Jellyfin](#o-que-é-o-jellyfin)
- [Configurando o Armazenamento](#configurando-o-armazenamento)
  1. [Criando o Dataset para o Armazenamento do Nextcloud](#criando-o-dataset-para-o-armazenamento-do-nextcloud)
  2. [Criando Outro Dataset para Arquivos de Mídia](#criando-outro-dataset-para-arquivos-de-mídia)
- [Ingress](#ingress)
  1. [Configurando Subdomínios](#configurando-subdomínios)
  2. [Rede Podman para Ingress](#rede-podman-para-ingress)
  3. [Pod de Ingress](#pod-de-ingress)
  4. [Firewall](#firewall)
  5. [Let's Encrypt](#lets-encrypt)
- [Nextcloud](#nextcloud)
- [Jellyfin](#jellyfin)
- [Configurar Ingresses](#configurar-ingresses)
- [Conclusão](#conclusão)

---

## Introdução

Nas partes anteriores, instalamos o sistema operacional, configuramos a funcionalidade de internet do gateway usando PPPoE e configuramos o Firewall e o Unbound como servidores DNS.
Agora é hora de expandir as capacidades desta máquina adicionando serviços como o Nextcloud e o Jellyfin.

![Jellyfin, Nextcloud](/assets/images/diy-linux-router/nextcloud-jellyfin.webp)
*Jellyfin e Nextcloud*

### O que é o Nextcloud

Existem muitos serviços de nuvem para armazenamento de arquivos na internet. No entanto, eles tendem a ser caros se você precisar de espaço de armazenamento, e há preocupações com a privacidade, como o uso do conteúdo armazenado para publicidade, por exemplo. Como o Nextcloud é uma solução de nuvem privada, você pode armazenar seus dados em qualquer lugar no seu armazenamento. Com o auxílio do aplicativo Nextcloud, você pode sincronizar arquivos, como vídeos e fotos, do seu celular para o Nextcloud.

### O que é o Jellyfin

Existem muitos serviços de streaming de mídia sob demanda, como Netflix, Prime Video, Looke e assim por diante. Isso significa que há muitas contas para pagar. Há também a questão de algum conteúdo que você queria assistir desaparecer da plataforma. Isso ocorre porque você tem acesso ao conteúdo enquanto paga por ele, mas não é o proprietário do conteúdo em si. Eles podem ser removidos do catálogo quando o contrato de licença com o produtor termina.
Então, por que não ter seu próprio conteúdo e rodar seu próprio servidor de mídia sob demanda? O Jellyfin faz exatamente isso para você.

---

## Configurando o Armazenamento

Tanto o **Jellyfin** quanto o **Nextcloud** armazenam e acessam arquivos. Poderíamos criar pastas para eles, mas é melhor configurar o armazenamento corretamente para fazer backup dos dados de forma adequada. O **ZFS** facilitou bastante a criação dos **Datasets** pretendidos para cada um deles.

Execute com `sudo`:

Supondo que o nome do pool de armazenamento de dados seja `zdata`.

```bash
ZDATA=zdata
```

### Criando o Dataset para o Armazenamento do Nextcloud

```bash
zfs create ${ZDATA}/containers/podman/storage/volumes/nextcloud-html
zfs create ${ZDATA}/containers/podman/storage/volumes/nextcloud-db
chown -R podman:podman /mnt/${ZDATA}/containers/podman/storage/volumes/nextcloud-*
```

### Criando Outro Dataset para Arquivos de Mídia

```bash
zfs create -o canmount=off -o mountpoint=/srv ${ZDATA}/srv
zfs create ${ZDATA}/srv/media
```

---

## Ingress

Cada serviço roda em sua própria porta **HTTP**. Para disponibilizar esses serviços na Internet, o ideal é configurar um **Serviço de Ingress**. O Ingress é um proxy reverso **NGINX** para consolidar todos os serviços no protocolo **HTTPS** na porta **443**. Se você quiser disponibilizar esses serviços na Internet, precisa ter um **domínio FQDN** e **criar subdomínios** nele, já que ter um **endereço IPv4 público** também é bom. Então, se você não tem um domínio, precisa comprar um para usá-lo. Está bem barato atualmente. Existem até opções gratuitas. Se você não tem um **endereço IP publicamente disponível**, pode usar um **VPS** na nuvem para atuar como um proxy e se conectar a você. A **Oracle**, por exemplo, oferece um **VPS gratuito vitalício** que [você pode conferir](https://www.oracle.com/br/cloud/compute/), para configurar uma VPN **Wireguard** e configurar uma conexão entre seu **VPS** e seu **Gateway**. Há um artigo aqui sobre [Wireguard](/articles/wireguard-vpn)

### Configurando Subdomínios

No painel de administração do domínio, você deve adicionar duas entradas DNS para seu **IPv4** (entrada A) com seu **endereço IP público**. O `nextcloud.exemplo.com` e o `jellyfin.exemplo.com`, sendo `exemplo.com` seu *FDQN*. Se você não tem um **IP fixo**, mas sim um IP que muda entre conexões, pode usar o [CloudDNS](https://www.cloudns.net/) que oferece um **daemon** para atualizar as entradas DNS dinamicamente quando o **IP mudar**.

### Rede Podman para Ingress

Assim como o **Nextcloud** e o **Jellyfin**, nosso **Ingress** viverá em um **Pod do Podman**. O **Ingress** precisa ser capaz de se comunicar com os pods do **Nextcloud** e do **Jellyfin**. Então, vamos criar uma rede para eles.

Execute como usuário `podman`:

```bash
podman network create ingress-net
```

---

### Pod de Ingress

Configuração para o pod **NGINX** do Podman atuar como nosso serviço de **Ingress**.

1. **Crie o volume `ingress-conf`**:

```bash
podman volume create ingress-conf
```

2. **Crie uma configuração básica para o NGINX**: `/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/default_server.conf`

```conf
server {
    listen 80 default_server;
    server_name _;

    location ~ /.well-known/acme-challenge/ {
      root /var/www/;
    }
}
```

3. **Crie o arquivo de implantação do ingress**: `/home/podman/deployments/ingress.yaml`

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

4. **Inicie o Pod de Ingress**:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/ingress.yaml 
```

5. **Habilite seu arquivo de serviço `systemd`**:

```bash
systemctl --user enable podman-pod@ingress.service --now
```

O pod Ingress cria volumes adicionais, como `ingress-www` e `certificates`, que serão usados para validar os **Certificados SSL**, a serem criados no próximo passo. Você pode verificar sua criação executando `podman volume list`.

---

### Firewall

Como o pod Ingress é executado sem privilégios de root, ele não pode abrir portas abaixo de `1024`. Como `HTTP` e `HTTPS` estão abaixo desse valor, o serviço de ingress será configurado para abrir as portas `1080` e `1443`, e redirecionar o tráfego de entrada das portas `80` e `443` para `1080` e `1443`, respectivamente.

Adicione essas cadeias e regras para o Ingress conforme necessário.

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

#### Reconstruir a configuração do NixOS

```bash
nixos-rebuild switch
```

### Let's Encrypt

O **Let's Encrypt** é um serviço gratuito que fornece **Certificados SSL**. Ele utiliza uma ferramenta chamada **certbot** para renovar nossos certificados.

Esses certificados expiram em um curto período. Portanto, ter uma unidade systemd para renovar o serviço mensalmente impede que seus domínios tenham seus certificados expirados. Substitua a lista `DOMAINS` pelos seus domínios, e `EMAIL` pelo seu endereço de e-mail.

1. **Crie a unidade `systemd`**: `/home/podman/.config/systemd/user/certbot.service`

```ini
Description=Renovação do Lets encrypt com Certbot
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

2. **Crie uma unidade `timer`**: `/home/podman/.config/systemd/user/certbot.timer`

Este timer irá disparar o evento de renovação uma vez por mês.

```ini
[Unit]
Description=Renovar certificados usando certbot mensalmente.

[Timer]
OnCalendar=monthly
Persistent=true

[Install]
WantedBy=timers.target
```

3. **Habilite e inicie** o `certbot.service`: 

Verifique os logs para ver se o registro foi bem-sucedido.

```bash
systemctl --user daemon-reload
systemctl --user enable certbot.timer
systemctl --user start certbot.service
journalctl --user -eu certbot.service
```

```txt
...
Certificado recebido com sucesso.
O certificado está salvo em: /etc/letsencrypt/live/example.com/fullchain.pem
A chave está salva em:         /etc/letsencrypt/live/example.com/privkey.pem
Este certificado expira em 2025-02-10.
PRÓXIMOS PASSOS:
- O certificado precisará ser renovado antes de expirar. O Certbot pode renovar automaticamente o certificado em segundo plano, mas você pode precisar tomar medidas para habilitar essa funcionalidade. Veja https://certbot.org/renewal-setup para instruções.
```

4. **Atualize a configuração do Ingress**:

Use o caminho de configuração fornecido pela saída do serviço `certbot`.

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

5. **Reinicie o pod `ingress`**:

```bash
systemctl --user restart podman-pod@ingress.service
```

---

## Nextcloud

Agora que temos o **Ingress** pronto, podemos começar a criar o serviço **Nextcloud**.

### Segredos

Crie um **segredo** para o serviço **Nextcloud**. Este segredo será usado para armazenar a senha do banco de dados do **Nextcloud**. Utilize o mesmo script que fizemos para o Unifi Network anteriormente.

1. **Crie o arquivo de segredos**:

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

echo "Arquivo de segredo criado com o nome nextcloud-secret.yaml"
```

2. **Implante o arquivo de segredos criado**:

```bash
podman kube play /home/podman/deployments/nextcloud-secret.yaml
```

3. **Verifique o segredo recém-criado**:

```bash
podman secret list
```

```txt
ID                         NAME               DRIVER      CREATED             UPDATED
b22f3338bbdcec1ecd2044933  nextcloud-secret   file        Há um minuto atrás  Há um minuto atrás
```

4. **Exclua o arquivo `secret.yaml`**:

É uma boa prática excluir o arquivo de segredo após a implantação. Esteja ciente de que você não poderá recuperar seu conteúdo no futuro.

```bash
rm -f /home/podman/deployments/nextcloud-secret.yaml
```

### YAML para o Nextcloud

Crie o arquivo `yaml` para implantar o **Nextcloud** no **Podman**

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

Este arquivo `yaml` criará um serviço **Nextcloud** com um banco de dados **MariaDB**.

Os **volumes** `nextcloud-data` e `nextcloud-html` são colocados nos datasets criados no início deste artigo.

### Iniciar o Pod do Nextcloud

Como fizemos para o Ingress, inicie o pod com o seguinte comando:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/nextcloud.yaml 
```

Habilite o serviço `systemd` do **Nextcloud**:

```bash
systemctl --user enable --now podman-pod@nextcloud.service
```

---

Certainly! Here's the translation of the last part of your article into Brazilian Portuguese:

---

## Jellyfin

Crie o arquivo `jellyfin.yaml` com o seguinte conteúdo:

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

Inicie o Pod do **JellyFin** e habilite seu serviço `systemd`:

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/jellyfin.yaml 
```

Habilite o serviço `systemd`:

```bash
systemctl --user enable --now podman-pod@jellyfin.service
```

---

## Configurar Ingresses

Nossos serviços estão em execução. Vamos configurar os Ingresses para os seguintes subdomínios:

- **Nextcloud**: `nextcloud.example.com`.
- **Jellyfin**: `jellyfin.example.com`.

### 1. Crie o arquivo de configuração do **Nextcloud**

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

- **`client_max_body_size`**: Esta diretiva define o tamanho máximo permitido do corpo da requisição do cliente. Definimos como 10GB para permitir o upload de arquivos grandes.
- **`client_body_buffer_size`**: Esta diretiva define o tamanho do buffer para leitura do corpo da requisição. Definimos como 400MB para permitir o upload de arquivos grandes.

### 2. Crie o arquivo de configuração do **Jellyfin**

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

### 3. Crie um arquivo de configuração para o Unifi Network

Como já temos o **Unifi Network Application** configurado no servidor, podemos criar um Ingress para ele.

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

Você pode opcionalmente remover a `porta de encaminhamento` para `8443/tcp` do arquivo `yaml` do pod. Para fazer isso, basta remover as seguintes linhas:

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
  # Remova estas linhas:
  - containerPort: 8443
      hostPort: 8443
      protocol: TCP
  ...
```

Reimplante o **Unifi Network Application** adicionando-o à rede `ingress-net` como fizemos com os outros Pods.

`/home/podman/.config/systemd/user/podman-unifi.service`

```bash
podman kube play --log-level info --network ingress-net --replace /home/podman/deployments/unifi.yaml 
```

### 4. Configure o resolvedor

Para que o **NGINX** alcance os serviços, é necessário configurar um resolvedor. Para fazer isso, siga os passos abaixo:

1. Verifique a configuração do gateway da **ingress-net** digitando:

```bash
podman network inspect ingress-net \
  --format 'Gateway: {{ range .Subnets }}{{.Gateway}}{{end}}'
```

```txt
Gateway: 10.89.1.1
```
<!-- markdownlint-disable MD029 -->
2. Crie o resolvedor com o `Endereço IP` obtido:

`/mnt/zdata/containers/podman/storage/volumes/ingress-conf/_data/resolver.conf`

```conf
resolver 10.89.1.1 valid=30s;
```

### 6. Configure o Unbound para resolver os nomes de host localmente

Meu domínio está configurado no **Cloudflare**. Para resolver meus DNS locais, eu precisaria recuperar as entradas DNS do **Cloudflare** e acessar esses serviços via meu **IP Público** pela Internet. Isso não é necessário, pois posso resolver os endereços localmente. Para fazer isso, vamos atualizar a configuração do **Unbound** para resolver esses endereços localmente editando o `local.conf`

`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

```conf
server:
  ...
  # Adicione as linhas abaixo. Deixe o restante como está.
  local-data: "unifi.example.com. IN A 10.1.78.1"
  local-data: "nextcloud.example.com. IN A 10.1.78.1"
  local-data: "jellyfin.example.com. IN A 10.1.78.1"
```

Reinicie o Ingress:

```bash
systemctl --user restart podman-pod@ingress.service
```

## Conclusão

Agora que temos nossos serviços em execução, podemos acessá-los a partir do nosso navegador. Podemos acessar o **Nextcloud** em `nextcloud.example.com` e o **Jellyfin** em `jellyfin.example.com`. Configure os serviços, crie contas e comece a usá-los.
No próximo post, instalaremos **Servidores de Arquivos** e configuraremos a interface web do **Cockpit** para gerenciar nossos serviços.

---
title: "Roteador Linux - Part 5 - Wifi"
articleId: "roteador-linux-parte-5-wifi"
date: "2024-11-05"
author: "Carlos Junior"
category: "Linux"
brief: "Na quinta parte, configuraremos a Wifi com utilizando o Unifi AP 6 do Ubiquiti."
image: "/assets/images/diy-linux-router/unifi-c6-lite.webp"
keywords : ["macmini","roteador", "linux", "nixos", "ubuquiti", "unifi", "podman", "docker"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-5-wifi"}]
---

Esta é a quinta parte de uma série multipartes que descreve como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 3: [Usuários, Segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)
- Parte 4: [Podman e Unbound](/article/roteador-linux-parte-4-podman-unbound)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)

Nosso Mac Mini já funciona como um roteador muito funcional e confiável, mas ainda não temos Wi-Fi. Vamos configurar nossa rede sem fio utilizando o Unifi AP 6 neste capítulo.

![Logo Unifi de Stephen Herber como um prato de jantar](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Post antigo de Stephen Herber sobre [Linux DIY como roteador: Link arquivado na web](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

- [Introdução](#introdução)
- [Conexão Física](#conexão-física)
- [Configuração do Pod](#configuração-do-pod)
  1. [Criar o arquivo unifi-secret.yaml](#criar-o-arquivo-unifi-secretyaml)
  2. [Escrever o arquivo de pod `unifi.yaml`](#escrever-o-arquivo-de-pod-unifiyaml)
  3. [Iniciar o Pod e habilitar o serviço no Systemd](#iniciar-o-pod-e-habilitar-o-serviço-no-systemd)
  4. [Configurar o Unbound para resolver o nome `unifi`](#configurar-o-unbound-para-resolver-o-nome-unifi)
- [Firewall](#firewall)
  1. [Portas do serviço ao Unbound](#portas-do-serviço-do-unbound)
- [Configuração](#configuração)
  1. [Adoção de Dispositivos](#adoção-de-dispositivos)
  2. [Solucionando Problemas de Adoção](#solucionando-problemas-de-adoção)
  3. [Adoção Manual](#adoção-manual)
- [Conclusão](#conclusão)

---

## Introdução  

Este **Mac mini**, como muitas máquinas, possui uma interface sem fio integrada que pode ser usada para criar a rede sem fio desejada. No entanto, na maioria dos casos, a placa é pouco confiável e, com desempenho insatisfatório e baixas velocidades, não vale a pena utilizá-la. Com isso em mente, optei por seguir uma abordagem diferente. Um **Access Point** adequado, fornecido pela **Unifi**, é confiável, econômico e fácil de usar e configurar.  

---

## Conexão Física  

Conforme mencionado na [parte 2](/articles/roteador-linux-parte-2-rede-e-internet), o **Unifi AP** deve ser conectado à **Porta 3** do **Switch**, pois esta porta já foi configurada para as **VLANs** desejadas.  

Lembre-se de instalar o **injetor PoE** que alimentará o **AP**. Verifique se os LEDs acendem para confirmar que tudo está funcionando.  

```txt
            ┌─────► AP Unifi U6 Lite   
            │   
┌───────────┴───────────────────────┐    
| ┌───┬───┬───┬───┬───┬───┬───┬───┐ |
| │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ |
| └───┴───┴───┴───┴───┴───┴───┴───┘ |
└───────────┬───────────────────────┘
            │  
            └─────► VLAN 1 sem tag, VLANs 30 e 90 com tag
```  

---

## Configuração do Pod  

Para gerenciar este **AP**, precisamos instalar o **Unifi Network Application**. Há uma **Imagem Docker** fornecida por [LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/) que atende a esse propósito. Vamos criar um pod com essa imagem.  

Execute todos os comandos como o usuário `podman`:  

```bash
ssh router-podman
```  

### Criar o arquivo `unifi-secret.yaml`  

O **Unifi Network Application** utiliza um **Banco de Dados MongoDB** para persistir informações, o que exige a configuração de **usuários** e **senhas**. Poderíamos criar uma senha genérica em texto simples, mas isso representa um risco de segurança. É melhor usar uma senha complexa e armazená-la de forma segura. O **Podman** fornece um recurso chamado `secrets repository`. Criei um script simples que gera senhas aleatórias e, em seguida, cria o arquivo `unifi-secret.yaml` para implantação.  

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

echo "Arquivo de segredo criado com o nome unifi-secret.yaml"
```  

Este script cria o arquivo `unifi-secret.yaml` no diretório atual. Faça a implantação no `podman`:  

```bash
podman kube play /home/podman/deployments/unifi-secret.yaml
```  

Se tudo funcionar conforme o esperado, você terá implantado um novo segredo no `podman`. Você pode verificá-lo com:  

```bash
podman secret list
```  

```txt
ID                         NAME                  DRIVER      CREATED        UPDATED
8aca9476dd8846f979b3f9054  unifi-secret          file        8 seconds ago  8 seconds ago
```  

Após implantar este segredo, é uma boa prática excluir o arquivo `secret.yaml`. Esteja ciente de que, ao fazer isso, você não poderá excluir e recriar este segredo usando a mesma senha criada anteriormente.  

```bash
rm /home/podman/deployments/unifi-secret.yaml
```  

### Escrever o arquivo de pod `unifi.yaml`  

Este arquivo `yaml` destina-se a implantar a aplicação no **Podman**. Como o Podman oferece suporte para arquivos no estilo Kubernetes, vamos criar o arquivo dessa forma.  

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
  # Aplicação
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

  # MongoDB
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

### Iniciar o Pod e habilitar o serviço no Systemd  

Inicie o pod e verifique se está funcionando corretamente:  

```bash
podman --log-level info kube play --replace /home/podman/deployments/unifi.yaml
```  

Habilite o serviço para o pod no `systemd`:  

```bash
systemctl --user enable --now podman-pod@unifi.service
```  

### Configurar o Unbound para resolver o nome `unifi`  

Esses dispositivos da Unifi são projetados para se comunicar com máquinas da fabricante como o Dream Machine ou o Cloud Gateway, e fazem isso procurando o host `unifi` na rede. Se não encontram, o dispositivo reverte à operação stand alone, que é bastante limitada.  

Portanto, para permitir que o **AP** seja adotado, adicione a entrada `unifi` no arquivo de configuração do Unbound `local.conf`.  

`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`  

```conf
server:
  private-domain: "home.example.com."
  local-zone: "home.example.com." static
  local-data: "macmini.home.example.com. IN A 10.1.78.1"
  local-data: "macmini.home.example.com. IN A 10.30.17.1"
  local-data: "macmini.home.example.com. IN A 10.90.85.1"
  local-data: "unifi.home.example.com. IN A 10.1.78.1"
  local-data: "unifi. IN A 10.1.78.1"
```

---

### Firewall

Para tornar o **Unifi Network** disponível para a rede, é necessário abrir as portas no firewall. Como todas as portas estão acima de `1024`, basta liberá-las. As portas são:

- **3478/UDP** - Porta STUN do Unifi.  
- **10001/UDP** - Porta de descoberta do Unifi.  
- **8080/TCP** - Porta HTTP para comunicação entre dispositivos Unifi.  
- **8443/TCP** - Porta HTTPS Web. Será aberta apenas temporariamente.  

### Portas do serviço do Unbound

Edite o arquivo `services.nft` para adicionar a chain do serviço `unifi_network_input`. É necessário alternar do usuário `podman` para o usuário `admin` e realizar as alterações no firewall com `sudo`:

`/etc/nixos/nftables/services.nft`

```conf
  ...
  chain unifi_network_input {
    udp dport 3478 ct state { new, established } counter accept comment "Unifi STUN"
    udp dport 10001 ct state { new, established } counter accept comment "Descoberta Unifi"
    tcp dport 8080 ct state { new, established } counter accept comment "Comunicação Unifi"
  }  
  ...
```

Adicione a chain do serviço `unifi_network_input` à zona **LAN**.

`/etc/nixos/nftables/zones.nft`

```conf
chain LAN_INPUT {
    ...
    jump unifi_network_input   
  }
```

Reconstrua o **NixOS**:

```bash
nixos-rebuild switch
```

---

## Configuração

1. Acesse a **Unifi Network Application** no **navegador** em [10.1.78.1:8443](https://10.1.78.1:8443). Porteriormente, colocaremos esse painel web por traz de um proxy **NGINX**.  
2. Defina o `Nome do Servidor` e o `País`.  
3. Configure seu **usuário** e **senha**. Você pode criar uma conta em [account.ui.com](https://account.ui.com/) ou criar uma conta localmente.  

### Adoção de Dispositivos

O **Unifi Network** precisa adotar seu **Unifi AP**. É esperado que, com tudo o que configuramos, novos dispositivos Unifi sejam automaticamente adotados pelo aplicativo.

### Solucionando Problemas de Adoção

Se houver problemas na adoção do AP, siga as instruções abaixo:

Altere o **Inform IP Address**. Isso pode ser feito acessando **Configurações** > **Sistema** > **Avançado** e configurando o **Inform Host** para **hostname**, como `macmini`, ou como o **endereço IP** `10.1.78.1`. Além disso, marque a checkbox **"Override"** para que os dispositivos possam se conectar ao controlador durante a adoção. Informações mais detalhadas na [documentação do LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).  

Se mesmo assim enfrentar dificuldades com a adoção automática, verifique se as configurações estão corretas:

- As portas `8080/tcp` e `3478/udp` estão abertas e acessíveis.  
- O **inform host** mencionado [acima](#adoção-de-dispositivos) foi alterado.  

### Adoção Manual

Se todos os ajustes não fizeram seu dispositivo **Unifi** ser adotado, talvez o dispositivo tenha sido adotado por outro painel Unifi e precise ser adotado manualmente. Você pode fazer isso seguindo os passos abaixo:

```bash
ssh ubnt@$AP-IP
set-inform http://10.1.78.1:8080/inform
```

O usuário e senha padrão são `ubnt`. Se o dispositivo tiver sido adotado anteriormente, verifique no painel anterior as credenciais definidas em **Configurações** > **Sistema** > **Avançado**. Geralmente, o `usuário` e a `senha` são os da conta **Unifi**. É importante mencionar que, sempre que você quiser substituir seu Unifi Network Application, é uma boa prática remover seus dispositivos antes de desativar o painel anterior. Fazer backups de sua configuração também é uma boa medida para evitar problemas ao readotar dispositivos—mais detalhes na [documentação do LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).

---

## Conclusão

Se você chegou até aqui, configurou com sucesso as principais funcionalidades do seu **roteador Linux** e pode usá-lo como sua principal conexão de internet para sua casa. No próximo capítulo, configuraremos outros serviços, como o **Jellyfin**, uma solução de streaming privado, e o **Nextcloud**, uma solução de nuvem privada.

- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)

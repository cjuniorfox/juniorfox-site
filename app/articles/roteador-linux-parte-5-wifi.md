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

Já temos um roteador de internet funcional e confiável, mas ainda não configuramos nossa rede **Wifi** e este capítulo enderecerá isso.

![Stephen Herber's Unifi Logo as a dinner plate](/assets/images/diy-linux-router/unifi-c6-lite.webp)
*Stephen Herber's old blogpost about [DIY Linux as a router: Web archived link](https://web.archive.org/web/20240203171515/https://www.sherbers.de/diy-linux-router-part-7-wifi/)*

- [Introdução](introdução)
- [Conexão Física](#conexão-física)
- [Configuração do Pod](#configuração-do-pod)
- [Configuração](#configuração)
  - [Adoção do dispositivo](#adoção-do-dispositivo)
  - [Resolvendo problemas com adoção](#resolvendo-problemas-com-adoção)
  - [Adoção manual](#adoção-manual)
- [Conclusão](#conclusão)

## Introdução

O **Mac mini**, assim como muitos computadores, possui uma interface de rede sem fio embutida que poderia ser utilizada para criar a nossa rede sem fio, mas na maioria dos casos, essas placas de rede sem fio não são lá muito confiáveis oferecendo uma péssima performance e baixa velocidade. Não vale a pena usa-las. Pensando nisso, escolhi uma abordagem diferente que é usar um **Access Point** dedicado e esses produzidos pela **Unifi** são extremamente confiáveis, com um bom custo-benefício e fácil de usar e configurar.

## Conexão física

Como mencionado na [parte 2](/articles/roteador-linux-parte-2-rede-e-internet), o **Access Point** da **Unifi** precisa ser conectado a **porta 3** do **switch**, já que esta porta foi configurada para operar nas **VLANs** esperadas.

Não se esqueça de instalar a **Fonte de alimentação PoE** para suprir energia para o **AP**. Verifique se tudo foi corretamente conectado checando se os LEDs se iluminam.

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

## Configuração do Pod

Para gerenciar esse **AP** precisamos instalar o **Unifi Network Application**. Existe uma **Imagem Docker** disponibilizada pela [LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/) que atende nossa necessidade. Vamos então configurar um Pod com ela.

Execute todos os comandos como `sudo`:

```bash
sudo -i
```

### 1 . Crie os diretórios para este Pod

Crie um diretório para armazenar todos os arquivos a serem utilizados pelo pod:

```bash
mkdir -p /opt/podman/unifi-network
```

### 2. Crie o arquivo `secrets.yaml`

O **Unifi Network Application** utiliza o **Banco de dados MongoDB** para persistir dados, o que demanda configurar **usuários** e **senhas**. Poderíamos criar uma senha genérica em texto puro, mas isso é um risco à segurança. É muito melhor usar uma senha complexa e armazena-la de forma segura. **Podman** oferece uma funcionalidade para isso, o **repositório `secret`*. Desenvolvi um script simples que gera as senhas desejadas de forma aleatória e cria o arquivo `secret.yaml` com as mesmas para deploy.

Crie um arquivo `sh` com o seguinte:

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

echo "Secret file created with the name secrets.yaml"
```

Atribua ao script a flag de execução (`-x`) e o rode:

```bash
chmod +x /opt/podman/unifi-network/create_secret.sh
cd /opt/podman/unifi-network/
./create_secret.sh
```

Um arquivo chamado `secret.yaml` será criado no diretório que você está. Faça seu deploy no `podman`:

```bash
podman kube play /opt/podman/unifi-network/secret.yaml
```

Se tudo funcionou conforme esperado, Teremos realizado o deploy de um segredo novo no `podman`. Pode checar com o seguinte comando:

```bash
podman secret list
```

```txt
ID                         NAME                  DRIVER      CREATED        UPDATED
8aca9476dd8846f979b3f9054  unifi-network-secret  file        8 seconds ago  8 seconds ago
```

### 3. Crie o arquivo `unifi-network.yaml` para deploy do pod

Como o **Podman** é capaz de implantar à partir de arquivos de deploy do **Kubernetes**, criaremos um arquivo de deploy nesse padrão para o **Unifi Network Application**.

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

#### 4. Faça o deploy do `unifi-network-application-pod`

O deploy do **Unifi Network Application** pode ser feito rodando o seguinte comando:

```bash
podman kube play --replace /opt/podman/unifi-network/unifi-network.yaml
```

## Configuração

1. Acesse o **Unifi Network Application** no **Navegador Web** em [10.1.1.1:8443](https://10.1.1.1:8443). Futuramente colocaremos seu acesso por trás de um proxy **NGINX**.
2. Configure seu `Server Name` (Nome do servidor) e `Country` (País).
3. Configure seu **username** e **senha**. Você pode criar uma conta em [account.ui.com](https://account.ui.com/) ou criar uma conta local.

### Adoção do dispositivo

O **Unifi Network** precisa adotar seu **Unifi AP**. Como a aplicação está em execução pelo **Podman** utilizando um **Endereço IP** inacessível à outros dispositivos, é preciso alterar a opção **Inform IP Address**. Esse é feito indo em: **Settings** > **System** > **Advanced** e configurando **Inform Host** com o **hostname**, no nosso caso `macmini` ou o **Endereço IP** `10.1.1.1`. Precisa-se também marcar a caixa de seleção **Override**. Dessa forma, os dispositivos **Unifi** serão capazes de se conectar ao controlador para adoção. Maiores detalhes na documentação disponibilizada pelo [LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).

### Resolvendo problemas com adoção

Se estiver tendo problemas com a adoção automática, você pode checar novamente se as configurações esperadas estão corretas para funcionar corretamente:

- As portas `8080/tcp` e `3478/udp` estarem abertas e acessíveis;
- Alterado o **inform host** conforme mecionado [acima](#adoção-do-dispositivo);

### Adoção manual

Se todos os ajustes realizados não fizeram seu dispositivo **Unifi** ser adotado, talvez seu dispositivo já tenha sido adotado por outro painel e precisa ser adotado manualmente. É possível faze-lo conforme abaixo:

```bash
ssh ubnt@$AP-IP
set-inform http://10.1.1.1:8080/inform
```

Verifique o endereço IP do **AP** no arquivo do `servidor DHCP` em `/var/lib/kea/dhcp4.leases`.

O nome de usuário e a senha padrão são `ubnt`. Se o dispositivo já foi adotado anteriormente, verifique no painel anterior qual é o `nome de usuário` e `senha` configurados em **Configurações** > **Sistema** > **Avançado**. Geralmente, o `nome de usuário` e a `senha` são os da **conta Unifi**. Vale mencionar que, sempre que você quiser substituir seu **Network Application**, remover seus dispositivos do mesmo antes de desativar a aplicação. Fazer backups de sua configuração também é uma boa medida para evitar dores de cabeça ao readotar dispositivos. Mais detalhes na [documentação LinuxServer.io](https://docs.linuxserver.io/images/docker-unifi-network-application/#device-adoption).

## Conclusão

Se você chegou até aqui, você configurou com sucesso as principais funcionalidades do seu **Roteador Linux** e você pode utiliza-lo como o principal ponto de acesso a internet da sua casa. No próximo capítulo, configuraremos outros serviços como o **Jellyfin**, um serviço privado de streaming e o **Nextcloud**, uma solução privada de armazenamento em nuvem.

- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)

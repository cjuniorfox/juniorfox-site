---
title: "Roteador Linux - Parte 4 - Podman e Unbound"
articleId: "roteador-linux-parte-4-podman-unbound"
date: "2024-10-15"
author: "Carlos Junior"
category: "Linux"
brief: "Nesta quarta parte da série, instalaremos o Podman, um substituto direto para o Docker com alguns recursos interessantes, e configuraremos o Unbound para rodar nele."
image: "/assets/images/diy-linux-router/seal-pod-and-rope.webp"
keywords : ["macmini","roteador", "linux", "nixos", "pppoe", "unbound", "podman", "docker"]
lang : "pt"
other-langs : [{"lang":"en","article":"diy-linux-router-part-4-podman-unbound"}]
---

Esta é a quarta parte de uma série multipartes que descreve como construir seu próprio roteador Linux.

- Parte 1: [Configuração Inicial](/article/roteador-linux-parte-1-configuracao-inicial)
- Parte 2: [Rede e Internet](/article/roteador-linux-parte-2-rede-e-internet)
- Parte 3: [Usuários, Segurança e Firewall](/article/roteador-linux-parte-3-usuarios-seguranca-firewall)

Nos artigos anteriores, instalamos o sistema operacional, configuramos o **Mac Mini** como Gateway de internet usando **PPPoE** e realizamos ajustes de segurança configurando os métodos de autenticação e o firewall.

Agora, instalaremos o **Podman**, um substituto direto para o **Docker** com alguns recursos interessantes, e configuraremos o **Unbound** para rodar nele.

![Foca em frente a uma corda](/assets/images/diy-linux-router/seal-pod-and-rope.webp)
*Imagem gerada por IA do [Gemini do Google](https://gemini.google.com/)*

## Índice

- [Sobre o Podman](#sobre-o-podman)
  - [Por que Podman em vez de Docker?](#por-que-podman-em-vez-de-docker)
- [Sobre o Unbound](#sobre-o-unbound)
- [Configuração do Podman](#configuração-do-podman)
- [Regras de Firewall](#regras-de-firewall)
- [Atualizar configuração de DHCP](#autalizar-configuração-de-dhcp)
- [Conclusão](#conclusão)

## Sobre o Podman

Como o **NixOS** é configurado usando arquivos `.nix`, pode parecer simples instalar os serviços necessários diretamente, sem a necessidade de containerização. Em muitos casos, essa abordagem faz sentido, já que a sobrecarga e a complexidade da containerização podem não ser justificadas. No entanto, considerando o vasto número de imagens **Docker** pré-configuradas disponíveis que atendem às nossas necessidades, não vejo motivos para não aproveitar dessas imagens usando o **Podman**.

### Por que Podman em vez de Docker?

Existem várias vantagens em usar o **Podman** em vez do **Docker**. Embora este tópico mereça um artigo próprio, aqui estão alguns pontos relevantes:

1. **Arquitetura sem Daemon**: O Podman não requer um daemon central para executar containers. Cada container é executado como um processo filho do comando Podman, melhorando a segurança e reduzindo o risco de um ponto único de falha.
2. **Containers sem Root**: O Podman permite que containers sejam executados sem exigir privilégios de root, aumentando a segurança.
3. **Compatibilidade com Kubernetes**: O Podman pode gerar arquivos YAML do Kubernetes diretamente a partir de containers ou pods em execução, facilitando a transição do desenvolvimento local para ambientes Kubernetes.
4. **CLI Compatível com Docker**: A maioria dos comandos Docker pode ser usada com o Podman sem modificação, tornando a transição do Docker para o Podman tranquila.

## Sobre o Unbound?

O **Unbound** é um **servidor DNS** que armazena em cache consultas DNS em um repositório local, otimizando a resolução de DNS, reduzindo o tráfego e aumentando ligeiramente a velocidade da internet. Além disso, com alguns scripts, o **Unbound** pode operar como um bloqueador de anúncios através do bloqueio desses hosts.

Para este projeto, usarei uma imagem Docker do **Unbound** que criei há algum tempo: [cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Nesta há três funcionalidades relevantes:

- Resolução de nomes DNS.
- Bloqueio de anúncios aplicando a lista [StevenBlack/hosts](https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts) diariamente.
- Resolução de nomes para a rede local, recuperando nomes de host do **Servidor DHCP** e atribuindo-os aos endereços do nameserver do **Unbound**.

## Configuração do Podman

Vamos começar instalando o **Podman** em nosso sistema **NixOS**.

### 1. Atualizar o arquivo de configuração do NixOS

*Nota: Atualize apenas as partes relevantes do arquivo. Não substitua o arquivo inteiro pelo conteúdo abaixo.*

Edite o arquivo `/etc/nixos/configuration.nix`:

```nix
{ config, pkgs, ... }:
{
  ...
  boot = {
    kernelParams = [ "systemd.unified_cgroup_hierarchy=1" ];
    ...
  };
  ...
  imports = [
    ...
    ./modules/podman.nix
  ]
}
```

Crie o arquivo `modules/podman.nix`

`/etc/nixos/modules/podman.nix`

```nix
{ pkgs, config, ... }:
{
  systemd.services.podman-restart = {
    description = "Podman Start All Containers With Restart Policy Set To Always";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" "podman.socket" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${pkgs.podman}/bin/podman start --all --filter restart-policy=always";
    };
  };
  virtualisation.containers.enable = true;
  virtualisation = {
    podman = {
      enable = true;
      defaultNetwork.settings.dns_enabled = true;
    };
  };
  environment.systemPackages = with pkgs; [
    dive # para inspecionar camadas de imagens docker
    podman-tui # status dos containers no terminal
  ];
}
```

Vamos aplicar essas mudanças para ter o **Podman** instalado e funcionando.

```bash
nixos-rebuild switch
```

### 2. Configurar o firewall para a rede padrão do Podman

Como utilizamos o `nftables`, o Podman não aplica automaticamente regras de firewall. Para habilitar o acesso de rede aos containers, como a conectividade com a internet, para redes criadas pelo **Podman**, é necessário adicionar manualmente regras de firewall no arquivo `nftables.nft`. Mas primeiro, vamos verificar quais redes o **Podman** configurou por padrão.

```bash
podman network ls
# NETWORK ID    NAME                         DRIVER
# 000000000000  podman                       bridge
# 6b3beeb78ea9  podman-default-kube-network  bridge
```

Atualmente, existem duas redes: `podman`, que é a rede padrão para qualquer container criado sem especificar uma rede, e `podman-default-kube-network`, que é a rede padrão para pods criados com `podman kube play`.

Vamos agora verificar os intervalos de rede.

```bash

podman network inspect podman --format '{{range .Subnets}}{{.Subnet}}{{end}}'
# 10.88.0.0/16

podman network inspect podman-default-kube-network --format '{{range .Subnets}}{{.Subnet}}{{end}}'
# 10.89.0.0/24
```

Tendo os intervalos de rede, é hora de configurar nosso `nftables.nft`.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain podman_networks_input {
    ip saddr 10.88.0.0/16 accept comment "Podman default network"
    ip saddr 10.89.0.0/24 accept comment "Podman default Kube network"
  }

  chain podman_networks_forward {
    ip saddr 10.88.0.0/16 accept comment "Podman default network"
    ip daddr 10.88.0.0/16 accept comment "Podman default network"
    
    ip saddr 10.89.0.0/24 accept comment "Podman default Kube network"
    ip daddr 10.89.0.0/24 accept comment "Podman default Kube network"
  }

  chain input {
    type filter hook input priority filter 
    policy drop
    
    jump podman_networks_input
    ...
  }

  chain forward {
    type filter hook forward priority filter
    policy drop
    ...
    jump podman_networks_forward
    ...
  }
}
```

Atualize a configuração do NixOS

```sh
nixos-rebuild switch
```

## Configuração do Unbound

Agora que o **Podman** está instalado, é hora de configurar o **Unbound**. Usarei a imagem **Docker** [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Como o **Podman** suporta arquivos de implantação `yaml` semelhantes aos do **Kubernetes**, criaremos nosso próprio arquivo com base no exemplo fornecido no [repositório GitHub](https://github.com/cjuniorfox/unbound/) para esta imagem, especificamente na pasta [kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes).

### 1. Criar diretórios e volumes para o Unbound

Crie um diretório para armazenar o arquivo de implantação `yaml` do Podman e os volumes. Neste exemplo, criarei o diretório `/opt/podman` e colocarei a pasta `unbound` dentro dele. Além disso, vamos criar o diretório `volumes/unbound-conf/` para armazenar arquivos de configuração adicionais.

```sh
mkdir -p /opt/podman/unbound/volumes/unbound-conf/
```

### 2. Construir o arquivo de implantação YAML

Crie um arquivo `pod.yaml` em `/opt/podman/unbound/`, baseado no exemplo fornecido em [cjuniorfox/unbound](https://github.com/cjuniorfox/unbound/).

<!-- markdownlint-disable MD033 -->
<details>
  <summary>Clique para expandir o arquivo <b>pod.yaml</b>.</summary>

`/opt/podman/unbound/pod.yaml`

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
          value: "example.com" # O mesmo definido na configuração do Kea
        - name: DHCPSERVER
          value: "kea" # Servidor DHCP usado
      ports:
        - containerPort: 853 # DNS por TLS poderá ser usado até pela internet
          protocol: TCP
          hostPort: 853
        - containerPort: 53
          protocol: UDP
          hostPort: 53
          hostIP: 10.1.1.1 # LAN
        - containerPort: 53
          protocol: UDP
          hostPort: 53
          hostIP: 10.1.90.1 # Guest
        - containerPort: 90
          protocol: UDP
          hostPort: 90
          hostIP: 10.1.90.1 # IoT network
      volumeMounts:
        - name: dhcp-volume
          mountPath: /dhcp.leases
        - name: unbound-conf-volume
          mountPath: /unbound-conf
        - name: unbound-conf-d-pvc
          mountPath: /etc/unbound/unbound.conf.d
  restartPolicy: Always
  volumes:
    - name: dhcp-volume
      hostPath:
        path: /var/lib/kea/dhcp4.leases
    - name: unbound-conf-volume
      hostPath:
        path: /opt/podman/unbound/volumes/unbound-conf/
    - name: unbound-conf-d-pvc
      persistentVolumeClaim:
        claimName: unbound-conf
```

</details> <!-- markdownlint-enable MD033 -->

### 3. Arquivos de configuração adicionais

Você pode colocar arquivos de configuração adicionais no diretório `volumes/unbound-conf/`. Esses podem ser usados para habilitar recursos como um **servidor DNS TLS** ou para definir manualmente nomes DNS para hosts em sua rede. Você também pode bloquear a resolução de DNS para hosts específicos na internet. Esta etapa é opcional. Abaixo um exemplo de configuração que habilita a resolução de DNS para o servidor gateway **Mac Mini** na rede `lan`.

`/opt/podman/unbound/volumes/unbound-conf/local.conf`

```conf
server:
  private-domain: "example.com."
  local-zone: "example.com." static
  local-data: "macmini.example.com. IN A 10.1.1.1"
  local-data: "macmini.example.com. IN A 10.1.30.1"
  local-data: "macmini.example.com. IN A 10.1.90.1"
```

### 4. Criar uma rede Podman para o Unbound

O **Unbound** desempenhará um papel importante em nossa solução. Teremos regras específicas para ele, como redirecionar todas as **requisições DNS** na rede local para o **Unbound**, independentemente do **IP do servidor DNS** configurado nos hosts individuais. Portanto, ter uma **rede Podman** dedicada com um **endereço IP fixo** para o **Unbound** é importante.

Com isso em mente, criaremos uma rede para o **Unbound**. Esta rede exigirá dois endereços IP: um para a **máquina host** atuar como o **Gateway de Internet**, permitindo que o **Unbound** consulte **nomes DNS** e outro para o próprio container **Unbound**. Como precisamos de uma quantidade mínima de número de IPs, criaremos uma rede que suporte apenas **6 IPs** e colocaremos essa rede no final do intervalo `10.89.1.xxx`, especificamente em `10.89.1.248/30`.

```bash
podman network create \
  --driver bridge \
  --gateway 10.89.1.249 \
  --subnet 10.89.1.248/30 \
  --ip-range 10.89.1.250/30 \
  unbound-net
```

### 5. Adicionar a nova rede criada ao firewall

Como mencionado anteriormente, é obrigatório adicionar o intervalo de rede ao arquivo `nftables.nft`.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  ...
  chain podman_networks_input {
    ...
    ip saddr 10.89.1.248/30 accept comment "Podman unbound-net network"
  }

  chain podman_networks_forward {
    ...
    ip saddr 10.89.1.248/30 accept comment "Podman unbound-net network"
    ip daddr 10.89.1.248/30 accept comment "Podman unbound-net network"
  }
  ...
}
```

Aplicar novas regras de firewall

```sh
nixos-rebuild switch
```

### 6. Iniciar o container do Unbound

Vamos levantar o pod **Unbound** na rede `unbound-net` com o endereço IP fixo `10.89.1.250`. Este endereço IP será útil para configurar regras de firewall posteriormente.

```bash
podman kube play --replace \
  /opt/podman/unbound/pod.yaml \
  --network unbound-net \
  --ip 10.89.1.250
```

## Regras de Firewall

O **Podman** roteou as portas configuradas no arquivo `pod.yaml`, e nesse momento, o **Unbound** já resolve nomes de servidores no Gateway. Qualquer host em sua rede agora pode usar o gateway como servidor DNS. Você pode testar executando seguinte comando:

```bash
dig @10.1.1.1 google.com

; <<>> DiG 9.18.28 <<>> @10.1.144.1 google.com
; (1 server found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41111
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;google.com.  IN  A

;; ANSWER SECTION:
; google.com.  170  IN  A 142.251.129.78

;; Query time: 286 msec
;; SERVER: 10.1.144.1#53(10.1.144.1) (UDP)
;; WHEN: Wed Oct 16 12:41:21 UTC 2024
;; MSG SIZE  rcvd: 55
```

No entanto, ainda há alguns detalhes. Uma tarefa importante é impedir que hosts na rede `lan` usem qualquer **servidor DNS** que não seja o nosso. Isso é importante porque alguns dispositivos são configurados para usar outro servidor DNS como o `8.8.8.8` do Google. Para resolver isso, configuraremos o firewall para redirecionar qualquer solicitação DNS (porta `53`) para qualquer host feita através do nosso gateway para o **Unbound**.

### Atualizar a configuração do firewall

Edite o arquivo `nftables.nft` adicionando o seguinte:

`/etc/nixos/modules/nftables.nft`

```conf
...
table nat {
  chain unbound_prerouting {
    iifname {"lan", } ip daddr != 10.89.1.250 udp dport 53 dnat to 10.89.1.250:53
  }
  ...
  chain prerouting {
    type nat hook prerouting priority filter
    policy accept
    jump unbound_prerouting;
  }
}
```

## Atualizar configuração de DHCP

Configure o `servidor DHCP` para anunciar o servidor `DNS`. Lembre-se de que na rede `lan`, todos os servidores DNS usados para qualquer cliente serão redirecionados para o **servidor Unbound local**.

`/opt/podman/kea/volumes/kea-dhcp4.conf`

```json

  //Leave the rest of the configuration as it is
  "subnet4" : [
      {
        "interface" : "lan",
        "option-data": [
          { "name": "domain-name-servers", "data": "10.1.1.1" },
        ]
      },
      {
        "interface" : "guest",
        "option-data": [
          { "name": "domain-name-servers", "data": "10.1.30.1" },
        ]
      },
      {
        "interface" : "iot",
        "option-data": [
          { "name": "domain-name-servers", "data": "10.1.90.1" },
        ]
      }
    ]
```


### Rebuild do NixOS

```bash
nixos-rebuild switch
```

### Recarregar o Pod do Unbound

Sempre que as **regras de firewall** forem recarregadas, é bom recarregar os Pods, para que eles possam reconfigurar os roteamento de portas esperados.

```bash
podman pod restart unbound
```

## Conclusão

Neste artigo, instalamos o Podman como nosso motor de containers e configuramos o **Unbound** para rodar dentro dele, fornecendo capacidades de resolução de DNS e bloqueio de anúncios para nossa rede. Ao utilizar o **Podman**, nos beneficiamos de um ambiente de containers mais seguro e sem root, enquanto ainda aproveitamos o vasto ecossistema de imagens Docker pré-configuradas. Além disso, configuramos regras de firewall para garantir que todo o tráfego DNS seja roteado através do nosso servidor **Unbound**, aumentando ainda mais a segurança da nossa rede.

A seguir, configuraremos nossa rede sem fio usando um **Ubiquiti UniFi AP**.

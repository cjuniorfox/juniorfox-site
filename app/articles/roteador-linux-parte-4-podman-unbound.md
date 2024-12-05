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
- Parte 5: [Wifi](/article/roteador-linux-parte-5-wifi)
- Parte 6: [Nextcloud e Jellyfin](/article/roteador-linux-parte-6-nextcloud-jellyfin)
- Parte 7: [Compartilhamento de Arquivos](/article/roteador-linux-parte-7-compartilhamento-de-arquivos)
- Parte 8: [Backup](/article/roteador-linux-parte-8-backup)
- [Armazenamento não permanente](/article/roteador-linux-armazenamento-nao-permanente)

## Introdução

Nas seções anteriores, cobrimos a instalação do sistema operacional, a configuração da conectividade com a internet usando PPPoE, a proteção do nosso gateway com autenticação e um firewall robusto. Agora, é hora de levar esse Mac Mini, que agora é um roteador Linux para o próximo nível, containerizando serviços com **Podman** e configurando o **Unbound** para resolução de DNS e bloqueio de anúncios.

![Foca na frente de uma corda](/assets/images/diy-linux-router/seal-pod-and-rope.webp)  
*Imagem gerada por IA do [Gemini](https://gemini.google.com/) do Google*  

---

### Índice

1. [Introdução](#introdução)  
2. [Sobre o Podman](#sobre-o-podman)  
   - [Por que Escolher o Podman?](#por-que-escolher-o-podman)  
3. [Sobre o Unbound](#sobre-o-unbound)  
4. [Configuração do Podman](#configuração-do-podman)  
   - [Criar o Dataset ZFS](#criar-o-dataset-zfs)  
   - [Atualizar a Configuração do NixOS](#atualizar-a-configuração-do-nixos)  
   - [Configurar o Serviço Podman](#configurar-o-serviço-podman)  
   - [Rebuild da Configuração do Sistema](#rebuild-da-configuração-do-sistema)  
5. [Configuração do Unbound](#configuração-do-unbound)  
   - [Preparar Diretórios e Volumes](#preparar-diretórios-e-volumes)  
   - [Criar Arquivo de Deploy do Unbound](#criar-arquivo-de-deploy-do-unbound)  
   - [Configurar o Unbound](#configurar-o-unbound)  
   - [Iniciar o Unbound](#iniciar-o-unbound)  
   - [Habilitar o Unbound como Serviço](#habilitar-o-unbound-como-serviço)  
6. [Configuração do Firewall](#configuração-do-firewall)  
   - [Abrir Portas de Serviço](#abrir-portas-de-serviço)  
   - [Aplicar a Configuração](#aplicar-a-configuração)  
   - [Recarregar o Pod do Unbound](#recarregar-o-pod-do-unbound)  
7. [Conclusão](#conclusão)  

---

## Sobre o Podman  

### Por que Escolher o Podman?  

Embora o **NixOS** se destaque na gestão direta de serviços por meio de arquivos de configuração, a utilização de containers oferece flexibilidade adicional, especialmente quando usamos imagens Docker pré-construídas, adaptadas para necessidades específicas. Veja por que escolher o Podman:

1. **Design Sem Daemon**  
   Diferentemente do Docker, o Podman não depende de um daemon central. Cada container é executado como um processo separado, eliminando um ponto único de falha e melhorando a segurança.

2. **Rootless**  
   O Podman permite que containers sejam executados sem exigir privilégios de root, reduzindo o risco de escalonamento de privilégios e tornando-o ideal para sistemas multiusuários.

3. **Compatível com Kubernetes**  
   O Podman pode gerar arquivos YAML do Kubernetes diretamente a partir das configurações dos seus containers, facilitando a migração para ambientes Kubernetes ou híbridos.

4. **CLI Compatível com Docker**  
   A transição do Docker para o Podman é tranquila, já que o Podman suporta a maioria dos comandos da CLI do Docker com ajustes mínimos.

5. **Leve e Flexível**  
   O Podman se integra bem com ferramentas nativas do Linux e oferece maior controle sobre os serviços containerizados.

Combinando o Podman com o **NixOS**, podemos alcançar uma infraestrutura altamente modular, segura e facilmente reproduzível.

---

## Sobre o Unbound  

**Unbound** é um servidor DNS projetado para privacidade e segurança. Ele pode melhorar significativamente as velocidades de resolução DNS, reduzir o tráfego da internet e melhorando a privacidade.

Neste projeto, usaremos o **Unbound** não apenas para resolução DNS, mas também para:  

- **Cache de Consultas DNS**  
   Acelera requisições repetidas armazenando as consultas resolvidas localmente.

- **Bloqueio de Anúncios**  
   Incorpora listas de bloqueio, como o [arquivo de hosts de StevenBlack](https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts), para filtrar anúncios e rastreadores.

- **Resolução DNS Local**  
   Resolve dinamicamente nomes de host da rede local integrando-se ao nosso servidor DHCP.

Para essa configuração, usaremos uma imagem Docker pré-construída: [cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/), projetada para integrar-se perfeitamente à funcionalidade mencionada acima.

---

## Configuração do Podman

### Criar o Dataset ZFS

Vamos criar um dataset dedicado para o **Podman** no pool `zdata` (introduzido na [Parte 1](/articles/roteador-linux-parte-1-configuracao-inicial)). A estrutura de armazenamento de containers será organizada da seguinte forma:

- **Containers com root**: `/mnt/zdata/containers/root`
- **Containers sem root**: `/mnt/zdata/containers/podman`

Execute os seguintes comandos para criar os datasets necessários e aplicar devidamente as permissões:

```bash
ZDATA=zdata

# Criar datasets de containers
zfs create -o canmount=off ${ZDATA}/containers
zfs create ${ZDATA}/containers/root
zfs create ${ZDATA}/containers/podman

# Criar subdiretórios de armazenamento
zfs create -o canmount=off ${ZDATA}/containers/root/storage
zfs create -o canmount=off ${ZDATA}/containers/root/storage/volumes
zfs create -o canmount=off ${ZDATA}/containers/podman/storage
zfs create -o canmount=off ${ZDATA}/containers/podman/storage/volumes

# Definir a propriedade para o Podman sem root
chown -R podman:containers /mnt/${ZDATA}/containers/podman
```

Certifique-se de que o pool `zdata` está listado no arquivo `hardware-configuration.nix`:

`/etc/nixos/hardware-configuration.nix`

```nix
...
boot.zfs.extraPools = [ "zdata" ];
...
```

---

### Atualizar a Configuração do NixOS

Vamos configurar o Podman como um serviço do sistema e definir os caminhos de armazenamento. Abra o arquivo `/etc/nixos/configuration.nix` e faça as seguintes alterações:

1. **Adicionar o parâmetro do kernel** para a hierarquia unificada de cgroups:

   ```nix
   boot.kernelParams = [ "systemd.unified_cgroup_hierarchy=1" ];
   ```

2. **Incluir o módulo de configuração do Podman**:

   ```nix
   imports = [
     ...
     ./modules/podman.nix
   ];
   ```

3. **Criar o módulo Podman**: `/etc/nixos/modules/podman.nix`

   ```nix
   { pkgs, config, ... }:
   {
     virtualisation = {
       containers.enable = true;
       containers.storage.settings = {
         storage = {
           driver = "zfs";
           graphroot = "/mnt/zdata/containers/root/storage";
           runroot = "/run/containers/storage";
           rootless_storage_path = "/mnt/zdata/containers/$USER/storage";
         };
       };
       podman = {
         enable = true;
         defaultNetwork.settings.dns_enabled = true;
       };
     };

     environment.systemPackages = with pkgs; [
       dive      # Inspecionar camadas de imagens Docker
       podman-tui # Interface de usuário do Podman no terminal
     ];
   }
   ```

---

### Configurar o Serviço Podman

Por padrão, o Podman instala serviços systemd para containers, mas estas não gerenciam pods de forma eficaz. Vamos criar um serviço Systemd para viabilizar que os pods iniciem corretamente, mesmo que a interface de rede Pasta não esteja pronta durante o boot do sistema.

Crie um módulo personalizado para o serviço de pod do Podman:  
`/etc/nixos/modules/podman-pod-systemd.nix`

```nix
{ config, pkgs, ... }:

let
  podman = "${config.virtualisation.podman.package}/bin/podman";
  logLevel = "--log-level info";
  podmanReadiness = pkgs.writeShellScript "podman-readiness.sh" ''
    #!/bin/sh
    while ! ${podman} run --rm docker.io/hello-world:linux > /dev/null; do
      ${pkgs.coreutils}/bin/sleep 2;
    done
    echo "Podman está pronto."
  '';
in
{
  systemd.user.services."podman-pod@" = {
    description = "Gerenciar pods do Podman";
    documentation = [ "man:podman-pod-start(1)" ];
    wants = [ "network.target" ];
    after = [ "network.target" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStartPre = "${podmanReadiness}";
      ExecStart = "${podman} pod ${logLevel} start %I";
      ExecStop = "${podman} pod ${logLevel} stop %I";
      RemainAfterExit = "true";
    };
    wantedBy = [ "default.target" ];
  };
}
```

Inclua o novo módulo no seu arquivo `configuration.nix`:

`/etc/nixos/configuration.nix`

```nix
imports = [
  ...
  ./modules/podman.nix
  ./modules/podman-pod-systemd.nix
  ...
];
```

---

### Rebuild da Configuração do Sistema

Para aplicar as alterações e tornar o Podman disponível, refaça a configuração do sistema:

```bash
sudo nixos-rebuild switch
```

Após a conclusão da reconstrução, o Podman estará instalado e pronto para mais configurações.

---

## Configuração do Unbound

Agora que o **Podman** está instalado, é hora de configurar o **Unbound**. Utilizarei a imagem **Docker** [docker.io/cjuniorfox/unbound](https://hub.docker.com/r/cjuniorfox/unbound/). Como o **Podman** oferece suporte a arquivos de implantação **YAML** semelhantes ao **Kubernetes**, vamos criar o nosso próprio com base no exemplo fornecido no [repositório do GitHub](https://github.com/cjuniorfox/unbound/) para essa imagem, especificamente na pasta [Kubernetes](https://github.com/cjuniorfox/unbound/tree/main/kubernetes). Também vamos configurar para rodar como rootless por motivos de segurança. Faça o logout do servidor e se autêntique novamente como o usuário `podman`. Se você configurou seu `~/.ssh/config`, é só:

```bash
ssh router-podman
```

### Preparar Diretórios e Volumes

Primeiro, crie um diretório para armazenar os arquivos **YAML** de implantação do Podman e os volumes. Neste exemplo, vou criar o diretório em `/home/podman/deployments` e colocar um `unbound.yaml` dentro dele. Além disso, criarei o **volume do contêiner** `unbound-conf` para armazenar arquivos de configuração adicionais.

```sh
mkdir -p /home/podman/deployments/
podman volume create unbound-conf
```

### Criar Arquivo de Deploy do Unbound

Em seguida, crie um arquivo `unbound.yaml` em `/home/podman/deployments/unbound/`. Este arquivo é baseado no exemplo fornecido no repositório da imagem **Docker** [cjuniorfox/unbound](https://github.com/cjuniorfox/unbound/).

`/home/podman/deployments/unbound.yaml`

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
          value: "home.example.com" # O mesmo definido na seção DHCP do network.nix
      ports:
        - containerPort: 53
          protocol: UDP
          hostPort: 1053
      volumeMounts:
        - name: unbound-conf-pvc          
          mountPath: /unbound-conf
  restartPolicy: Always
  volumes:
    - name: unbound-conf-pvc      
      persistentVolumeClaim:
        claimName: unbound-conf
```

---

### Configurar o Unbound

Para lidar com **consultas DNS** para hosts com **IPs fixos**, **static leases** e **DNS customizados**, você pode usar um arquivo de configuração personalizado do Unbound. Este arquivo garantirá que as consultas DNS sejam resolvidas corretamente para esses hosts. O arquivo de configuração será colocado no volume `unbound-conf`, criado nas etapas anteriores.

O caminho para o arquivo de configuração é:  
`/mnt/zdata/containers/podman/storage/volumes/unbound-conf/_data/local.conf`

Exemplo de configuração (`local.conf`):

```conf
server:
  private-domain: "example.com."
  local-zone: "macmini.home.example.com." static
  local-data: "macmini.home.example.com. IN A 10.1.78.1"
  local-data: "macmini.home.example.com. IN A 10.30.17.1"
  local-data: "macmini.home.example.com. IN A 10.90.85.1"
```

Essa configuração define o seguinte:

- **Private-domain**: Restringe o escopo das consultas DNS para o domínio `example.com`.
- **Local-zone**: Marca o domínio `macmini.home.example.com` como estático, indicando que não devem ser feitas novas buscas fora da configuração local.
- **Local-data**: Mapeia `macmini.home.example.com` para múltiplos endereços IP (`10.1.78.1`, `10.30.17.1` e `10.90.85.1`).

Certifique-se de colocar esse arquivo corretamente no caminho especificado para garantir que o Unbound o use durante a execução.

---

### Iniciar o Unbound

Com a configuração concluída, você pode iniciar o Pod do Unbound com o seguinte comando:

```bash
podman kube play --log-level info --replace /home/podman/deployments/unbound.yaml
```

Para monitorar a saída de texto do pod e verificar se tudo funciona corretamente:

```bash
podman pod logs -f unbound
```

Você também pode verificar se as **consultas DNS** são corretamente processadas pelo Unbound com o comando `dig`:

```bash
dig @localhost -p 1053 google.com
```

Saída esperada:

```txt
; <<>> DiG 9.18.28 <<>> @localhost -p 1053 google.com
; (2 servers found)
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 64081
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;google.com.            IN      A

;; ANSWER SECTION:
google.com.     48      IN      A       142.250.79.46

;; Query time: 0 msec
;; SERVER: ::1#1053(localhost) (UDP)
;; WHEN: Thu Nov 14 17:47:19 -03 2024
;; MSG SIZE  rcvd: 55
```

Isso confirma que o Unbound está resolvendo as consultas DNS com sucesso.

---

### Habilitar o Unbound como Serviço

Para garantir que o Pod do Unbound inicie automaticamente o boot do sistema, habilite serviço `systemd` criado anteriormente com o seguinte comando:

```bash
systemctl --user enable --now podman-pod@unbound.service
```

Você pode reiniciar o servidor para verificar se o pod inicia sem problemas. Após reiniciar, verifique o status do serviço com:

```bash
systemctl --user status podman-pod@unbound.service
```

Exemplo de saída:

```txt
podman-pod@unbound.service - Run podman workloads via podman pod start
     Loaded: loaded (/home/podman/.config/systemd/user/podman-pod@unbound.service; enabled; preset: enabled)
     Active: active (exited) since Thu 2024-11-14 16:48:04 -03; 1h 2min ago
     ...
```

Isso indica que o Pod do Unbound está em execução e configurado para iniciar na inicialização do sistema.

---

## Configuração do Firewall

Por padrão, **Linux** não permite que serviços sem privilégios abram portas abaixo da 1024. Como o servidor DNS precisa operar na porta 53, precisamos redirecionar o tráfego da **porta 53** para a **porta 1053** (usada pelo Unbound no contêiner rootless). Da mesma forma, o tráfego de DNS sobre TLS na **porta 853** precisa ser redirecionado para a **porta 1853**.

Siga estas etapas para configurar as regras do firewall:

---

### Abrir Portas de Serviço

Primeiro, adicione a nova chain `unbound_dns_input` no arquivo `services.nft`. Esta chain permite o tráfego para os serviços DNS e DNS sobre TLS do Unbound. Mantenha as cadeias de serviço existentes inalteradas.

`/etc/nixos/nftables/services.nft`

```nft
...
chain unbound_dns_input {
    udp dport 1053 ct state { new, established } counter accept comment "Permitir servidor DNS Unbound"
    tcp dport 1853 ct state { new, established } counter accept comment "Permitir servidor TLS-DNS Unbound"
}
...
```

Em seguida, inclua essa nova chain nas zonas de rede (**LAN**, **GUEST** e **IOT**).

`/etc/nixos/nftables/zones.nft`

```nft
chain LAN_INPUT {
    ...
    jump unbound_dns_input
    ...
}

chain GUEST_INPUT {
    ...
    jump unbound_dns_input
    ...
}

chain IOT_INPUT {
    ...
    jump unbound_dns_input
    ...
}
...
```

---

### Configurar Regras de NAT

Como contêineres sem privilégios não podem abrir portas privilegiadas, precisamos redirecionar o tráfego DNS para portas mais altas, não privilegiadas. Especificamente, o tráfego da **porta 53** será redirecionado para a **porta 1053**, e a **porta 853** será redirecionada para a **porta 1853**.

---

#### Definindo Cadeias de NAT

Adicione as seguintes cadeias de NAT para tratar o redirecionamento tanto para os IPs do gateway quanto para as requisições DNS não restritas.

`/etc/nixos/nftables/nat_chains.nft`

```nft
table ip nat {
  chain unbound_redirect {
    ip daddr { $ip_lan, $ip_guest, $ip_iot } udp dport 53 redirect to 1053
    ip daddr { $ip_lan, $ip_guest, $ip_iot } tcp dport 853 redirect to 1853
  }
  
  chain unbound_redirect_lan {
    udp dport 53 redirect to 1053
    tcp dport 853 redirect to 1853
  }
}
```

- **`unbound_redirect_lan`** garante que todas as requisições DNS na LAN sejam redirecionadas para o Unbound, independentemente do host solicitado. Isso evita que os clientes contornem o Unbound ao usarem servidores DNS alternativos.
- **`unbound_redirect`** redireciona apenas as requisições direcionadas aos IPs de gateway, permitindo que os clientes usem servidores DNS alternativos, se desejado.

---

#### Configurando as Zonas de NAT

Para aplicar as regras de NAT, atualize a configuração da zona de NAT adicionando as cadeias correspondentes para cada zona.

`/etc/nixos/nftables/nat_zones.nft`

```nft
table ip nat {
  chain LAN_PREROUTING {
    jump unbound_redirect_lan
  }

  chain GUEST_PREROUTING {
    jump unbound_redirect
  }

  chain IOT_PREROUTING {
    jump unbound_redirect
  }
}
```

---

### Aplicar a Configuração

Após fazer todas as alterações, reconstrua a configuração do NixOS para aplicar as regras de firewall atualizadas:

```bash
nixos-rebuild switch
```

---

### Recarregar o Pod do Unbound

Sempre que as regras do firewall forem recarregadas, é uma boa prática reiniciar o Pod do Unbound para garantir que ele reconfigure corretamente as vinculações de porta:

```bash
systemctl --user restart unbound.service
```

---

## Conclusão

Nesta parte da série, configuramos o **Podman** como nosso mecanismo de contêiner e configuramos o **Unbound** para fornecer resolução DNS e funcionalidades de bloqueio de anúncios dentro de um contêiner sem privilégios. Ao utilizar o **Podman**, alcançamos um ambiente mais seguro e flexível em comparação com os contêineres tradicionais baseados em root, ao mesmo tempo em que aproveitamos uma imagem pré-construída para simplificar o processo de implantação.

Também implementamos **regras de firewall** personalizadas para garantir que todo o tráfego DNS, incluindo DNS sobre TLS, seja roteado através do nosso servidor **Unbound**, melhorando a segurança e o controle do tráfego de rede.

Na próxima parte, vamos expandir nossa configuração para configurar uma rede sem fio usando um **Ponto de Acesso Ubiquiti UniFi**.

- Parte 5: [Configuração de Wi-Fi](/article/roteador-linux-parte-5-wifi)

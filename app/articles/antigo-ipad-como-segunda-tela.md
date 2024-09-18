---
title: "Antigo iPad como segunda tela"
articleId: "old-ipad-as-a-second-screen"
date: "2024-07-25"
author: "Carlos Junior"
category: "Linux"
brief: "Dê uma nova vida a um antigo iPad como um excelente segundo monitor usando Moonlight e Sunshine"
image: "/assets/images/old-ipad-as-a-second-screen/ipad-as-monitor.webp"
keywords : ["ipad","segunda tela", "windows", "linux", "hyprland", "moonlight", "sunshine", "apple", "retina display"]
lang : "pt"
other-langs : [{"lang":"en","article":"old-ipad-as-a-second-screen"}]
---
## Índice

1. [Introdução](#introdução)
2. [Sunshine e Moonlight](#sunshine-e-moonlight)
3. [Linux](#linux)
   - [Instalando Sunshine](#instalando-sunshine)
   - [Criar um serviço para "setcap" no Sunshine](#criar-um-serviço-para-setcap-no-sunshine)
   - [Firewall](#firewall)
   - [Script para criar a tela virtual](#script-para-criar-a-tela-virtual)
   - [Configuração do Sunshine no Linux](#configuração-do-sunshine-no-linux)
4. [Windows](#windows)
   - [Dongle HDMI Headless](#dongle-hdmi-headless)
   - [Driver de Display Virtual](#driver-de-display-virtual)
   - [Sunshine](#sunshine)
   - [Configuração do Sunshine no Windows](#configuração-do-sunshine-no-windows)
5. [Instalar Moonlight no iPad antigo](#instalar-moonlight-no-ipad-antigo)
6. [Configurar Moonlight](#configurar-moonlight)
   - [Solução de Problemas](#solução-de-problemas)
   - [Desconectar](#desconectar)
7. [Conclusão](#conclusão)

## Introdução

![iPad como Monitor](/assets/images/old-ipad-as-a-second-screen/ipad-as-monitor.webp)

Eu tenho um iPad 3ª geração que me a muito, me foi gentilmente presenteado por um amigo (obrigado [Hamdan](https://www.instagram.com/alhamdan/)). O usava bastante até que a Apple deixou de oferecer suporte para ele e passou a me implorar para que eu o jogasse ele fora e gastasse uma fortuna em um iPad novo que, certamente, em alguns anos, a Apple me pedirá novamente para jogar fora esse novo iPad no mesmo lixão que o antigo deveria estar, mas como sou teimoso, me recusei a atender os desejos da Apple. Enquanto este antigo iPad funsionasse bem, eu ainda o usava. No entanto, não era uma tarefa fácil. Aplicativos como YouTube, Facebook e Twitter deixaram de oferecer suporte para o iOS 9.3.6 há muito tempo, que é a versão "mais recente" suportada por este iPad. Até mesmo navegar na web não é uma tarefa fácil. Então, finalmente desisti e acabei por trancar este iPad no meu guarda-roupa, onde não foi usado por muitos anos. Mas agora é hora de tirá-lo de lá e dar e lhe dar uma nova vida, agora como um segundo monitor. Com sua Retina Display com resolução de 2048x1536, é um segundo monitor muito competente. Esta ideia não é nova, e já existem algumas soluções para resolver essa tarefa, como Spacedesk para Windows ou transmissão de VNC de um display virtual. Essas soluções até funcionam, mas oferecem uma experiência com baixa taxa de quadros e muito delay, que não atende às minhas expectativas. Fiquei muito frustrado até encontrar a solução que já estava na minha frente. Uma ótima solução, para dizer o mínimo, que funciona tanto em no Linux quanto Windows. No Linux, com Wayland e seus muitos compositores como Gnome, KDE, Sway e o Hyprland, que é o que estou usando agora, e, obviamente, X11. A solução é a dupla Sunshine e Moonlight.

## Sunshine e Moonlight

Sunshine (servidor) e Moonlight (cliente) oferecem uma solução de código aberto para o Nvidia Shield, que é uma plataforma para jogos remotos voltada para placas Nvidia em máquinas Windows. Sunshine e Moonlight ampliam as opções, oferecendo suporte não apenas para placas Nvidia, mas também para GPUs AMD e Intel, além de estender o suporte para outras distribuições baseadas em Linux e o macOS. Sendo uma solução para jogos via transmissão remota, a taxa de quadros é excelente e a latência é muito baixa, oferecendo uma ótima experiência. Então, chega de conversa, vamos começar.

## Linux

O passo a passo desse tutorial é baseado no Fedora Linux com Hyprland usando a placa de vídeo AMD RX 6700 XT. Você pode achar que isso é muito específico, mas não desanime. Com algumas adaptações, você certamente poderá seguir este guia com alguns ajustes aqui e ali.

### Instalando Sunshine

O Sunshine não é está disponível nos gerenciadores de pacotes das distribuições. Em vez disso, você precisa baixar o pacote manualmente de acordo com a distribuição que está usando. A opção mais genérica, na minha opinião, é usar o Flatpak. Então, vamos baixar a versão mais recente do software em Flatpak do Sunshine a partir [deste link](https://github.com/LizardByte/Sunshine/releases) e dar vários comandos de Linux para fazê-lo funcionar.

### Criar um serviço para "setcap" no Sunshine

O Sunshine compartilha a tela usando uma solução que exige permissões especiais para o arquivo executável, e essa permissão precisa ser aplicada a cada inicialização. Então, vamos criar um serviço systemd para isso. Crie o arquivo `/etc/systemd/system/sunshine-setcap.service` com o seguinte conteúdo:

```ini
[Unit]
Description=Self-hosted game stream host for Moonlight

[Service]
Type=oneshot
Environment=LANG=en_US.UTF-8
ExecStart=/usr/bin/bash -c '/usr/sbin/setcap cap_sys_admin+p $(readlink -f $(/usr/bin/find /var/lib/flatpak/app -name sunshine | /usr/bin/grep /bin/sunshine)); /usr/bin/touch /var/run/sunshine-setcap-done'

[Install]
WantedBy=multi-user.target
```

Agora, vamos criar um serviço a nível de usuário para inicializar o Sunhine assim que fizer login. Crie o arquivo `~/.config/systemd/user/sunshine.service` com o seguinte conteúdo:

```ini
[Unit]
Description=Self-hosted game stream host for Moonlight
StartLimitIntervalSec=500
StartLimitBurst=5

[Service]
Environment=LANG=en_US.UTF-8
ExecStartPre=/bin/bash -c 'while [ ! -f /var/run/sunshine-setcap-done ]; do echo "Waiting for sunshine-setcap.service to complete..."; sleep 5; done; /usr/bin/sleep 5'
ExecStart=/usr/bin/flatpak run dev.lizardbyte.app.Sunshine
ExecStop=/usr/bin/flatpak kill dev.lizardbyte.app.Sunshine
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=xdg-desktop-autostart.target
```

Habilite os serviços

```bash
sudo systemctl enable sunshine-setcap.service --now
systemctl --user enable sunshine --now
```

Não esquecer de tornar os serviços a nível de usuário inicializáveis adicionando ao seu `autostart` o comando `systemctl --user start default.target`. No **Hyprland**, basta apenas adicionar essa linha no seu `~/.config/hyprland.conf`:

```conf
exec-once = systemctl --user start default.target
```

### Firewall

O que o Linux tem em segurança e confiabilidade, falta em configurar automaticamente todas as permissões e regras necessárias para fazer um determinado serviço funcionar. Precisamos abrir portas no Firewall para o Sunshine. Neste caso, as portas TCP `47984`, `47989`, `48010` e as portas UDP de `47998 a 48000`, e `48002`, `48010`. Abrindo essas portas no nosso firewall, tornaremos o serviço Sunshine disponível na rede local. No exemplo, usei o **firewalld**, a solução padrão para o Fedora e muitas outras distribuições Linux

1. no Firewall. Crie o arquivo `/etc/firewalld/services/sunshine.xml` com o seguinte conteúdo:

```xml
<service>
  <short>Sunshine</short>
  <description>Sunshine Screen Streaming and Sharing Service</description>
  <port protocol="tcp" port="47984"/>
  <port protocol="tcp" port="47989"/>
  <port protocol="tcp" port="48010"/>
  <port protocol="udp" port="47998"/>
  <port protocol="udp" port="47999"/>
  <port protocol="udp" port="48000"/>
  <port protocol="udp" port="48002"/>
  <port protocol="udp" port="48010"/>
</service>
```

2. Recarregue o `firewalld` tornando o serviço disponível.

```bash
sudo firewall-cmd reload
```

3. Adicione o recém criado serviço a zona de sua rede logal. Por padrão, `firwalld` configura o adaptador padrão na zona `public` ou na zona `home`. Você pode confirmar a zona utilizada com o comando `sudo firewall-cmd --get-zone-of-interface=enp6s0` assumindo que seu adaptador de rede é o `enp6s0`. No meu caso, a zona do adaptador de rede padrão é o `home`. Vamos então criar o serviço para a zona `home`:

```bash
sudo firewall-cmd --add-service=sunshine --zone=home
sudo firewall-cmd --runtime-to-permanent
```

4. À partir de agora, o serviço **Sunshine** estará inicializavel e disponível em sua rede. Você pode verificar instalando o aplicativo **Moonlight** no seu tablet ou telefone. Seu computador estará disponível como pariável na tela principal do **Moonlight**. Caso contrário, revise os passos anteriores ou reinicie o computador.

### Script para criar a tela virtual

Importante: Este script é voltado para compositor Hyprland. Se você estiver usando outro compositor como Gnome, KDE ou Sway, é preciso adaptar os comandos de acordo com o seu compositor. Além disso, a resolução do exemplo é para o iPad de 3ª geração. Configure a resolução que corresponda com dispositivo que você pretende usar como segundo monitor. 

- Crie o arquivo `/home/username/.local/bin/virtual-screen.sh` com o seguinte conteúdo:

```bash
RESOLUTION=1024x768
POSITION=auto
SCALE=1
COMMAND=$1
OUTPUT=$(hyprctl monitors | grep HEADLESS | tail -n1 | awk \{print\ \$2\})

if [ "${COMMAND}" = "create" ]; then
  hyprctl output create headless
  hyprctl keyword monitor "${OUTPUT}","${RESOLUTION}","${POSITION}","${SCALE}"
elif [ "${COMMAND}" = "remove" ]; then
  hyprctl output remove "${OUTPUT}"
else
  echo "Use [virtual-screen.sh create] or [virtual-screen.sh remove]"
fi
```

### Configuração do Sunshine no Linux

Se você chegou até aqui, você instalou e configurou o Sunshine com sucesso na sua máquina. Agora é hora de configurá-lo. Abra seu navegador e acesse a seguinte URL: `http://localhost:47990`. Configure seu nome de usuário e senha digitando-os duas vezes conforme mencionado na página. Recarregue a página com F5, e você deve ser redirecionado para a página principal. Se tudo estiver funcionando como esperado, você deve ver uma página parecida com esta.

![Tela inicial do Sunshine](/assets/images/old-ipad-as-a-second-screen/sunshine-home-screen.webp)

Se, em vez disso, você tiver um grande alerta vermelho na sua tela, refaça os passos acima para corrigir o problema.
Com tudo funcionando, siga os seguintes passos:

1. No topo da página, clique em `Configuration`, e depois na aba `Audio/Video`.
2. Defina o campo `Display Number` como 1. Se você tiver monitores adicionais conectados ao seu computador, defina este valor como 2 se você tiver dois monitores, se tiver três, defina como 3 e assim por diante.
3. No topo da página, clique em `Applications`. Aqui precisamos adicionar os comandos para criar a tela virtual a ser compartilhada pelo Sunshine com o iPad ou seu dispositivo.
   - Clique em adicionar.
   - Defina `Application Name` como `Second Screen`.
   - Em `command preparations`, clique no botão verde de mais `(+)`.
   - Adicione em `Do Command`

```sh
   flatpak-spawn --host /home/username/.local/bin/virtual-screen.sh create
```

   - Em `Undo Command` (desfazer), configure como: 

```sh
   flatpak-spawn --host /home/username/.local/bin/virtual-screen.sh remove
```

## Windows

![Windows 95 por shenanigan87](/assets/images/old-ipad-as-a-second-screen/windows-95-by-shenanigan87.webp)
_Windows 95 por [shenanigan87](https://www.deviantart.com/shenanigan87/art/Windows-95-812794743)_

Vamos deixar uma coisa clara, eu não tenho nada contra o Windows, e não acho que o Windows seja um sistema operacional ruim em nenhuma circunstância. Eu só não gosto de usar um sistema operacional pesado e sobrecarregado que fica de olho em tudo o que estou fazendo, consumindo recursos preciosos da minha máquina para tentar me vender coisas que eu não quero e não me permitindo desativar essas coisas para economizar recursos ou personalizar o sistema operacional como eu desejar. Por exemplo, por que eu posso colocar o Menu Iniciar (ou Menu do Windows, não sei) ancorado ao centro da tela ou à esquerda, mas não à direita? Se eu quiser, deveria poder colocar o Menu Iniciar em qualquer lugar que eu quisesse no sistema operacional pelo qual paguei uma fortuna para ter. Mas vamos parar de reclamar do Windows e fazer o trabalho proposto. O processo é basicamente o mesmo que no Linux, com a diferença de que o Windows não é capaz de criar uma nova tela virtual por padrão. Para fazer isso, temos duas maneiras: usar um dongle HDMI Headless, que é simples, mas um pouco "gambiarrento", ou instalar um driver de display virtual, que é um pouco mais complicado e ainda um pouco "gambiarrento", mas não tanta gambiarra quanto conectar e desconectar um dispositivo que finge ser um monitor no seu computador.

### Dongle HDMI Headless

A intenção do dongle é enganar o Windows e a placa de vídeo fazendo-os pensar que há um monitor extra conectado no computador. Com isso, não há configuração a ser feita. Basta conectar a alguma saída HDMI do computador e pronto. Seu computador vai pensar que você tem outro monitor conectado e enviará vídeo para ele, podendo compartilhar essa tela com o Sunshine e usá-la como um segundo display. A solução é direta, mas assume que você tem uma saída de vídeo disponível, e isso nem sempre é o caso. Você também precisará alterar a resolução para corresponder à resolução do tablet, e nem todos os EDIDs dos dongles disponibilizam as resoluções pretendidas para esse propósito. Você pode modificar os valores do firmware EDID do seu dongle, mas se a ideia é tornar a configuração simples, alterar o firmware do dongle não é exatamente o que você deseja.

![Dongle HDMI Sem Cabeça](/assets/images/old-ipad-as-a-second-screen/hdmi-headless-dongle.webp)

### Driver de Display Virtual

Como mencionado, o Windows não oferece uma solução pronta para criar uma tela virtual. Se você não quer usar um dongle porque não tem um ou porque não tem uma saída HDMI disponível, e quer uma configuração mais adequada para a resolução do seu tablet e até suporte a HDR, a resposta é instalar o `driver de display virtual` que cria um `adaptador de display virtual` emulando o comportamento de conectar um monitor a esse adaptador. Fazemos isso instalando este software: [Virtual Display Driver](https://github.com/itsmikethetech/Virtual-Display-Driver). Então, faça o seguinte:

1. Baixe o Driver [aqui](https://github.com/itsmikethetech/Virtual-Display-Driver). 
2. Descompacte o arquivo e, no `Windows Explorer`, vá para o diretório `IddSampleDriver`.
3. Abra outra janela do `Windows Explorer` e, no topo do drive `C:`, crie o diretório.

```cmd
   C:\IddSampleDriver
```

4. Copie o arquivo `option.txt` da pasta extraída para `C:\IddSampleDriver` ou crie seu próprio arquivo. Este arquivo contém todos os modos disponíveis para seu novo adaptador. Eu criei o meu da seguinte forma:

```txt
1
1024, 768, 60
2048,1536, 60
```

5. **IMPORTANTE!** Clique com o botão direito no arquivo `installCert.bat` e clique em `Executar como Administrador`.
   - Ignore a preocupante mensagem do Windows se gabando dizendo que "Eu protegi seu computador" clicando em `mais informações` e depois em `Executar assim mesmo`.
   - Clique em `Sim` na outra mensagem de preocupação sobre segurança.
6. Abra o `Gerenciador de Dispositivos` digitando `gerenciador de dispositivos` na caixa de pesquisa da barra de tarefas.
7. Clique em qualquer dispositivo e depois no botão `Ação` e no item de menu `Adicionar driver legado`.
   - Você será apresentado a um Assistente. Clique em `Avançar`.
   - Clique em `Adicionar a partir de uma lista` e em `Avançar`.
   - Selecione `Adaptadores de vídeo` e clique em `Avançar`.
   - Clique em `Com disco`, e `Procurar` e vá para o diretório onde você descompactou `IddSampleDriver` contendo o arquivo `.inf`.
   - Selecione a única opção `Virtual Display Driver by MTT` e clique em `Avançar` e `Avançar`.

Se tudo correr como esperado, a tela fará efeito visual como uma "vinheta" e abrirá novamente. Isso significa que o driver de display foi instalado com sucesso e está funcionando. O `option.txt` em `C:\IddSampleDriver` contém todos os modos habilitados. Você pode adicionar ou remover resoluções conforme suas necessidades. No meu caso, 1024x768 e 2048x1536 são as únicas resoluções que pretendo usar.

Para habilitar e desabilitar a segunda tela, você precisará habilitar e desabilitar manualmente as `Opções de exibição` com um clique com o botão direito na sua área de trabalho.

### Sunshine

Embora o Driver de Display Virtual seja uma configuração um pouco complicada, instalar o Sunshine no Windows é molezinha. Basta baixar a versão mais recente do software no [Github](https://github.com/LizardByte/Sunshine/releases/) e instalá-lo, novamente, ignorando as mensagens de preocupação do Windows.

### Configuração do Sunshine no Windows

Aqui configuramos de maneira semelhante ao que fizemos no Linux. Como eu sei que se você está instalando a versão do Windows, você não leu uma palavra da instalação do Linux, vou repetir alguns passos. Mas se você leu (vamos ser honestos, eu sei que você não leu), verá muitas semelhanças, mas elas não são idênticas.

1. Vá para `http://localhost:47990`.
2. Ignore o aviso de risco de segurança e clique em "Ir mesmo assim".
3. Configure seu nome de usuário e senha e atualize a página.
4. Faça login com as credenciais recém-criadas.
5. Clique em `Configuration`, `Audio/Video` e no campo `output name` digite o nome correto do seu monitor virtual.

_Se você não souber qual é o nome, o Sunshine tem uma ferramenta para isso. Vá para a pasta onde está instalado o Sunshine em `C:\\Program Files\\Sunshine\\tools`. Clique com o botão direito, abra no Terminal e digite `dxgi-info.exe`. O meu foi nomeado `.\\DISPLAY9`._

Só um detalhe: A instalação do Sunshine estará vinculada a esta tela, mesmo que você queira jogar remotamente. Então, você precisará fazer algumas configurações manuais para usar o Sunshine para outros propósitos além de estender a tela.

## Instalar Moonlight no iPad antigo

Como mencionado no inicio, a Apple quer que eu jogue fora meu iPad 3ª geração perfeitamente funcional em um aterro sanitário e gaste uma fortuna em um novo, e eles fazem isso ao deixar de oferecer suporte para dispositivos antigos. A receita é simples. Eles param de lançar novas versões do sistema operacional, fazendo com que esses dispositivos fiquem presos a uma versão mais antiga do SO, enquanto deixam de oferecer suporte ao software para o SO que está rodando nele, tornando o sistema desatualizado e inseguro. O tempo passa, e o suporte é retirado programa a programa, tornando o dispositivo inútil. Este iPad não é capaz de rodar aplicativos nativos para nenhuma das principais redes sociais ou clientes de e-mail, mesmo sendo fisicamente capaz de fazê-lo. Isso é **obsolescência programada**, literalmente, porque seus servidores são programados para tornar esses dispositivos obsoletos. Por causa disso, instalar novos aplicativos nesses dispositivos antigos não é uma tarefa fácil. Se você tem o aplicativo na sua biblioteca e esse ofereceu suporte para a versão do iOS que está rodando no gadget em algum momento no passado, sorte sua, pois a Apple ainda oferece a opção de instalar uma versão mais antiga do aplicativo, que atende às nossas necessidades no caso do Moonlight. Se você não tinha o software na sua biblioteca, sinto muito, mas você está em uma situação ruim, porque a Apple não permite que você adicione software desatualizado à sua biblioteca. Para superar isso, você tem duas opções. A mais fácil é ter um dispositivo iOS mais novo (novamente, a Apple implorando para gastar uma fortuna em um novo dispositivo) e nele, se a versão do iOS que está rodando for suficientemente mais nova, você poderá adicionar o **Moonlight** à sua biblioteca através deste dispositivo e, em seguida, instalar uma versão mais antiga no seu dispositivo mais antigo. Por sorte minha, minha prima gentilmente me deu um iPhone 6s que serve bem para esse propósito. A outra maneira é usar alguma solução de jailbreak que eu não abordo neste artigo. Já criei muitos problemas com a Apple e não quero criar um novo.

![Moonlight no iPad Antigo](/assets/images/old-ipad-as-a-second-screen/moonlight-on-ancient-ipad.webp)

## Configurar Moonlight

A partir deste momento, é apenas uma questão de configurar o Moonlight no seu Tablet. Este passo é autoexplicativo, mas, de qualquer forma, vamos fazer juntos.

1. **Abra o Moonlight**:
   - Um ícone representanto seu computador deve estar disponível com um cadeado no meio. Se não, verifique se o serviço Sunshine está ativo e funcionando. Se estiver, refaça os passos referentes ao Firewall.

2. **Emparelhar seus dispositivos**:
   - Toque no seu computador. Um número PIN será exibido no seu Tablet.
   - Vá para o seu computador, navegue para `http://localhost:47990`, faça login e clique na aba **Pin**.
   - Insira o PIN exibido no seu Tablet. O cadeado desaparecerá.

3. **Selecione a Segunda Tela**:
   - Agora toque no seu computador novamente. Você terá uma opção chamada `Second Screen` (**apenas para usuários de Linux**). Se não, refaça os passos na configuração do Sunshine.
   - Se você estiver usando a versão `Windows`, você terá apenas a opção `Desktop` e está certo.
   - Toque na **Second Screen** `Linux` ou **Desktop** `Windows`. Você verá a segunda tela no seu tablet.

### Solução de Problemas

- Se você tiver um espelho da tela principal ou receber um erro mencionando que não foi possível iniciar o aplicativo, verifique se você criou corretamente o script para adicionar a tela virtual (Linux), certificando-se de que o script está de acordo com o seu Compositor e a Configuração do Sunshine.
- (Linux) Se você não instalou a versão Flatpak do Sunshine e, em vez disso, instalou o pacote para a sua distro, remova `flatpak-spawn --host` dos comandos na etapa de configuração do Aplicativo.

### Desconectar

- Quando terminar de usar a segunda tela, volte deslizando a tela para trás, mantenha o dedo na aplicação `Second Screen` e toque em `Quit app`. A tela virtual criada ficará indisponível.

## Conclusão

Então, isso completa este tutorial sobre como dar uma nova vida ao seu velho iPad tanto para Linux quanto para Windows. Se você tiver alguma dúvida, envie uma questão na minha página do [Github](http://github.com/cjuniorfox/juniorfox-site/issue).

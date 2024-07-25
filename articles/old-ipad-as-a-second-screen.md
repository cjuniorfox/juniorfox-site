# Old iPad (or any tablet) as a second screen for Linux and Windows

I have this older iPad 3rd generation that was kindly given to me as a gift by a friend (thanks H) and I used it very often until Apple dropped the support for this iPad and begged me to throw it away into a landfill and spend a grand into a brand new iPad which certainly in a couple of years Apple will ask me to trow at the same landfill as this iPad would be, but I refused to attend Apple's wishes and, as far as this ancient iPad worked well, I still using it. But wasn't an easy task. Apps like YouTube, Facebook, and Twitter, dropped the support for iOS 9.3.6 a long ago, which is the "most recent" version supported by this iPad. Even surfing the web is not an easy task on it. So, I finally gave up and locked this iPad in my wardrobe which had not been used for many years.
But now is the time to get them from my wardrobe and give a new life to this iPad, now as a second monitor, and with your Retina Display with 2048x1536 resolution, a very competent second display.
This idea is not new and already there are some solutions for addressing this task, like Spacedesk for Windows or VNC screencasting a virtual display. Work, but offers a low-framerate-laggy experience that isn't up to my expectations. I was very frustrated until I found the solution already in front of me. A great one to say at least, that works on both Linux and Windows machines. On Linux, with Wayland and their many compositors like Gnome, KDE, Sway, and Hyprland, which is the one I'm using right now, and, obviously, X11. And is the solution is the couple Sunshine and Moonlight.

# Sunshine and Moonlight
Sunshine (server side) and Moonlight (client side) offer an open-source solution for Nvidia Shield, which is a platform for remote gaming aimed at Nvidia cards on Windows machines. Sunshine and Moonlight spread the options gaining support for not only Nvidia cards but also AMD and Intel GPUs, as well as extending for other Linux-based distros and Mac OS. 
Being a solution for remote gaming, the framerate is excellent and the latency is very low, offering a great experience.
So enough talk and let's get started.

## Linux
During this tutorial, I will provide the steps based on Fedora Linux with Hyprland using an AMD RX 6700 XT as a Display Adapter. You would think this is way too specific, but don't be discouraged. With some adaptations, certainly, you can follow this guide with some quirks here and there.
### Install Sunshine
Sunshine does not provide its packages to the distro's package managers. Instead, you need to download the package manually according to the distribution you're currently using. With that in mind, The most general option, in my opinion, is using the Flatpak version of it. So, let's download the latest Flatpak release of Sunshine from this link and do some Linux shenanigans to make it work.
### Create a service for "setcap" on Sunshine
Sunshine shares the screen using a solution that demands special permissions to the executable file and this permission needs to be applied on every boot. So let's create a systemd unit for it.
`/etc/systemd/system/sunshine-setcap.service`
```
[Unit]
Description=Self-hosted game stream host for Moonlight

[Service]
Type=oneshot
Environment=LANG=en_US.UTF-8
ExecStart=/usr/bin/bash -c '/usr/sbin/setcap cap_sys_admin+p $(readlink -f $(/usr/bin/find /var/lib/flatpak/app -name sunshine | /usr/bin/grep /bin/sunshine)); /usr/bin/touch /var/run/sunshine-setcap-done'
[Install]
WantedBy=multi-user.target
```
Now, let's create a user-level service for starting the sunshine upon login.
`~/.config/systemd/user/sunshine.service`
```
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
Enable both services
```bash
sudo systemctl enable sunshine-setcap.service --now
systemctl --user enable sunshine --now
```
Do not forget to make user-level services available by adding to your autostart the command `systemctl --user start default.target`, On Hyprland, it's just a matter of adding the line into `~/.config/hyprland.conf`.
```conf
exec-once = systemctl --user start default.target
```
### Firewall
What Linux has of security and reliability, lacks of automatically configuring all the permissions and rules needed to make the intended service work. We need to manually open the ports for Sunshine. In that case, the TCP ports `47984`, `47989`, `48010` and the UDP ones from `47998 to 48000`, and `48002`, `48010`. With that in mind, let's open ports on our firewall and make Sunshine service available to the local network. This step regard to firewalld, the default solution for Fedora and many other Linux distributions.
1. Let's create the `/etc/firewalld/services/sunshine.xml`
```
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
2. Reload firewalld to make service available.
```bash
sudo firewall-cmd reload
```
3. Add the newly created service to the local network zone. By default, firwewalld configures the default adapter to the public zone or home zone. You can check what zone with the command `sudo firewall-cmd --get-zone-of-interface=enp6s0` assuming that your network adapter is named enp6s0. In my case, the zone of my network adapter is home. So let's add the service to the home
```bash
sudo firewall-cmd --add-service=sunshine --zone=home
sudo firewall-cmd --runtime-to-permanent
```
4. From this moment on, you will have the Sunshine service initialized and available on your local network. You can check it by installing the Moonlight app on your Tablet or Phone. Your computer should appear as a pairable device on Moonlight's home screen. If not, It's just a matter of rebooting your computer.
### Script for adding the virtual screen
A little disclaimer. This script regards to Hyprland. If you're using another Compositor like Gnome, KDE, or Sway, you must adapt the commands accordingly to your compositor.
Also, the intended resolution is for the iPad 3rd generation. Configure the resolution to match the gadget you should use as a second monitor. 
`/home/username/.local/bin/virtual-screen.sh`
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
### Sunshine Configuration
If you successfully made it that far. You have Sunshine successfully installed and working on your machine, now It's time to configure it. 
Open your Web Browser and access the following URL: `http://localhost:47990`.
Configure your username and password by typing twice as mentioned on the page.
Reload the page with F5 and you should be redirected to the main page. If everything is working as intended, you should have a page mostly like this. If, instead, you have a big red alert on your screen, redo the steps above to fix the issue.
Go to `Configuration`, the tab `Audio/Video`, and set the `Display Number` as 1 if you don't have any additional display connected to your computer. If otherwise you have, set this value as 2.
Go to `Applications` and add commands needed for creating the virtual screen to be shared by Sunshine with the iPad or your gadget device.
 Click on add
Define `Application Name` as `Second Screen`
At `command preparations`, click on the green plus (+) button.
Add on `Do Command` as is `flatpak-spawn --host /home/username/.local/bin/virtual-screen.sh create`
To the `Undo Command`, set it as `flatpak-spawn --host /home/junior/.local/bin/virtual-screen.sh remove`
## Windows
Let's be clear, I don't have anything against Windows and I don't think that Windows is a bad operating system in any circumstances. I just don't like to use a bloated-resource-hungry OS that looks over my shoulder at everything that I'm doing, consuming precious machine resources that I paid for to try to sell me things that I don't want have and not allowing me to disable those things to save machine resources or to customize the OS as my wish. For example, Why I could place the Start Menu (or Windows Menu, I don't know) anchored to the screen or at the left, but not at the right? If I wanna, I would place the Start Menu everywhere I want to on the operating system that I overpaid for. But let's stop complaining about Windows and do the proposed job.
The process is mostly the same as on Linux, with the difference of Windows not being capable of creating a new virtual display out-of-the-box. To do so, we have two ways. Using a headless HDMI dongle, which is simple, but junky, or installing a virtual display driver, with is a bit more complicated and still junky, but not so junky as plugging and unplugging and dumb device into your computer.
### HDMI Dongle
The intent for this little dongle is to trick Windows and the Display Adapter that there's a monitor plugged at some output. With that, there's no setup to be made. Just plug in some HDMI output from your Display Adapter and done. Your computer will think that you have another display connected and will start sending video to it, being able to share this screen with Sunshine and use it as a second display.
The solution is straightforward but assumes that you have a spare output available and that isn't the case all the time.
You also will need to change the resolution to match the tablet's resolution and not all dongles EDID make available the intended resolutions for this purpose. You can change the EDID firmware of your dongle, but if the idea is to make the configuration simple, changing the dongle's firmware isn't right the case you want.
### Virtual Display Driver
As mentioned, Windows doesn't offer an out-of-the-box solution for creating a new screen. If you don't want to use a dongle, because you don't have one or because you don't have a spare HDMI output hanging around, and you wanna have a better suitable configuration for the output resolution and even HDR support, the answer is to install a virtual display driver that creates a virtual video card emulating the behavior of connecting a monitor to that virtual video card and we do this by installing this software. https://github.com/itsmikethetech/Virtual-Display-Driver.
Download the software from here https://github.com/itsmikethetech/Virtual-Display-Driver
Unzip the file and enter it into the directory `IddSampleDriver`
Create the directory `C:\IddSampleDriver\` and copy option.txt to it. IMPORTANT!
Right-click on the installCert.bat file and click on `Run as Administrator`
 Ignore the concerned message of Windows bragging herself "I protected your computer" clicking on `more information` and then, on `Execute anyway`.
Click on `Yes` on the other concerned message about security.
Open `device manager` just type `device manager` in the search box from the taskbar.
Click on any device and then, on "Action" and "Add legacy driver". You will be presented with a Wizard. Click on "Next".
Click on "Add from a list" and click on "Next".
Select "Display adapters" and click on "Next".
Click on "have disk", and "search" and go to the directory containing the .inf file for the downloaded driver.
Select the only option "Virtual Display Driver by MTT" and click on "Next" and "Next".
If everything goes as intended, the screen will make a little close as a "vignette" and open up again. That means that the display driver was successfully installed and is working. The `option.txt` at the `C:\IddSampleDriver\` contains all the modes enabled. You can add or remove resolutions as your needs. In my case, 1024x768 and 2048x1546 are the only resolutions I intend to use. So I did the configuration of the `options.txt` file like this:
```txt
1
1024, 768, 60
2048,1536, 60
```
To enable and disable the display, you'll need to manually enable and disable the "Display options" with a right-click on your desktop.

### Sunshine
While the Virtual Display Driver is a little junky setup, installing Sunshine on Windows is a walk on the beach. Just download the latest release for the software from their Github https://github.com/LizardByte/Sunshine/releases/, and install it, again, ignoring the concerns of Windows.

### Sunshine Configuration
Here we configure in a similar way as did on Linux. Because I know that if you're installing the Windows version, you didn't read a word for the Linux installation, I'll repeat some steps. But if you did (let's be honest, I know you didn't) you'll see many resemblances, but are not identical.
Go to `http://localhost:47990`.
Ignore the security risk warning and click on "Go anyway".
Configure your username and password and update the page.
Log in with the newly created credentials.
Go to the output name and type the correct display name for the virtual display. If you don't know what the name is, Sunshine has a tool for that. Just open the containing installation of Sunshine `C:\Program Files\Sunshine\tools`. Right-click, open in Terminal, and then type `dxgi-info.exe`. The mine one was named `.\DISPLAY9`.
Just one more thing. With that, the Sunshine installation will be tied to this display, even if you are willing to play remotely. So, you'll need to do some ricing to use Sunshine with other purposes apart from extending the display.

## Install Moonlight on your ancient iPad
As mentioned in my disclaimer, Apple wants me to throw away my perfectly working iPad 3rd generation into a landfill and spend a grand on a new one and they do that by dropping support for old devices.
The recipe is simple. They cease new operating system releases, making these devices stuck into an older version of the OS, while dropping the software support for the OS running on it, making the system outdated and insecure. Time passes and the support is being dropped software by software, making the device useless. This iPad isn't capable of running native apps for all mainstream social networks or email clients, even being physically capable of doing so. This is programmed obsolescence, literally speaking, because their servers are programmed to do like so.
With that in mind, installing new software on these older devices is not an easy task. If you have the software in your library and this software offered support for the iOS version running on the gadget some moment in the past, luck to you. Apple still offers the choice of installing an older version of the app, which is up to our needs in the case of Moonlight. If you didn't have the software in your library, sorry to say, but you are in a bad situation, because Apple doesn't allow you to add outdated software to your library. To overcome that, you had two choices.
The easiest one is having a newer device (again, Apple bagging you to spend a grand on a new one). On this newer device, if the iOS version running on it is sufficiently newer, you will be allowed to add Moonlight to your library through this device and then, install the older version on your older device. Luck on me, my cousin kindly gave me an iPhone 6s that serves that purpose well. The other way around is using some jailbreak solution that I do not get into in this article. I already have created many problems with Apple and don't want to create a new one.

## Setup Moonlight
From this moment on, it's just a matter of configuring Moonlight on your Tablet. This step is very self-explanatory but, anyway, let's do it together.
Open Moonlight
Your computer should be available with a padlock in the middle. If not, double-check if Sunshine service is up and running and if does, redo the steps about Firewall.
Tap your computer. A pin-number will be displayed on your Tablet. Go to your computer, browse to `http://localhost:47990`, log in, and click on the Pin tab.
Input the PIN displayed on your Tablet.
The padlock will disappear. Now tap your computer again.
You will have an option named `Second Screen`. If not, redo the steps on the Sunshine configuration.
Tap on the second screen. Your computer will create a new screen and display it on your tablet. If instead, you have a mirror of the main display or got an error mentioning that were unable to start the application, verify if you correctly created the script on Script for adding the virtual screen making sure that the script is up to your Compositor and the Sunshine Configuration. If you haven't installed the Flatpak version of Sunshine and, instead, installed the package for your distro, remove `flatpak-spawn --host` from the commands on the Application configuration step.
When you're done using the second screen, go back swiping back the screen, hold the finger on the `Second Screen` application, and tap `Quit app`. The created virtual screen will be unavailable.
 

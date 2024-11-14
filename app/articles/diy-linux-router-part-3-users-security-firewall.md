---
title: "DIY Linux Router - Part 3 - Users, Security and Firewall"
articleId: "diy-linux-router-part-3-users-security-firewall"
date: "2024-10-08"
author: "Carlos Junior"
category: "Linux"
brief: "In this third part of our series, let's increase security by creating users, changing SSH auth and hardening firewall configuration"
image: "/assets/images/diy-linux-router/fire-of-wall.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-3-usuarios-seguranca-firewall"}]
---

This is the third part of a multi-part series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Wifi](/article/diy-linux-router-part-5-wifi)
- Part 6: [Nextcloud and Jellyfin](/article/diy-linux-router-part-6-nextcloud-jellyfin)

In the first and second parts, we installed the operating system, configured the network, and set up the Mac Mini to work as a router.
In this part, we will increase security by creating users, changing SSH authentication, and hardening the firewall configuration.

![Fire of wall](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Wall of Fire](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Table of Contents

- [Users](#users)
- [Firewall](#firewall)
- [Conclusion](#conclusion)

## Users

Create intended users. You can create whatever user you need. In my case, I will have three: one to act as an **administrator** user named `admin`, another for **rootless containers** as `podman`, and another named `git` to have a personal and private **Git** repository.

### 1. Generate Hashed Password (optional)

This step is optional, as the intended way to authenticate on the server is through SSH using `SSH Keys`, but you can create a password if you want to ask for one when using `sudo` or authenticating locally.

Create a password for the `admin` user. A password for the `git` user is not necessary, as it will be authenticated using an `ssh key`.

```bash
mkpasswd --method=SHA-512
Password: #type the password (hackme00)
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

#### 2. SSH Keys

You can generate your private and public key pair or use an existing one. For example, if you have a GitHub account, you can use the keys generated when you [create a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

Execute the following SSH key generation steps on your computer.

```bash
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/router-admin
```

```txt
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase): 
Enter the same passphrase again: 
Your identification has been saved in /root/.ssh/router-admin
Your public key has been saved in /root/.ssh/router-admin.pub
The key fingerprint is...
```

Retrieve your SSH public keys and copy the content:

```bash
cat ~/.ssh/router-admin.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... your_email@example.com
```

Keep your private key safe and do not share it with anyone.

Repeat the same process for every user you want to create.

### 3. Create `users.nix` in `/etc/nixos/modules/`

Access the server via SSH using the user `root` and the `password` defined during the installation in [part 1](/article/diy-linux-router-part-1-initial-setup) of this tutorial and do as follows:

Create your users. Replace the `authorization.keys` with the one generated above as `~/.ssh/router.pub`.

`/etc/nixos/modules/users.nix`

```nix
{ config, pkgs, ... }: {
  users.users = {
    # Admin user
    admin = {
      isNormalUser = true;
      description = "Administrator User";
      home = "/home/admin"; # Home directory
      extraGroups = [ "wheel" ]; # Add the user to the 'wheel' group for sudo access
      hashedPassword = "$6$rounds=656000$example$hashedpassword"; # Password, optional
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
    };

    # Podman User for rootless pods
    podman = {
      isNormalUser = true;
      description = "Podman Rootless";
      home = "/home/podman";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
      linger = true; # Lingering enables systemd user services to start up without logging into user account.
    };

    # Git user
    git = {
      isNormalUser = true;
      description = "Git";
      home = "/home/git";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
    };
  };

  # Enable sudo for users in the 'wheel' group
  security.sudo = {
    enable = true;
    wheelNeedsPassword = true;  # Optional: require a password for sudo. Set as false to allow passwordless sudo or you had not specified a password for the admin user.
  };
}
```

Add the `users.nix` file to `configuration.nix`.

`/etc/nixos/configuration.nix`

```nix
...
  imports = [
    ... # Other imports
    ./modules/users.nix
  ];
...
```

### 4. Disable password authentication over SSH

Disable password authentication and `root` login through **SSH**.

`/etc/nixos/modules/services.nix`

```nix
  services = { 
  ...
    openssh = {
      enable = true;
      settings.PermitRootLogin = "no";
      settings.PasswordAuthentication = false;
    };
  ...
  };
```

### 5. Update the configuration and try to log in

Rebuild the config:

```bash
nixos-rebuild switch
```

Try to log in to the server using the `admin` using the private key generated earlier.

```bash
ssh -i ~/.ssh/router-admin admin@10.1.1.1
```

### 6. Add to SSH configuration file

If you do not want to type `ssh -i ~/.ssh/router-admin admin@10.1.1.1` everytime to authenticate into the serverm, configure the file `~/.ssh/config` as following:

```yaml
Host router-admin
  Hostname 10.1.1.1
  user admin
  IdentityFile ~/.ssh/router-admin

Host router-podman
  Hostname 10.1.1.1
  user podman
  IdentityFile ~/.ssh/router-podman

Host router-git
  Hostname 10.1.1.1
  user git
  IdentityFile ~/.ssh/router-git
```

Teste o acesso **SSH** sem informar o arquivo de chaves.

```bash
ssh router-admin
```

### 7. Lock the root Account (optional)

Lock the `root` account increases the security of our server. It's not mandatory, but it's a good practice.

**CAUTION** If you do not have a password for the `admin` account, locking the `root` account will prevent you from logging in locally, but only through **SSH**. Also, make sure you have created the `admin` account and added it to the `wheel` group.

```bash
passwd -l root
```

## Firewall

We configured our users, and now let's increase Firewall security.

So far, what we did on our firewall was:

- Allow all traffic incoming from the **Home** network.
- Block any traffic incoming from **Internet**, **Guest**, and **IoT** except the internet access.

The server is quite secure this way, but a more granular control over traffic is desirable, as it ensures that if any of the configured services open an additional port on our server, traffic to that port will not be automatically initiated. With this in mind, let's update our Firewall allowing only the necessary traffic. For **Home**, **Guest**, and **IoT** networks, we'll enable only the **DHCP** service. For the **Home** network, in addition to **DHCP**, we'll allow access to **SSH**. We'll also enable **SSH** on **the Internet** to allow remote access. Update our `nftables.nft` file.

`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  # Keep the rest of the rules as is.

  # Add the following chains to `inet filter` table.
  chain ssh_input {
    iifname "br0" tcp dport 22 ct state { new, established } counter accept comment "Allow SSH on LAN"
    iifname "ppp0" tcp dport 22 ct state { new, established } limit rate 10/minute burst 50 packets counter accept comment "Allow SSH traffic from ppp0 interface with rate limiting"
  }

  chain dhcp_input {
    iifname { "br0", "enge0.30", "enge0.90" } udp dport 67 ct state { new, established } counter accept comment "Allow DHCP on LAN, Guest and IoT networks"
  }

  chain input {
    type filter hook input priority filter; policy drop;

    iifname "lo" counter accept
    
    jump ssh_input
    jump dhcp_input
    
    # Remove the following rule:
    # iifname "lan" counter accept
     
    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" counter drop
  }
  
  #Let `chain output`, `chain forward` and `table ip nas` as is.
...
}
```

### Rebuild the configuration and test

```bash
nixos-rebuild switch
```

Logout and try to log in to the server using the `admin` using the private key generated earlier.

## Conclusion

This wraps up this subject. In the next part, it's time to install **POdman** and configure our **DNS Server** with Unbound on it.

- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)

---
title: "DIY Linux Router - Part 3 - Users, Security and Firewall"
articleId: "diy-linux-router-part-3-users-security-firewall"
date: "2024-10-08"
author: "Carlos Junior"
category: "Linux"
brief: "In this third part of our series, let's increase security by creating users, changing SSH auth and hardering firewall configuration"
image: "/assets/images/diy-linux-router/network.webp"
keywords : ["macmini","router", "linux", "nixos", "pppoe", "unifi", "ubiquiti", "apple", "vlan", "tl-sg108e"]
lang : "en"
other-langs : [{"lang":"pt","article":"roteador-linux-parte-2-rede-e-internet"}]
---

This is the third part of a multipart series describing how to build your own Linux router.

* Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
* Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)

In the first and second part, we installed the operating system, configured network, configured the Mac Mini to work as a router.
In this part, we will increase the security by creating users, changing SSH auth and hardering firewall configuration.

![Fire of wall](/assets/images/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Wall of fire](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Users

Let's create our intended users. In my case, I need to have two. One to act as administrator user named `admin` and other with the name `git` user to have a personal and private **Git** repository.

### 1. Generate HashedPassword (optional)

This step is optional, as the intended way to authenticate on server is through SSH using `ssh keys`, but can be created if you want to ask for password when using `sudo` or authenticate locally.

Create passwords for user `admin`. Password for the `git` user is not necessary, as will be authenticated using `ssh key`.

```bash
mkpasswd --method=SHA-512
Password: #type the password (hackme00)
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

Generate your public ssh keys by typing on your local machine. More details how to generate keys [at this link](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

```bash
ssh-keygen -C "user@machine_name"
Enter file in which to save the key (/home/myuser/.ssh/id_rsa):
Enter passphrase (empty for no passphrase): 
Enter same passphrase again: 
...
```

Retrieve your SSH Public keys and copy the content

```bash
cat ~/.ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@machine_name
```

### 2. Create `users.nix` on `/etc/nixos/modules/`

Create your users. Replace the `authorization.keys` with the one generated above

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
      hashedPassword = "$6$rounds=656000$example$hashedpassword"; # Passowrd, optional
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
    };

    # Git user
    git = {
      isNormalUser = true;
      description = "Git User";
      home = "/home/git";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
    };
  };

  # Enable sudo for users in the 'wheel' group
  security.sudo = {
    enable = true;
    wheelNeedsPassword = true;
  };
}
```

Add the `users.nix` file to `configuration.nix`

`/etc/nixos/configuration.nix`

```nix
{ config, pkgs, ... }:
{
...
  imports = [
    ./modules/networking.nix
    ./modules/firewall.nix
    ./modules/services.nix
    ./modules/pppoe.nix
    ./modules/dhcp_server.nix
    ./modules/users.nix
  ];
...
}
```

### 3. Disable password authentication over SSH

Disabling password authentication increases the security, as the user will only be allowed do log in thought `ssh keys`. Also disabling `root` authentication its a good measure.

`/etc/nixos/modules/services.nix`

```nix
{config, pkgs, ... }: {
  # Enable SSH service
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = false;
    };
  };
}
```

### 4. Update the configuration and try to log in

Rebuild the config

```bash
nixos-rebuild switch
```

## Firewall

We configured our users and now, let's increase Firewall security.

So far, what we did on our firewall was

* Allow all traffic incomming from `lan` network.
* Block any traffing incomming from `wan pppoe` and `guest`.

Is fairy secure at this way, but have a more granular control about the traffic incomming is better, because at that way, we garantee that if some unitended service starts on our server, it's doasn't allow incomming traffic. So, instead of allowing all traffic from `lan` let's only allow `ssh` and `dhcp-client` service ports. We will increase this list over the time, as we enables other services like `dns` using **Unbound**, **samba**, and **NFS** for file sharing or **jellyfin** for Media Service.

### 1. Replace the **chain input** section with

`/etc/nixos/modules/nftables.nft`

```nix
table inet filter {
  chain ssh_input {
      iifname "lan" tcp dport 22 ct state { new, established } counter accept 
        comment "Allow SSH on LAN"
      
      iifname "ppp0" tcp dport 22
        limit rate 10/minute burst 50 packets 
        ct state { new, established } accept
        comment "Allow SSH traffic from ppp0 interface with rate limiting";
  }

  chain dhcp_input {
      iifname { "lan", "guest" } udp dport 67 
        ct state { new, established }
        counter accept comment "Allow DHCP on LAN and Guest"
    }

  chain input {
    type filter hook input priority filter; policy drop;

    jump ssh_input;
    jump dhcp_input;

    # Allow returning traffic from ppp0 and drop everything else
    iifname "ppp0" ct state { established, related } counter accept;
    iifname "ppp0" drop;
  }
...
}
```

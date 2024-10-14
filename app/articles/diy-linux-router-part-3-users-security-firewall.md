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

This is the third part of a multipart series describing how to build your own Linux router.

- Part 1: [Initial Setup](/article/diy-linux-router-part-1-initial-setup)
- Part 2: [Network and Internet](/article/diy-linux-router-part-2-network-and-internet)

In the first and second parts, we installed the operating system, configured the network, and set up the Mac Mini to work as a router.
In this part, we will increase security by creating users, changing SSH authentication, and hardening the firewall configuration.

![Fire of wall](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Wall of fire](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Table of Contents

- [Users](#users)
  - [1. Generate Hashed Password (optional)](#1-generate-hashed-password-optional)
  - [2. Create `users.nix` in `/etc/nixos/modules/`](#2-create-usersnix-in-etcnixosmodules)
  - [3. Disable password authentication over SSH](#3-disable-password-authentication-over-ssh)
  - [4. Update the configuration and try to log in](#4-update-the-configuration-and-try-to-log-in)
- [Firewall](#firewall)
- [Conclusion](#conclusion)

## Users

Let's create our intended users. In my case, I need to have two: one to act as an administrator user named `admin` and another named `git` to have a personal and private **Git** repository.

### 1. Generate Hashed Password (optional)

This step is optional, as the intended way to authenticate on the server is through SSH using `ssh keys`, but you can create a password if you want to ask for one when using `sudo` or authenticating locally.

Create a password for the `admin` user. A password for the `git` user is not necessary, as it will be authenticated using an `ssh key`.

```bash
mkpasswd --method=SHA-512
Password: #type the password (hackme00)
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

Generate your public SSH keys by typing on your local machine. More details on how to generate keys can be found [at this link](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

```bash
ssh-keygen -C "user@machine_name"
Enter file in which to save the key (/home/myuser/.ssh/id_rsa):
Enter passphrase (empty for no passphrase): 
Enter same passphrase again: 
...
```

Retrieve your SSH public keys and copy the content:

```bash
cat ~/.ssh/id_rsa.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@machine_name
```

### 2. Create `users.nix` in `/etc/nixos/modules/`

Create your users. Replace the `authorization.keys` with the one generated above.

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

Add the `users.nix` file to `configuration.nix`.

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

Disabling password authentication increases security, as the user will only be allowed to log in through `ssh keys`. Also, disabling `root` authentication is a good measure.

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

Rebuild the config:

```bash
nixos-rebuild switch
```

## Firewall

We configured our users, and now let's increase Firewall security.

So far, what we did on our firewall was:

- Allow all traffic incoming from the `lan` network.
- Block any traffic incoming from `wan pppoe` and `guest`.

It is fairly secure this way, but having more granular control over the incoming traffic is better because it guarantees that if some unintended service starts on our server, it doesn't allow incoming traffic. So, instead of allowing all traffic from `lan`, let's only allow `ssh` and `dhcp-client` service ports. We will increase this list over time as we enable other services like `dns` using **Unbound**, **samba**, and **NFS** for file sharing or **jellyfin** for Media Service. On NixOS, it is fairly easy to set up our firewall by updating the `nftables.nft` file.

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

This setup has created a discrete configuration for services enabled on our server. In this case, it only allows the `DHCP` service for `lan` and `guest` networks, and enables `ssh` for both `lan` and `ppp0`. You might think that allowing SSH traffic to our server is a security breach, but as long as we increased the security on `SSH` by blocking users from logging in with a password, allowing this traffic is up to security standards. Also, to make it difficult for any attempt to brute force the security encryption of our server, we have configured a rule to allow only **10 new connections per minute**.

## Conclusion

This wraps up this subject. In the next part, it's time to install `podman` and configure our DNS Server with Unbound on it.

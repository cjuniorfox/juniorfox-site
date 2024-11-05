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
- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)
- Part 5: [Nextcloud and Jellyfin](/article/diy-linux-router-part-5-nextcloud-jellyfin)

In the first and second parts, we installed the operating system, configured the network, and set up the Mac Mini to work as a router.
In this part, we will increase security by creating users, changing SSH authentication, and hardening the firewall configuration.

![Fire of wall](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Wall of fire](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Table of Contents

- [Users](#users)
- [Firewall](#firewall)
- [Conclusion](#conclusion)

## Users

Let's create our intended users. You can create wherever user you need. In my case, I will have two: one to act as an administrator user named `admin` and another named `git` to have a personal and private **Git** repository.

### 1. Generate Hashed Password (optional)

This step is optional, as the intended way to authenticate on the server is through SSH using `ssh keys`, but you can create a password if you want to ask for one when using `sudo` or authenticating locally.

Create a password for the `admin` user. A password for the `git` user is not necessary, as it will be authenticated using an `ssh key`.

```bash
mkpasswd --method=SHA-512
Password: #type the password (hackme00)
$6$ZeLsWXraGkrm9IDL$Y0eTIK4lQm8D0Kj7tSVzdTJ/VbPKea4ZPf0YaJR68Uz4MWCbG1EJp2YBOfWHNSZprZpjpbUvCIozbkr8yPNM0.
```

#### 2. SSH Keys

You can generate your private and public key pair or using a pair that you already have. For example, if you have a GitHub account, you can use the keys generated when you [create a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

Execute the following SSH key generation steps on your computer, not on the router server.

```bash
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/router-admin
```

```txt
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase): 
Enter same passphrase again: 
Your identification has been saved in /root/.ssh/router-admin
Your public key has been saved in /root/.ssh/router-admin.pub
The key fingerprint is...
```

Retrieve your SSH public keys and copy the content:

```bash
cat ~/.ssh/router-admin.pub
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... your_email@example.com
```

Be aware that maintaining your router's private key can be a security risk. If you lose this private key, you'll lose access to the server. You should keep it in a safe place and not share it with anyone.

Repeat the same process for every user you want to create. In my case, I repeated the process for the `git` user. You can use the same private key with many users if you want, but I consider this a security risk.

### 3. Create `users.nix` in `/etc/nixos/modules/`

Access the server via SSH using the user `root` and the `password` defined during the installation in the [part 1](/article/diy-linux-router-part-1-initial-setup) of this tutorial and do as follows:

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

Disabling password authentication increases security, as the user will only be allowed to log in through `ssh keys`. Also, disabling `root` authentication is a good measure.

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
Host macmini
  Hostname 10.1.1.1
  user admin
  IdentityFile ~/.ssh/router-admin

Host macmini
  Hostname 10.1.1.1
  user admin
  IdentityFile ~/.ssh/router-git
```

Teste o acesso **SSH** sem informar o arquivo de chaves.

```bash
ssh admin@macmini
```

### 7. Lock the root Account (optional)

Lock the `root` account increases the security of our server. It's not mandatory, but it's a good practice.

**CAUTION** If you didn't had configured a password for the `admin` account, locking the `root` account will prevent you from logging in to the server locally, but only through `ssh`. Make sure you have created the `admin` account and it's being part of the `wheel` group.

```bash
passwd -l root
```

## Firewall

We configured our users, and now let's increase Firewall security.

So far, what we did on our firewall was:

- Allow all traffic incoming from the `lan` network.
- Block any traffic incoming from `wan pppoe` and `guest` except the internet access.

The server is quite secure this way, but a more granular control over traffic is desirable, as it ensures that if any of the configured services opens an additional port on our server, traffic to that port will not be automatically initiated. With this in mind, let's update our firewall to allow only the necessary traffic for our server. For the `lan`, `guest`, and `iot` networks, we'll enable only the `dhcp` service. For the `lan` network, in addition to `dhcp`, we'll allow access to `ssh`. We'll also enable `ssh` on `ppp0` to allow remote access. As we enable new services on our server, we'll open new ports. In NixOS, it's quite easy to configure our firewall by simply updating the `nftables.nft` file.
`/etc/nixos/modules/nftables.nft`

```conf
table inet filter {
  # Keep `flowtable` and all existing firewall rules.

  # Add the following chains to `inet filter` table.
  chain ssh_input {
    iifname "lan" tcp dport 22 ct state { new, established } counter accept comment "Allow SSH on LAN"
    iifname "ppp0" tcp dport 22 ct state { new, established } limit rate 10/minute burst 50 packets counter accept comment "Allow SSH traffic from ppp0 interface with rate limiting"
  }

  chain dhcp_input {
    iifname { "lan", "guest", "iot" } udp dport 67 ct state { new, established } counter accept comment "Allow DHCP on LAN, Guest and IoT networks"
  }

  # Replace `chain input` to this one.
  chain input {
    type filter hook input priority filter
    policy drop

    jump ssh_input
    jump dhcp_input

    iifname "ppp0" ct state { established, related } counter accept
    iifname "ppp0" counter drop
  }
  
  #Let `chain output`, `chain forward` and `table ip nas` as is.
...
}
```

This setup has created a discrete configuration for services enabled on our server. In this case, it only allows the `DHCP` service for `lan`, `guest` and `iot` networks, and enables `ssh` for both `lan` and `ppp0`. You might think that allowing **SSH** traffic to our server is a security breach, but as long as we increased the security on `SSH` by blocking users from logging in with a password, allowing this traffic is up to security standards. Also, to make it difficult for any attempt to brute force the security encryption of our server, we have configured a rule to allow only **10 new connections per minute**.

### Rebuild the configuration and test

```bash
nixos-rebuild switch
```

Logout and try to log in to the server using the `admin` using the private key generated earlier.

## Conclusion

This wraps up this subject. In the next part, it's time to install `podman` and configure our **DNS Server** with Unbound on it.

- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)

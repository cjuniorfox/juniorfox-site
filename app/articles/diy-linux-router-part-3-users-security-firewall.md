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
- [Impermanence Storage](/article/diy-linux-router-impermanence-storage)

In the first and second parts, we installed the operating system, configured the network, and set up the Mac Mini to work as a router.
In this part, we will increase security by creating users, changing SSH authentication, and hardening the firewall configuration.

![Fire of wall](/assets/images/diy-linux-router/fire-of-wall.webp)
*[EAA AirVenture Oshkosh 2013 Wall of Fire](http://www.vg-photo.com/airshow/2013/Oshkosh/pyro.html)*

## Table of Contents

- [Users](#users)
- [Firewall](#firewall)
  - [Current Setup](#current-setup)
  - [Planned Enhancements](#planned-enhancements)
  - [Organizing the Firewall Configuration](#organizing-the-firewall-configuration)
  - [Set up files](#set-up-files)
- [Conclusion](#conclusion)

## Users

Create intended users. You can create whatever user you need. In my case, I will have three: one to act as an **administrator** user named `admin`, another for **rootless containers** as `podman`, and another named `git` to have a personal and private **Git** repository.

### 1. Generate Hashed Password (optional)

This step is optional, as the intended way to authenticate on the server is through SSH using `SSH Keys`, but you can create a password if you want to ask for one when using `sudo` or authenticating locally.

Create a password for the `admin` user. A password for the `git` user is not necessary, as it will be authenticated using an `ssh key`.

```bash
mkpasswd --method=SHA-512
Password: #type the password (hackme00)
```

```txt
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
  users.users.root.initialHashedPassword = "##HashedPa$$word"; # You can remove this line if you do not want to log directly with root user.
  users.users = {
    # Admin user
    admin = {
      uid = 1000;
      isNormalUser = true;
      description = "Administrator User";
      home = "/home/admin"; # Home directory
      extraGroups = [ "wheel" ]; # Add the user to the 'wheel' group for sudo access
      initialHashedPassword = "$6$rounds=656000$example$hashedpassword"; # Password, optional
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
    };

    # Podman User for rootless pods
    podman = {
      uid = 1001;
      isNormalUser = true;
      description = "Podman Rootless";
      home = "/home/podman";
      group = "containers";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
      linger = true; # Lingering enables systemd user services to start up without logging into user account.
    };

    # Git user
    git = {
      uid = 1002;
      isNormalUser = true;
      description = "Git";
      home = "/home/git";
      openssh.authorizedKeys.keys = [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."  # Replace with the actual public key
      ];
    };
  };
  users.groups.containers = {
    gid = 993;
    members = [ "podman" ];
  }

  # Enable sudo for users in the 'wheel' group
  security.sudo = {
    enable = true;
    wheelNeedsPassword = true;  # Optional: require a password for sudo. Set as false to allow passwordless sudo or if you not set a password for the admin user.
  };
}
```

### 4. Disable password authentication over SSH

Disable password authentication and `root` login through **SSH**.

`/etc/nixos/modules/services.nix`

```nix
  services = { 
  ...
    openssh = {
      enable = true;
      settings.PermitRootLogin = "no"; # Was "yes". Change to "no" to disable
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
ssh -i ~/.ssh/router-admin admin@10.1.78.1
```

### 6. Add to SSH configuration file

If you do not want to type `ssh -i ~/.ssh/router-admin admin@10.1.78.1` everytime to authenticate into the serverm, configure the file `~/.ssh/config` as following:

```yaml
Host router-admin
  Hostname 10.1.78.1
  user admin
  IdentityFile ~/.ssh/router-admin

Host router-podman
  Hostname 10.1.78.1
  user podman
  IdentityFile ~/.ssh/router-podman

Host router-git
  Hostname 10.1.78.1
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

Certainly! Here's the improved version as Markdown:

## Firewall

With our user configurations complete, it's time to enhance our firewall security.

### Current Setup

So far, our firewall configuration includes:

- Allowing all incoming traffic from the **LAN** network.
- Blocking all incoming traffic from **WAN**, **Guest**, and **IoT** networks except for internet access.

While this setup provides a basic level of security, we can achieve better protection through more granular traffic control. By doing so, we ensure that if any service unintentionally opens additional ports on the server, unauthorized traffic will not be allowed through.

### Planned Enhancements

We will refine our firewall to allow only the traffic necessary for each network:

- **LAN** network: Allow **DHCP** and **SSH** services.
- **Guest** and **IoT** networks: Allow only **DHCP** service.
- **WAN**: Enable **SSH** for remote access.

### Organizing the Firewall Configuration

To simplify management and ensure scalability, we will structure our firewall configuration into logical sections. This approach divides interfaces, rules, and services into **zones** and organizes the configuration across multiple files. The structure will look as follows:

#### **INET Table** (Main firewall rules)

- **`sets.nft`**: Map **interfaces** to their respective **zones**.
- **`services.nft`**: Define chains for **service** ports, such as **SSH** and **HTTP**.
- **`zones.nft`**: Specify which **services** are allowed in each **zone**.
- **`rules.nft`**: Configure **rules** for zones and manage traffic flow.

#### **NAT Table** (Network Address Translation rules)

- **`nat_sets.nft`**: Map **interfaces** to their respective **zones**.
- **`nat_chains.nft`**: Define NAT chains for tasks like port redirection.
- **`nat_zones.nft`**: Associate NAT chains with **zones**.
- **`nat_rules.nft`**: Configure NAT rules for zones.

This modular approach will make the firewall configuration more organized, easier to understand, and simpler to maintain or extend in the future.

### Set up files

#### 1. Remove the nftables.nft file

As we will split the nftables into discrete files, there's no need to use this file anymore. You can delete or just let inactive.

```bash
rm /etc/nixos/modules/nftables.nft
```

#### 2. Create the the NFTables Configuration Files

Create the directory and all **NFTables** files needed.

```bash
mkdir -p /etc/nixos/nftables
touch /etc/nixos/nftables/{nat_chains,nat_rules,nat_sets,nat_zones,rules,services,sets,zones}.nft
```

Configure every intended **NFTable** file.

##### sets.nft

Let's make use of variables to address the interfaces name dinamically.

```bash
cat << EOF > /etc/nixos/nftables/sets.nft 
table inet filter {
  set WAN {
    type ifname;
    elements = { \$if_wan }
  }

  set LAN {
    type ifname;
    elements = { \$if_lan }
  }

  set GUEST {
    type ifname;
    elements = { \$if_guest }
  }

  set IOT {
    type ifname;
    elements = { \$if_iot }
  }
}
EOF
```

##### services.nft

```bash
cat << EOF > /etc/nixos/nftables/services.nft
table inet filter {
  chain dhcp_input {
    iifname { "br0", "enge0.30", "enge0.90" } udp dport 67 ct state { new, established } counter accept comment "Allow DHCP on LAN, Guest and IoT networks"
  }

  chain echo_input {
    icmp type echo-request accept
    icmp type echo-reply accept
  }

  chain public_ssh_input {
    tcp dport 22 ct state { new, established } limit rate 10/minute burst 50 packets counter accept comment "Allow SSH traffic with rate limiting"
  }

  chain ssh_input {
    iifname "br0" tcp dport 22 ct state { new, established } counter accept comment "Allow SSH on LAN"
    iifname "ppp0" tcp dport 22 ct state { new, established } limit rate 10/minute burst 50 packets counter accept comment "Allow SSH traffic from ppp0 interface with rate limiting"
  }
}
EOF 
```

##### zones.nft

```bash
cat << EOF > /etc/nixos/nftables/zones.nft
table inet filter {
  chain LAN_INPUT {
    jump dhcp_input
    jump echo_input
    jump ssh_input
  }

  chain GUEST_INPUT {
    jump dhcp_input
    jump echo_input
  }

  chain IOT_INPUT {
    jump dhcp_input
    jump echo_input
  }

  chain WAN_INPUT {
    jump public_ssh_input
  }
}
EOF 
```

##### rules.nft

```bash
cat << EOF > /etc/nixos/nftables/rules.nft
table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;
    iifname "lo" counter accept

    iifname @LAN jump LAN_INPUT 
    iifname @GUEST jump GUEST_INPUT
    iifname @IOT jump IOT_INPUT
    iifname @WAN jump WAN_INPUT
 
  
    # Allow returning traffic from ppp0 and drop everything else
    iifname @WAN ct state { established, related } counter accept
  }

  chain output {
    type filter hook output priority 100; policy accept;
  }

  chain forward {
    type filter hook forward priority filter; policy drop;
    iifname @LAN  oifname @WAN counter accept comment "Allow trusted LAN to WAN"
    iifname @WAN oifname @LAN ct state established,related counter accept comment "Allow established back to LANs"
    
    iifname @GUEST  oifname @WAN counter accept comment "Allow trusted GUEST to WAN"
    iifname @WAN oifname @GUEST ct state established,related counter accept comment "Allow established back to GUEST"
  
    iifname @IOT  oifname @WAN counter accept comment "Allow trusted IOT to WAN"
    iifname @WAN oifname @IOT ct state established,related counter accept comment "Allow established back to IOT"

    #Drop traffic between networks
    iifname @GUEST oifname @LAN drop comment "Drop connections from GUEST to LAN"
    iifname @IOT oifname @LAN drop comment "Drop connections from IOT to LAN"
    iifname @GUEST oifname @IOT drop comment "Drop connections from GUEST to IOT"
    iifname @IOT oifname @GUEST drop comment "Drop connection from IOT to GUEST"
    
    #MSS Clamp
    oifname @WAN tcp flags syn tcp option maxseg size set 1452
  }
}
EOF 
```

##### nat_sets.nft

```bash
cat << EOF > /etc/nixos/nftables/nat_sets.nft
table nat {
  set WAN {
    type ifname;
    elements = { \$if_wan }
  }

  set LAN {
    type ifname;
    elements = { \$if_lan }
  }

  set GUEST {
    type ifname;
    elements = { \$if_guest }
  }

  set IOT {
    type ifname;
    elements = { \$if_iot }
  }
}
EOF
```

##### nat_chains.nft

**NAT Chains** will be created as empty for now.

```bash
cat << EOF > /etc/nixos/nftables/nat_chains.nft 
table ip nat {
}
EOF
```

##### nat_zones.nft

As far as there's no **redirect chains**, **NAT zones** will be created with empty chains for now.

```bash
cat << EOF > /etc/nixos/nftables/nat_zones.nft
table ip nat {
  chain LAN_PREROUTING {
  }

  chain GUEST_PREROUTING {
  }

  chain IOT_PREROUTING {
  }

  chain WAN_PREROUTING {
  }
}
EOF
```

##### nat_rules.nft

```bash
cat << EOF > /etc/nixos/nftables/nat_rules.nft
table ip nat {
  chain prerouting {
    type nat hook prerouting priority filter; policy accept;
    iifname @LAN jump LAN_PREROUTING 
    iifname @GUEST jump GUEST_PREROUTING 
    iifname @IOT jump IOT_PREROUTING 
    iifname @WAN jump WAN_PREROUTING 
  }

  chain postrouting {
    type nat hook postrouting priority filter; policy accept;
    oifname @WAN tcp flags syn tcp option maxseg size set 1452
    oifname @WAN masquerade
  }
}
EOF
```

#### 3. Update the networking.nix Configuration File

Edit the **network** section of **networking.nix** configuration file as follows:
*Update just the **networking** section. Let the remaining of the file as is.*

`/etc/nixos/modules/networking.nix`

```nix
...
  networking = {
    useDHCP = false;
    firewall.enable = false;
    nftables = {
      enable = true;
      rulesetFile = pkgs.writeText "ruleset.conf" ''
        define if_wan = "ppp0"
        define if_lan = "${lan}"
        define if_guest = "${guest}"
        define if_iot =  "${iot}"
        define ip_lan = "${ip_lan}"
        define ip_guest = "${ip_guest}"
        define ip_iot = "${ip_iot}"
        
        # Inet filter, services and rules
        include "${../nftables/sets.nft}"
        include "${../nftables/services.nft}"
        include "${../nftables/zones.nft}"
        include "${../nftables/rules.nft}"

        # Nat & redirect
        include "${../nftables/nat_sets.nft}"
        include "${../nftables/nat_chains.nft}"
        include "${../nftables/nat_zones.nft}"
        include "${../nftables/nat_rules.nft}"
      '';
      flattenRulesetFile = true;
    };
  };
...
```

#### 4. Rebuild the configuration and test

```bash
nixos-rebuild switch
```

Logout and try to log in to the server using the `admin` using the private key generated earlier.

## Conclusion

This wraps up this subject. In the next part, it's time to install **POdman** and configure our **DNS Server** with Unbound on it.

- Part 4: [Podman and Unbound](/article/diy-linux-router-part-4-podman-unbound)

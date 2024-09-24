---
title: "What is Cloudflare?"
articleId: "what-is-cloudflare"
date: "2024-09-23"
author: "Carlos Junior"
category: "Network"
brief: "As is broadly known, so far I've been writing this article, since August 29, 2024. X, formerly Twitter is blocked in Brazil, but suddely, twitter services got back online. At least for certain time."
image: "/assets/images/what-is-cloudflare/twitter-cloudflare.webp"
keywords: ["twitter","x","cloudflare","network","webhost", "tunnel","firewall"]
lang: "pt"
other-langs: [{"lang":"pt","article":"o-que-e-cloudflare"}]
---

Since August 29, 2024, X (formerly Twitter) has been blocked in Brazil for violating election disinformation laws. However, on September 18, X briefly became accessible again. The reason? Cloudflare. The question lies on top of infringing Brazilian laws regarding disinformation during the elections. The subject is complex and I do not want to go deeper in this article.

![Twitter and Cloudflare](/assets/images/what-is-cloudflare/twitter-cloudflare.webp)

But, to the surprise of Brazilian Twitter users, on [September, 18, Twitter suddenly was accessible for all Brazilian people](https://www.bbc.com/portuguese/articles/c5y3xy47jxzo). Legally, nothing had changed. So why did Twitter suddenly get back to operating from the vail?

The answer? Cloudflare. Twitter just started to operate behind Cloudflare and then, every newspaper started to try to explain what is this Cloudflare thing. Is it a Shield? An armor that Elon Musk dressed Twitter against the Brazilian Supreme Curt? And why, if was so fail-proof against the Supreme Court, did Twitter go offline two days later? Let's explain and see how Cloudflare works in practice.

## What Cloudflare is for?

Long story short, Cloudflare acts as an intermediary between your online service, like a website or media server, and the internet, offering security and performance improvements. Like a website, blog, media server, and the internet. Ok. But why? Why add somebody between?

Various reasons. The first and most obvious is that Cloudflare acts as a protection, blocking attacks on your premises and handling SSL connections and certificates, instead of you, which is very cool.

Another good reason, is, that through Cloudflare zero trust network tunnel, it is possible to make services behind a private network without a valid IP address (CGNATed networks) available to the internet, like a Jellyfin media server or a file server (NAS) you could have in your home, surveillance cameras or having your online streaming media or even your private cloud storage available anywhere in the world.

![Macmini](/assets/images/what-is-cloudflare/macmini.webp)

You could think I have a big infrastructure with many employees or I'm using some big company to host this website, but no. This site is hosted on an ancient Mac Mini. Not only that but many of my services are deployed in that little Mac Mini.

As a Linux server connected to the internet 24/7, this is a valuable resource for those who want to commit crimes on the internet. It's just a matter of planting some malicious script and everything could happen. From somebody watching everything I'm doing on the internet, as crypto mining and even using it as a proxy for some illegal activity. So, Placing something between this server and the open internet is a great security measure.

## Advantages

- It's free!
- As mentioned, adds a security layer to your network by placing a middleman between you and internet requests.
- Manages the SSL certificates for you.
- Easy to use and configure.

## Disadvantages

- Relies on a third-party partner and their infrastructure.
- Opens a tunnel connection between your premises and a third party that If not properly managed, third-party services could gain visibility into your network traffic.
- The connections between your clients and Cloudflare are protected, but, despite the tunnel being secure, the data inside that tunnel isn't encrypted. Even if you up an HTTPS server, Cloudflare will decrypt the data and re-encrypt it with their certificate. Cloudflare can see all your traffic which means sensitive information like personal data or even passwords will be open to Cloudflare if your site deals with that kind of information.

Let's be honest here. Cloudflare is a reputable company having great partners on the market. It isn't known if they did spy on some of their clients, but this can happen if they wanted to do so. Like they named their own solution, zero trust. Just be aware when you send or receive sensitive information over their network.

## A technical perspective

To understand how Cloudflare operates and how it made Twitter accessible, let’s explore its core functionalities, including the [Zero trust tunnel](https://www.cloudflare.com/products/tunnel/) and publish a website on ease.

Since this blog covers the technical perspective of these subjects, let's take note of the services offered by Cloudflare, as do a step-by-step of how to setup a [Cloudflare zero trust tunnel](https://www.cloudflare.com/products/tunnel/) and publish a website on ease.

## Cloudflare zero trust network tunnel

After their DNS naming service manager, the most notable service they offer is Cloudflare's Zero Trust network tunnel. is through that service we can share local resources to the internet with ease. In that example, I will host a simple website page and make it available to the internet.

This step-by-step is highly based on that Youtube video from Raid Own. [Cloudflare Tunnel Setup Guide - Self-Hosting for EVERYONE](https://www.youtube.com/watch?v=hrwoKO7LMzk&t=649s). Consider checking out.

![Cloudflare network diagram](/assets/images/what-is-cloudflare/cloudflare-diagram.webp)

### Requirements

We will use a tool named **cloudflared**. This can be installed on any operating system. I’ll use Ubuntu Linux in this step-by-step guide. But first, make sure you have:

- Created your Cloudflare account.
- A FQDN (domain name).
- Linux machine hosting some Website.

### Tie your domain with Cloudflare

At the logged area of Cloudflare, add your domain to it and set the nameservers at your domain manager. This step varies from one provider to another. In my case, I'm using **Hostgator** and set the DNS naming like so.

![Hostgator setup](/assets/images/what-is-cloudflare/fqdn-domain-setup.webp)

Doing this configuration takes some moments (can take up to 24 hours) for the settings to become functional. As I'm already using Cloudflare, my domain is already activated.

![Cloudflare domain](/assets/images/what-is-cloudflare/cloudflare-mainpage.webp)

### Install Cloudflared

My Virtual Machine up and running. So, a configured to make the SSH connection to it and I'm accessing my server. This part is based at the [Cloudflare's start guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/).

#### 1. Install Cloudflared tool

```bash
# 1. Add Cloudflare’s package signing key:
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# 2. Add Cloudflare’s apt repo to your apt repositories:
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list

# 3. Update repositories and install cloudflared:
sudo apt-get update && sudo apt-get install cloudflared
```

#### 2. Authenticate on Cloudflare

Run the command below.

```bash
cloudflared tunnel login
```

Will be shown a big URL with an authentication string like this one. 

```bash
https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2FyO5QTw53edgtamTbyJb9TtlzHNnnDLNApcx3gSo%3D
```

Just copy and paste on your browser. An authorization screen will be shown

![Cloudflare authorize screen](/assets/images/what-is-cloudflare/cloudflare-login.webp)

Click on your domain and authorize. Cloudflare will automatically install a cert file at the user's home directory.

```bash
You have successfully logged in.
If you wish to copy your credentials to a server, they have been saved to:
/home/junior/.cloudflared/cert.pem
```

#### 3. Create a tunnel

To create a new tunnel, just do as below:

```bash
$ cloudflared tunnel create neotwitter
Tunnel credentials written to /home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json. cloudflared chose this file based on where your origin certificate was found. Keep this file secret. To revoke these credentials, delete the tunnel.

Created tunnel neotwitter with id d90fb39e-37c9-478a-b315-173cb83dd06c
```

Listing files at the directory `/home/junior/.cloudflared` you see a certificate authentication, and a json file with a big stream of characters, which is the same string as found on the Cloudflare tunnel ID. Select and copy your Tunnel ID string.

```bash
$ ls ~/.cloudflared/
cert.pem  d90fb39e-37c9-478a-b315-173cb83dd06c.json
```

### 4. Create our config.yml

As we are configuring our tunnel through Cloudflared utility, we need to create our config.yml file inside the `/home/user/.cloudflared/`. Is in that file that we will configure our ingresses to allow access to the website hosted on that machine.

```bash
$ touch ~/.cloudflared/config.yml 
```

Listing the files on the directory `.cloudflared` now we have 3 files.

```bash
ls ~/.cloudflared/
cert.pem  config.yml  d90fb39e-37c9-478a-b315-173cb83dd06c.json
```

Let's to the basic setup to our file, by configuring the tunnel ID on the config file.

```bash
$ vim ~/.cloudflared/config.yml
```

```vi
tunnel: d90fb39e-37c9-478a-b315-173cb83dd06c
credentials-file: /home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json 
```

The tunnel is the UUID for the tunnel we copied before. The credentials file is the home folder, followed by the UUID dot Json.

Save it and close vim if you're using vim with `:wq` .

#### 5\. Create the DNS entry

At that step, we create the DNS entry for some website. This is the URL the ones accessing your site will type at the browser to reach your site. You can do this step from Cloudflare panel, but as we are using `cloudflared` we can do this typing `cloudflared tunnel route dns <Tunnel UUID or Name> <hostname>`.

```bash
cloudflared tunnel route dns neotwitter neotwitter.juniorfox.net
```

#### 6. Ingress

Ingress entries are the configuration to make a website or service on your host or your network available to the internet. This can be any host or service on your Network like a website, a Nextcloud, or a Jellyfin media server. Doesan't matter. As far as is  HTTP or HTTPs server on your network, you can make it available. So, let's edit the `.cloudflared/config.yml`.

```bash
vim ~/.cloudflared/config.yml 
```

```bash
tunnel: d90fb39e-37c9-478a-b315-173cb83dd06c
credentials-file: /home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json 

ingress:
   - hostname: neotwitter.juniorfox.net
     service: https://192.168.122.130:80

   - service: http_status:404
```

#### 7. Running the tunnel

The last, but not least step is bringing up your tunnel. It's just a matter of running:

```bash
$ cloudflared tunnel run neotwitter
```

```bash
2024-09-23T20:52:13Z INF Starting tunnel tunnelID=d90fb39e-37c9-478a-b315-173cb83dd06c
2024-09-23T20:52:13Z INF Version 2024.9.1
2024-09-23T20:52:13Z INF GOOS: linux, GOVersion: go1.22.2, GoArch: amd64
2024-09-23T20:52:13Z INF Settings: map[cred-file:/home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json credentials-file:/home/junior/.cloudflared/d90fb39e-37c9-478a-b315-173cb83dd06c.json]
2024-09-23T20:52:13Z INF cloudflared will not automatically update if installed by a package manager.
2024-09-23T20:52:13Z INF Generated Connector ID: 791bd419-0cbd-4978-8997-2db17ec3804e
2024-09-23T20:52:13Z INF Initial protocol quic
2024-09-23T20:52:13Z INF ICMP proxy will use 192.168.122.130 as source for IPv4
2024-09-23T20:52:13Z INF ICMP proxy will use fe80::5054:ff:feb2:e120 in zone enp1s0 as source for IPv6
```

#### 8. Something went wrong

Testing neotwitter.juniorfox.net website, I got the following error:

![Bad gateway 502](/assets/images/what-is-cloudflare/bad-gateway-error.webp)

So, what went wrong? Let's have a look to the tunnel's log e see what happened.

![Execution log](/assets/images/what-is-cloudflare/error-log.webp)

I see what happened. It was unable to reach the `https://192.168.122.130:80` because the **NGINX server** is serving the site as a plain HTTP. Not HTTPs. Let's fix it and try it again.

```bash
vim ~/.cloudflared/config.yml 
```

![Fixed config.yml](/assets/images/what-is-cloudflare/fix-config.webp)

Start the tunnel another time

```bash
$ cloudflared tunnel run neotwitter
```

And browse to the neotwitter.juniorfox.net

![Neotwitter site is alive!](/assets/images/what-is-cloudflare/neotwitter.webp)

Looks like everything is working as intended now. It's also cool to already have the SSL connection done.

 It's nice to have build a drop-in-replacement for Twitter since it's no longer working in Brazil. Thank you for reading this topic until this point. I see you next time.

## Conclusion

This wraps up what is Cloudflare, an easy to use solution for helping anyone to put online a website on easy. I hope this article has helped you to understand what is the nature of Cloudflare, as helped you to put your site ou service available online.

# Link Tabs

Keeps every link an agent shares in Paseo a tap away in a Links pill above the composer, grouped by where it points, with the ones you pin in the bar.

Plugins are made with 🤍 for the Paseo community. Free to use, fork, and hack on for <a href="LICENSE" target="_blank" rel="noopener noreferrer">non-commercial use</a>.

Plug-ins take effort, hours, and credits to build. If you find them helpful for you and your workflows, a star ⭐ on the repo, a <a href="https://buymeacoffee.com/akaready" target="_blank" rel="noopener noreferrer">coffee</a> ☕, and a link back to <a href="https://akaready.com" target="_blank" rel="noopener noreferrer">@akaready</a> 🔗 all go a long way. Optional of course, but always appreciated.

Enjoy! 🙏

<p align="left">
  <a href="https://buymeacoffee.com/akaready" target="_blank" rel="noopener noreferrer">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="40" alt="Buy me a coffee">
  </a>
</p>

&nbsp;

## 📦 Install

Plugins run trusted, unsandboxed code, so turn them on first under **Settings → Plugins → Enable plugins**. Then:

```bash
paseo plugin install github:akaready/paseo-link-tabs
```

Update it later with `paseo plugin update link-tabs`.

&nbsp;

## ✨ What It Does

Every chat gets a **Links** pill above the composer. Tap it for every link the agent shared in that chat, shown whole, grouped by where it points:

- **Local dev**: localhost, private networks, `.local` hosts, and tunnels
- **Tailscale dev**: `*.ts.net` names and Tailscale addresses (100.64.0.0/10, `fd7a:115c:a1e0::/48`)
- **Previews**: Vercel, Netlify, Cloudflare Pages, and similar hosts
- **GitHub**, **Dashboards** (Vercel, Supabase, Stripe, and other consoles), **Docs**, and **Other**

Every group and every link has a pin, a copy button, and a **⋮** menu:

- 📌 **Pin**: puts it in the bar next to Links, a link as its own pill, a group as a button listing its links. Nothing is pinned until you pin it.
- 📋 **Copy**: the link, or every link in the group
- ↕️ **Rearrange** (in **⋮**): drag links and groups into any order, then tap **Done**
- ✏️ **Rename** (in **⋮**): your own name for a group or a link, in the bar and the list; clear it for the default
- 🗑 **Delete** (in **⋮**): removes links from this chat's list until the agent shares them again

A pinned link's pill shows its group's icon, and Paseo fits each pill in 160px, so a long link shows the end that fits (`…:5173/admin`, `…?tab=billing`). A pull request reads as `repo#12`, a tailnet address as `machine:port`. Hover a pill for the whole link.

Links don't open while you rearrange, so a press anywhere on a row picks it up. Add your own groups with a name and an icon.

&nbsp;

## 📝 Notes

- **What it reads:** only the agent's own messages in each chat, through your Paseo host. Your messages and tool output are left out. Nothing leaves your machine.
- **When it reads:** only while a chat's composer is on screen (when you open it, when a turn starts or ends, and when you open the list). Reading a chat makes Paseo load its agent, so chats you haven't opened are never read.
- **What it stores:** your groups, their order, pins, names, and deleted links, in a Paseo settings document on the host, shared by every client. Everything but deletions applies in every chat.
- **Phones:** in the iOS and Android apps everything stays in the Links pill, which opens the list as a sheet; pins show on tablets, desktop, and the web.
- **Limits:** the composer's bar is one line and Paseo squeezes every pill in it to fit, so pin only a few. The list is at most 420px wide, the width Paseo gives plugin popovers, so a long link wraps. Links open in your system browser on desktop. Rearranging was checked on desktop and web, not yet in the phone and tablet apps.
- Requires Paseo 0.11.2 or later.

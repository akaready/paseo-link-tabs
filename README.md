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
- **Local files**: HTML files the agent named or wrote in that chat, as paths (`demo/index.html`), resolved from the chat's working directory, or `file://` links
- **Tailscale dev**: `*.ts.net` names and Tailscale addresses (100.64.0.0/10, `fd7a:115c:a1e0::/48`)
- **Previews**: Vercel, Netlify, Cloudflare Pages, and similar hosts
- **GitHub**, **Dashboards** (Vercel, Supabase, Stripe, and other consoles), **Docs**, and **Other**

Each link has a bullet at its left, which a mode turns into a pick box or a grip without moving anything. Every group and every link has its own buttons, which appear over the row's tail as you hover it, so a link keeps the row's whole width until you point at it and the text fades out underneath them. The phone and tablet apps have no hover, so there the buttons sit in the row and are always shown:

- 📌 **Pin**, the rightmost icon: puts it in the bar next to Links, a link as its own pill, a group as a button listing its links. Nothing is pinned until you pin it, and a pinned row keeps its pin on screen, lit in the text colour rather than the accent.
- 📋 **Copy**: the link; the icon becomes a tick for a moment, so you can see it took
- ✏️ **Rename**: your own name for a group or a link, in the bar and the list, edited right where the text is: Enter or clicking away saves, Escape cancels, and an empty name goes back to the default
- ↕️ **Rearrange**, the ⇅ button beside **New group**: both buttons become **Done**, every row's bullet turns into a grip, and links and groups drag into any order
- 🗑 **Delete**, the button beside ⇅: every row's bullet turns into a pick box and the two buttons become a checkbox and an ✕. Pick links anywhere, tap the checkbox to delete them all at once, or the ✕ to stop
- 🗂 **Collapse**, by clicking a group's title: hovering it turns the group's icon into a chevron, pointing down while the group is open and, once closed, sitting at the end of the title pointing right
- ⚙️ **A click opens in** (Settings → Plugins → Link Tabs): Paseo's browser, or your own, for every chat on the host. Holding ⌘ while clicking (Ctrl on Windows and Linux) opens that one link the other way

Rows **fade with age**: the newest link in a chat is shown in full, the oldest at about half strength. Hovering, picking, or renaming a row shows it in full, and your own drag order still wins. A link not mentioned for **seven days** and not pinned moves behind an **Archive** row at the bottom of its group (`Archive · 4`), which opens with a tap; archived links keep their buttons.

Under each link a muted line shows the **page title** when there is one. See Notes for how titles are fetched.

A pinned link's pill shows its group's icon, and Paseo fits each pill in 160px, so a long link shows the end that fits (`…:5173/admin`, `…?tab=billing`). A pull request reads as `repo#12`, a tailnet address as `machine:port`. Hover a pill for the whole link.

Tapping a link opens it in your browser. Settings → Plugins → Link Tabs can send taps to **Paseo's own browser** instead, which keeps the page inside the workspace; Paseo only lets a panel open its browser, so that choice adds a Link preview tab, and it exists in the desktop app only. Paseo's browser takes only http and https, so a local HTML file is first served to it from a loopback address on your machine, which also lets the page load its own CSS, scripts, and images. A file is listed only while it exists, so a page that has since been deleted, or a path the agent only talked about, stays out.

Paseo only gives plugins the browser on the desktop app. The web app and the phones have no Paseo browser, so a tap there opens with the OS instead, and says so.

Links don't open while you rearrange or delete, so a press anywhere on a row picks it up instead. A deleted link comes back when the agent shares it again. Add your own groups with a name and an icon.

&nbsp;

## 📝 Notes

- **What it reads:** only the agent's own messages in each chat, through your Paseo host. Your messages and tool output are left out. Local files come from those messages plus the HTML files the agent wrote or edited in that chat, and are checked on disk before they are listed.
- **Page titles:** the machine running the Paseo daemon fetches each link's page itself, straight from the link: a plain GET with a three second limit, no cookies, the first 64 KB only, HTML responses only, and the `<title>` (else `og:title`) is kept. Local HTML files are read from disk. Nothing goes to a third party. Titles are cached in memory for an hour (five minutes after a failure), fetched in the background so the list never waits, and filled in a moment after it opens. Links in agent messages are fetched, so a link to a private address is read from the daemon's network.
- **What it serves:** to show a local page in Paseo's browser, the plugin listens on `127.0.0.1` for as long as you are looking at it, plus 30 idle minutes, and serves that page's own folder to it, with an unguessable path. Nothing outside the folder is reachable, and the server stops when it goes idle or the plugin stops.
- **When it reads:** only while a chat's composer is on screen (when you open it, when a turn starts or ends, and when you open the list). Reading a chat makes Paseo load its agent, so chats you haven't opened are never read.
- **What it stores:** your groups, their order, pins, names, and deleted links, in a Paseo settings document on the host, shared by every client. Everything but deletions applies in every chat.
- **Phones:** in the iOS and Android apps everything stays in the Links pill, which opens the list as a sheet; pins show on tablets, desktop, and the web.
- **Limits:** the composer's bar is one line and Paseo squeezes every pill in it to fit, so pin only a few. The list is at most 420px wide, the width Paseo gives plugin popovers, so a long link wraps. Opening in Paseo's browser needs the desktop app; anywhere else, links open with the OS on the machine your Paseo host runs on. A tap goes through the **Link preview** panel, because Paseo only lets a panel reach its browser, so that panel appears next to the chat the first time you tap a link; close it when you are done. Rearranging was checked on desktop and web, not yet in the phone and tablet apps.
- Requires Paseo 0.11.2 or later.

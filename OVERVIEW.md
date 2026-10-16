Link Tabs keeps the links an agent shares in its chat a tap away, so a dev server, a preview deploy, or a pull request is easy to reach after it scrolls out of view.

Every chat gets a Links pill above the composer. Tap it to see every link the agent shared in that chat, in full, grouped by where they point: local dev servers (localhost, private networks, `.local` hosts, tunnels), Tailscale dev servers (`ts.net` names and Tailscale addresses), previews (Vercel, Netlify, Cloudflare Pages and similar hosts), GitHub, dashboards, docs, and other. A long link wraps onto a second line rather than being cut short. Tap a link to open it.

Each group and each link has a pin, a copy button, and a ⋮ menu:

- Pin puts it in the bar next to the Links pill. A pinned link gets a pill of its own; a pinned group gets a button that lists its links. Nothing is pinned until you pin it, and a pinned one's pin lights up.
- Copy copies the link, or every link in the group.
- Rearrange, in the ⋮ menu, lets you drag links and groups into any order, and links into another group. Tap Done when you are finished; links don't open while you rearrange.
- Rename, in the ⋮ menu, gives a group or a link a name of your own, used in the bar and the list. Clear the name to go back to the default.
- Delete, in the ⋮ menu, removes the link, or the group's links, from this chat's list. A link the agent shares again comes back. Deleting a group you added, once it is empty, removes the group.

Add your own groups with a name and an icon. Your groups, their order, pins, and names apply in every chat on the host, matched by URL; deletions apply to one chat.

A pinned link's pill shows an icon for its group, and Paseo fits each pill in 160 pixels, so a long link shows the end that fits, such as `…:5173/admin` or `…?tab=billing`. A pull request reads as `repo#12`, and a tailnet address as its machine name and port. Hover a pill for the whole link.

Only links in the agent's own messages count, not yours and not tool output. A chat's links are read while its composer is on screen: when you open the chat, when the agent starts or finishes a turn, and when you open the list. Chats you have not opened are never read, because reading a chat makes Paseo load its agent.

In the phone apps the composer's bar is too narrow for more, so everything stays in the Links pill, which opens the list as a sheet; pins show on tablets, desktop, and the web. The bar is one line, and Paseo squeezes every pill in it to fit, so pin only a few. Links open in your system browser on desktop, a new tab on the web, and the system handler on phones. The list is at most 420 pixels wide, the width Paseo gives plugin popovers. Rearranging was checked in the desktop and web app, not yet in the phone and tablet apps.

Requires Paseo 0.11.2 or later.

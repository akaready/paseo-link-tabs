Link Tabs keeps the links an agent shares in its chat a tap away, so a dev server, a preview deploy, or a pull request is easy to reach after it scrolls out of view.

Every chat gets a Links pill above the composer. Tap it to see every link the agent shared in that chat, in full, grouped by where they point: local dev servers (localhost, private networks, `.local` hosts, tunnels), Tailscale dev servers (`ts.net` names and Tailscale addresses), previews (Vercel, Netlify, Cloudflare Pages and similar hosts), local HTML files, GitHub, dashboards, docs, and other. A long link wraps onto a second line rather than being cut short. Tap a link to open it.

Each group and each link has its own buttons. They arrive over the row's tail as you hover, so a link has the row's whole width until then and the text fades under them; the phone and tablet apps have no hover, so there they sit in the row and are always shown:

- Pin, the rightmost icon, puts it in the bar next to the Links pill. A pinned link gets a pill of its own; a pinned group gets a button that lists its links. Nothing is pinned until you pin it; once it is, the pin stays on screen in the text colour, and the link text fades under it.
- Copy copies the link, and its icon becomes a tick for a moment.
- Rearrange, the button beside New group, lets you drag links and groups into any order, and links into another group. The two buttons become a single Done button until you tap it, and each link's bullet becomes a grip; links don't open while you rearrange.
- Rename, gives a group or a link a name of your own, used in the bar and the list. The text becomes editable where it sits, so nothing moves: Enter or clicking away saves, Escape cancels, and an empty name goes back to the default.
- Delete, the button beside the rearrange one, puts every row into picking: each link's bullet becomes a box, the rearrange button turns into a checkbox that deletes everything picked, and the delete button turns into an ✕ that cancels. A deleted link comes back when the agent shares it again.

Clicking a group's title closes it and clicking it again opens it, and the links slide in and out of place. Hovering the title turns the group's icon into a chevron, pointing down while the group is open; a closed group shows the chevron at the end of its title, pointing right.

Add your own groups with a name and an icon. The plugin's own settings, under Settings, then Plugins, then Link Tabs, decide where a click opens links: Paseo's browser, or your own. It is one choice, because holding ⌘ while clicking, Ctrl on Windows and Linux, opens that one link the other way. Your groups, their order, pins, and names apply in every chat on the host, matched by URL; deletions apply to one chat.

A pinned link's pill shows an icon for its group, and Paseo fits each pill in 160 pixels, so a long link shows the end that fits, such as `…:5173/admin` or `…?tab=billing`. A pull request reads as `repo#12`, and a tailnet address as its machine name and port. Hover a pill for the whole link.

Tapping a link opens it in your browser. The plugin's settings can send taps to Paseo's own browser instead, which keeps the page inside the workspace; Paseo only lets a panel open its browser, so that choice adds a Link preview tab next to the chat, and it exists in the desktop app only. Paseo's browser takes only http and https links, so a local HTML file is served to it from a loopback address on your machine first, which also lets the page load its own CSS, scripts, and images.

Local HTML files count too: the ones named in a path or a file link, and the ones the agent wrote or edited in that chat. A relative path is read from the chat's working directory, and a file is listed only while it exists, so a page that has been deleted stays out. The Link preview panel has an Open again button, and an Open in your browser button on the desktop app.

Rows fade with age. The newest link in a chat is shown in full and the oldest at about half strength, with the rest in between, so what is fresh stands out. Hovering, picking, or renaming a row shows it in full. Your own drag order still wins. A link not mentioned for seven days, and not pinned, moves behind an Archive row at the bottom of its group, which shows the count and opens with a tap. Archived links keep their buttons.

Under a link, a quieter line shows the page's title when it has one. The machine running the Paseo daemon reads each page straight from the link, with a three second limit, the first 64 KB only, and no cookies. Local HTML files are read from disk. Nothing goes to a third party. Titles are remembered for an hour, and the list fills them in a moment after it opens.

Only links in the agent's own messages count, not yours. A chat's links are read while its composer is on screen: when you open the chat, when the agent starts or finishes a turn, and when you open the list. Chats you have not opened are never read, because reading a chat makes Paseo load its agent.

In the phone apps the composer's bar is too narrow for more, so everything stays in the Links pill, which opens the list as a sheet; pins show on tablets, desktop, and the web. The bar is one line, and Paseo squeezes every pill in it to fit, so pin only a few. Links open in Paseo's browser on the desktop app, and with the OS elsewhere: the system browser on desktop, a new tab on the web, the system handler on phones. The list is at most 420 pixels wide, the width Paseo gives plugin popovers. Rearranging was checked in the desktop and web app, not yet in the phone and tablet apps.

Requires Paseo 0.11.2 or later.

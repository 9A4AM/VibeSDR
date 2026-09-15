# VibeSDR — Privacy Policy

_Last updated: 15 September 2026_

This policy covers the whole VibeSDR family:

- **VibeSDR** — the receiver app for iPhone, iPad, Android and Mac.
- **VibeSDR Jr** — the standalone receiver for Apple Watch.
- **VibeSDR Buddy** — the Apple Watch remote for the phone app.
- **VibeServer** — the server built into the Android app and available for macOS,
  which turns your own radio hardware into a receiver on your own network.

They are client apps for listening to Software-Defined Radio (SDR) receivers. This
policy explains what they do and do not do with your data.

## Summary

**VibeSDR does not collect, store, or transmit any personal information to the
developer.** There are no analytics, no advertising, no tracking, and no developer
servers that receive your data. There are no accounts and nothing to sign in to.
Everything the app stores stays on your device, or in your own iCloud account.

## Our position

This is deliberate, and it is permanent.

- **No data-collecting SDKs.** The apps contain no analytics, advertising,
  attribution, crash-reporting or "monetisation" libraries from anyone. The
  third-party code they do contain is the kind a radio needs — open-source
  drivers, decoders and codecs (librtlsdr, libusb, Opus and the like), and, in
  VibeServer, Cloudflare's tunnel client so a server can be reached from outside
  your network. All of it is open source or published, does one job, and reports
  nothing to anyone.
- **No bandwidth-sharing or proxy SDKs — ever.** Developers of apps like this one are
  regularly offered money to embed SDKs that use the phones of people running the app
  as proxy exit nodes ("proxyware"): other people's internet traffic, of unknown
  origin and purpose, leaves through your connection, using your data allowance and
  your IP address, usually behind a consent screen nobody reads. VibeSDR has been
  approached with exactly such an offer and refused it. It will refuse every future
  one, regardless of the payment. It would also be the exact inverse of what the
  tunnel exists to do. Your device and your connection are not for sale, and not by
  us.
- **No accounts, no identifiers.** There is nothing to sign up for and no device
  identifier is generated, stored or sent.
- **Privacy first in the design, not only in the policy.** VibeServer reaches the
  internet through a Cloudflare tunnel rather than a forwarded port. That is slower
  and less efficient than the port-forwarded servers other receiver software uses,
  and it is chosen deliberately: nothing inbound ever touches the owner's home
  address, nothing is exposed to internet scanners, and the address appears in no
  listing. It protects the owner from exposure and inbound attack; it is not
  end-to-end encryption — the tunnel terminates at Cloudflare's edge, as for any
  site behind Cloudflare. An owner who prefers the speed of a direct, port-forwarded
  server and is happy to manage their own exposure can run one; the tunnel is the
  default, not the only option.
- **Verifiable.** The full source of every released build is public at
  <https://github.com/Stuey3D/VibeSDR>, the dependency list with it, and anyone can
  capture the app's network traffic and see exactly which endpoints it talks to.
  What this page says is checkable in minutes, and with this app's audience it will be.

If any of this ever changes, this page will say so, at the top, before the change ships.

## Information the app uses

### Location (optional for listening)
Listening needs no location at all. If you grant location permission, VibeSDR uses
your device location **only** to sort and filter the list of receivers by distance
(nearest first) and, when you plug an SDR into the device itself, to place a pin for
that receiver on the app's map and to work out the distance and bearing of the
digital-mode spots it decodes. Deny it and you lose only those: the lists are
unsorted and the spots are shown without a distance.

On every platform the app asks for **coarse** location only — never precise — even
where the device could provide an exact position.

- Your location is sent **only** to the public UberSDR instance directory
  (`instances.ubersdr.org`), rounded to about a kilometre, **at the moment you
  refresh the list**, so it can return instances ordered by distance. It is not
  stored by the app or by the developer.
- The VibeServer directory (`vibeserver.vibesdr.net`) receives **no location at
  all**: the app downloads the list and sorts it by distance on your device.
- Location is **entirely optional**. If you deny or disable it, every other feature
  of the app continues to work normally — you can still browse and use every
  instance; the list simply won't be sorted by distance.
- VibeSDR never accesses your location in the background.

### Connections to SDR receivers
When you select an SDR instance, the app connects directly from your device to
that third-party receiver to stream audio and spectrum data. Your device's IP
address is necessarily visible to the receiver you connect to, as with any network
connection. These receivers are operated by independent third parties and are not
controlled by the developer; their own logging and privacy practices are their
responsibility.

A VibeServer's owner can see, on their own admin page, the IP address, country and
network of whoever is connected, and the frequency they are listening to. That
view is held in the server's memory on the owner's hardware, is not sent to the
developer or anywhere else, and lets the owner block abuse of their radio. Servers
reached through the public directory pass through Cloudflare's network on the way,
as any website does.

### The VibeServer directory
Server owners who choose to list a server register its name, its public web
address (the tunnel hostname listeners connect to) and a **coarse** position: a Maidenhead grid locator, which names a square a few
kilometres across, or a city-level position. VibeServer asks for this before it
will start, because the directory exists to sort receivers by distance, but it is
never an exact geographic location and the app never derives one. The directory
records the IP address each registration came from, to limit abuse, and nothing
about listeners:
browsing the list is an ordinary web request that is not logged by the developer.
An owner can delist with one press, effective immediately.

### On-device data
The following are stored **only on your device** and are never transmitted to the
developer:

- Your saved bookmarks, favourite servers, and a default server.
- App settings and preferences.
- Audio recordings you choose to make (saved to your device; shared only when you
  explicitly use the share button).

You can remove all of this by deleting the app.

### iCloud sync (optional)
If you are signed in to iCloud, your bookmarks and favourite servers sync between
your own devices — for example, between VibeSDR on your iPhone and VibeSDR Jr on
your Apple Watch.

- This uses **your own iCloud account**, through Apple's iCloud key-value storage.
  The data goes from your device to your iCloud and back to your other devices.
- **The developer has no access to it.** There is no developer server involved and
  no copy is kept anywhere else.
- It syncs bookmarks and preferences only — never recordings, and never anything
  about what you have been listening to.
- Turning off iCloud for VibeSDR in your device settings stops it, and the app
  carries on working normally with everything stored locally.

### VibeSDR Jr on Apple Watch
Jr is a standalone app: it makes its own network connection and does not send your
data through the paired iPhone. Everything above applies to it in the same way — no
accounts, no analytics, nothing sent to the developer.

### VibeServer
If you run VibeServer, it serves your own radio to devices you point at it. It runs
on your hardware, on your network. The developer has no visibility of it, receives
nothing from it, and it phones home to nobody. If you choose to make it reachable
from the internet, anyone you give the address to can connect and listen, and the
connection logs it keeps are yours alone — so set a PIN if it is not meant to be
public.

### Diagnostics
If something breaks you can build a diagnostics report from the app and share it
yourself, through the system share sheet. It is assembled on demand, shown to you
first, and never sent by the app. It contains no PIN, password, callsign or precise
location.

## Permissions

- **Location** (optional) — sort/filter servers by distance, as described above.
  Requested at approximate ("coarse") accuracy only, and never in the background.
- **Local network** (iOS and watchOS) — to discover and connect to SDR receivers on
  your local network.
- **Notifications / media controls** — to show now-playing controls and run audio
  in the background while you listen.
- **USB** (Android) — only to talk to an SDR dongle you plug in yourself, when you
  use the app as a server.

VibeSDR does **not** use the microphone, camera, contacts, or any other personal
data. (Audio "recording" records the radio stream you are listening to, not your
microphone.)

## Children

The VibeSDR apps are not directed at children and do not knowingly collect any data
from anyone.

## Changes

If this policy changes, the updated version will be published at this URL with a new
"last updated" date.

## Contact

Questions about privacy: **stuey3dttb@icloud.com**

Source code: <https://github.com/Stuey3D/VibeSDR>

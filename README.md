# PS4 - PS5 Exploit Host

## Ludora presentation layer

All HTML pages in this host, including firmware menus, cache installers, payload tools, and restore pages, use the local `style.css` presentation layer. The exploit scripts, manifests, payload binaries, and relative asset paths remain unchanged.

When updating the host on a PS4, clear the Browser cookies and website data from the browser Options menu before reopening `/jb`; Application Cache can otherwise continue displaying an older page shell.

Run the local checks before shipping:

```bash
npm run verify:host-pages
npm run verify:host-runtime
```
PS4 Firmwares: `5.05` `6.72` `7.XX` `8.XX` `9.XX` `10.XX` `11.00` `11.02`

PS5 Firmwares: `1.XX` `5.XX`

## Steps:

- In the console browser go to: https://gamerhack.github.io/
- Select the firmware of your console.
- Immediately all content will be installed in the offline cache, once finished exit the browser and turn off the Internet.
- Then go back to Access Browser and Enjoy.

Download link for the PS5 host shortcut .pkg file:
https://www.mediafire.com/file/dh3tzdvfmcznmrs/NPXS40138_%2528UMTX2%2529.pkg/file

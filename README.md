# frida-CEServerExtension

Emulate the libceserver-extension protocol with frida javascript.

# Usage

1. Put `adjust.lua` in the Cheat Engine's autorun folder(First time only).
1. Start frida-server and ceserver.
1. `frida -U -l ceserver-extension.js AppName`
1. Attach to the target process in cheat engine network mode.
1. The same functionality is enabled as when libceserver-extension.so is injected.

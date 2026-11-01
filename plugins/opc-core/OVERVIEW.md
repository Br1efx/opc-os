opc-core is the shell of opc-os, a Paseo plugin for a one-person company workspace.

This revision adds the home screen 一人公司 OS, plus settings and notifications. Home lists modules M1–M6 and can turn each one on or off. A module that is off does not appear in the sidebar. The gateway screen reads Magpie on 127.0.0.1 when probing is on, and shows a labeled mock spend when it is off. `permissions.manifest.json` allows that loopback host on the shell. The six module entries stay disabled and declare no file or network access of their own.

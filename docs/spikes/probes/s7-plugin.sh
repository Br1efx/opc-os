#!/bin/sh
# 在 opc-core 的依赖解析路径下跑同一进程探针。
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
cd "$root/plugins/opc-core"
exec node --experimental-transform-types --input-type=module < "$root/docs/spikes/probes/s7-plugin.mjs"

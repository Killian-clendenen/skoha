#!/bin/sh
# bump the cache-busting asset version everywhere: tools/bump.sh 20261103c
cd "$(dirname "$0")/.." && sed -i -E "s/\?v=2026[0-9]{4}[a-z]?/?v=$1/g; s/skoha-2026[0-9]{4}[a-z]?/skoha-$1/" index.html app.js narrator.js engine.js sw.js

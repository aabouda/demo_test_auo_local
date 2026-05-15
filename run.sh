#!/usr/bin/env bash
# Délègue au point d'entrée unique Node (run.js)
cd "$(dirname "$0")"
exec node run.js "$@"

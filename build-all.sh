#!/usr/bin/env bash

set -eu

cargo +nightly contract build --manifest-path sub/Cargo.toml
cargo +nightly contract build


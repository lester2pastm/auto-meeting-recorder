#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ "$(uname -m)" != x86_64 || "$(getconf GNU_LIBC_VERSION)" != 'glibc 2.31' ]]; then
  echo 'Build the Linux x64 ASR addon on x86_64 with glibc 2.31 (for example, node:20-bullseye).' >&2
  exit 1
fi

native_dir="$(node -p "require('path').dirname(require.resolve('sherpa-onnx-linux-x64/package.json'))")"
if [[ "$(node -p "require('sherpa-onnx-linux-x64/package.json').version")" != 2.0.1 ]]; then
  echo 'Update the pinned Sherpa source commit to match the installed Linux x64 package.' >&2
  exit 1
fi

# The bundled C API and ONNX Runtime are already compatible with glibc 2.31.
commit=af2d8d81dbfa61c4cea4c568da78f3982edca005
node_headers="$(dirname "$(dirname "$(readlink -f "$(command -v node)")")")/include/node"
scratch="$(mktemp -d "$native_dir/.rebuild.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/source" "$scratch/napi"

curl -fsSL --retry 3 --max-time 180 -o "$scratch/source.tar.gz" \
  "https://codeload.github.com/k2-fsa/sherpa-onnx/tar.gz/$commit"
curl -fsSL --retry 3 --max-time 60 -o "$scratch/napi.tgz" \
  'https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.3.0.tgz'
(
  cd "$scratch"
  sha256sum --check --status <<'CHECKSUMS'
afcafe3c34bc2f15a363ad791fa1644a69bf0977a58c1b4f617468976c2faeb5  source.tar.gz
a0ce67653a251f56ea40d2eab08797934b6cfc9db4d48766795d97bb9b4d960d  napi.tgz
CHECKSUMS
)
tar -xzf "$scratch/source.tar.gz" -C "$scratch/source" --strip-components=1 \
  "sherpa-onnx-$commit/scripts/node-addon-api/src" \
  "sherpa-onnx-$commit/harmony-os/SherpaOnnxHar/sherpa_onnx/src/main/cpp" \
  "sherpa-onnx-$commit/sherpa-onnx/c-api/c-api.h"
tar -xzf "$scratch/napi.tgz" -C "$scratch/napi" --strip-components=1

g++ -std=c++17 -O2 -shared -fPIC \
  -I"$node_headers" -I"$scratch/napi" -I"$scratch/source" \
  "$scratch/source/scripts/node-addon-api/src/"*.cc \
  -L"$native_dir" -lsherpa-onnx-c-api -lonnxruntime '-Wl,-rpath,$ORIGIN' \
  -o "$scratch/sherpa-onnx.node"

LD_LIBRARY_PATH="$native_dir" node -e 'require(process.argv[1])' "$scratch/sherpa-onnx.node"
mv -f -- "$scratch/sherpa-onnx.node" "$native_dir/sherpa-onnx.node"

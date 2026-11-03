#!/bin/sh
# Compile l'analyseur audio de fadarr (qm-dsp + algorithmes de Mixxx). Besoin : un compilateur C/C++ (g++ ou clang).
#   Linux : apt install g++  /  apk add g++     macOS : xcode-select --install
set -e
cd "$(dirname "$0")"
CC=${CC:-cc}; CXX=${CXX:-c++}
OUT=${1:-fadarr-analyze}
TMP=$(mktemp -d)
FLAGS="-O2 -Dkiss_fft_scalar=double -DNDEBUG -Iqm-dsp -Iqm-dsp/include"
$CC $FLAGS -c qm-dsp/ext/kissfft/kiss_fft.c -o "$TMP/kiss_fft.o"
$CC $FLAGS -c qm-dsp/ext/kissfft/tools/kiss_fftr.c -o "$TMP/kiss_fftr.o"
$CXX -std=c++17 $FLAGS -o "$OUT" fadarr-analyze.cpp \
  qm-dsp/base/*.cpp qm-dsp/dsp/chromagram/*.cpp qm-dsp/dsp/keydetection/*.cpp qm-dsp/dsp/onsets/*.cpp \
  qm-dsp/dsp/phasevocoder/*.cpp qm-dsp/dsp/rateconversion/*.cpp qm-dsp/dsp/signalconditioning/*.cpp \
  qm-dsp/dsp/tempotracking/*.cpp qm-dsp/dsp/transforms/*.cpp qm-dsp/maths/*.cpp "$TMP"/*.o $LDFLAGS
rm -rf "$TMP"
case "$OUT" in /*) echo "✅ $OUT" ;; *) echo "✅ $(pwd)/$OUT" ;; esac

#!/bin/bash
# Build dab-bench.vbu8: the benchmark's DAB+ input (vibe_benchmark_dab.h). Run from this directory:
#   docker build -t vibe-dabclip . && docker run --rm -v "$PWD":/w -w /w vibe-dabclip ./make-clip.sh [snr_db]
#
# ★★★ NOTHING IN IT IS ANYONE ELSE'S (Stuart, 2026-09-19). The first clip was 1.92 s of a real multiplex — 26
#     broadcasters' programmes, labels and slides — and publishing that is not ours to do. Every sound here is
#     generated tones and noise, every label and slide made up; the Opendigitalradio tools turn it into a real,
#     standards-conformant DAB multiplex.
# ★★★ AND IT IS NOT CLEAN. A crystal-clear signal skips the paths that cost CPU only when a signal is weak: RS
#     repair (a clean block leaves after the syndromes), superframe retries, concealment, sync tracking a drift.
#     impair.py adds noise, a frequency offset, a multipath echo and short fades — the level set so Reed-Solomon
#     is correcting constantly while the audio still decodes, which the benchmark checks.
set -euo pipefail
SNR=${1:-7}   # ★ measured: RS repairing hard (316 blocks vs 62 at 8 dB) with 96 % of the clean clip's audio still decoding
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
# ── audio: tones over pink noise, a different key per service, so AAC has real spectrum to code ──
mkaudio() { # $1 out.wav $2 base Hz
  ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=color=pink:amplitude=0.12:duration=14" \
    -f lavfi -i "sine=frequency=$2:duration=14" -f lavfi -i "sine=frequency=$(( $2 * 5 / 4 )):duration=14" \
    -f lavfi -i "sine=frequency=$(( $2 * 3 / 2 )):duration=14" \
    -filter_complex "[1][2][3]amix=inputs=3,tremolo=f=2:d=0.6[t];[0][t]amix=inputs=2,aformat=sample_rates=48000:channel_layouts=stereo" \
    "$1"
}
# ── slides: made here, two per service ──
mkdir -p "$W/slides"
ffmpeg -loglevel error -y -f lavfi -i "testsrc=size=320x240:rate=1:duration=1" -frames:v 1 "$W/slides/a.jpg"
ffmpeg -loglevel error -y -f lavfi -i "mandelbrot=size=320x240:rate=1" -frames:v 1 "$W/slides/b.jpg"
# ── DAB+ services: one 128 k (the one the benchmark plays) and ten at 48 k, each with DLS + slides ──
RATES=(128 48 48 48 48 48 48 48 48 48 48)
for i in "${!RATES[@]}"; do
  mkaudio "$W/a$i.wav" $(( 220 + i * 37 ))
  echo "VibeSDR bench service $i - generated audio, nothing broadcast" > "$W/dls$i.txt"
  odr-padenc -d "$W/slides" -s 2 -t "$W/dls$i.txt" -o "pad$i" >/dev/null 2>&1 &
  PADPID=$!; sleep 1
  odr-audioenc -i "$W/a$i.wav" -b "${RATES[$i]}" -P "pad$i" -p 58 -o "$W/s$i.dabp" >/dev/null 2>&1 || true
  kill $PADPID 2>/dev/null || true; wait $PADPID 2>/dev/null || true
  [ -s "$W/s$i.dabp" ] || { echo "audioenc produced nothing for service $i"; exit 1; }
done
# ── and one MP2 (DAB classic) service, 128 k ──
mkaudio "$W/m.wav" 300
ffmpeg -loglevel error -y -i "$W/m.wav" -c:a mp2 -b:a 128k -ar 48000 "$W/m.mp2"
# ── the multiplex ──
{
  echo 'general { dabmode 1 nbframes 400 syslog false tist false managementport 0 }'
  echo 'remotecontrol { telnetport 0 }'
  echo 'ensemble { id 0x4ffe ecc 0xe1 label "VibeSDR Bench" shortlabel "Bench" international-table 1 local-time-offset auto }'
  echo 'services {'
  for i in "${!RATES[@]}"; do printf '  srv%d { id 0x%04x label "Bench %d" }\n' "$i" $(( 0xc001 + i )) "$i"; done
  echo '  srvm { id 0xc0ff label "Bench MP2" }'
  echo '}'
  echo 'subchannels {'
  for i in "${!RATES[@]}"; do
    printf '  sub%d { type dabplus inputfile "%s/s%d.dabp" bitrate %d id %d protection-profile EEP_A protection 3 }\n' "$i" "$W" "$i" "${RATES[$i]}" "$i"
  done
  printf '  subm { type audio inputfile "%s/m.mp2" bitrate 128 id 20 protection 3 }\n' "$W"
  echo '}'
  echo 'components {'
  for i in "${!RATES[@]}"; do printf '  comp%d { service srv%d subchannel sub%d user-applications { userapp "slideshow" } }\n' "$i" "$i" "$i"; done
  echo '  compm { service srvm subchannel subm }'
  echo '}'
  printf 'outputs { file "file://%s/mux.eti?type=raw" }\n' "$W"
} > "$W/mux.mux"
odr-dabmux "$W/mux.mux" > "$W/mux.log" 2>&1 || true; ls -la "$W"/*.dabp "$W"/m.mp2 "$W"/mux.eti; tail -5 "$W/mux.log"
[ -s "$W/mux.eti" ] || { echo "dabmux produced no ETI"; cat "$W/mux.mux"; exit 1; }
odr-dabmod "$W/mux.eti" -f "$W/mux.cf32" -F complexf -m 1 -r 2048000 -g var >/dev/null 2>&1 || true
[ -s "$W/mux.cf32" ] || { echo "dabmod produced no IQ"; exit 1; }
cp "$W/mux.cf32" mux.cf32   # ★ kept (gitignored) so the damage can be re-tuned without rebuilding the mux
python3 impair.py "$W/mux.cf32" dab-bench-clean.vbu8 dab-bench.vbu8 "$SNR" 0xc001

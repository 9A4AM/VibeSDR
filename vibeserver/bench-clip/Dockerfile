# The benchmark's DAB multiplex, built from nothing we do not own — see make-clip.sh.
FROM debian:trixie
RUN sed -i "s/Components: main/Components: main contrib non-free/" /etc/apt/sources.list.d/debian.sources \
 && apt-get update -qq && apt-get install -y -qq odr-dabmux odr-dabmod odr-audioenc odr-padenc ffmpeg python3-numpy \
 && rm -rf /var/lib/apt/lists/*

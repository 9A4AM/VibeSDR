// VibeSDR — the server benchmark: what THIS box can carry (Stuart, 2026-09-19).
//
// ★★★ WHY. A low-end box that cannot run WFM stereo should say so before a listener finds out as dropouts.
//     Lite runs this at first setup and switches red features OFF by default (the owner may override); the full
//     versions offer it at the top of setup as advice. Design: memory lite_first_setup_benchmark.md.
// ★★★ THE REAL CHAIN ON SYNTHETIC SIGNALS — RxPipeline exactly as the server builds it (its own thread options,
//     which 32-bit ARM switches on through VIBE_DSP_THREADS), fed a generated station. bench_wfm did the same and
//     matched the live Pi 2 within a few per cent.
// ★★★ SCORED BY THE HOTTEST THREAD against ONE core, never the average: the admin page's 4-core average once read
//     25 % with the audio already dead. Each thread's CPU is read from /proc/self/task; the worst one, over the
//     signal's own duration, is "% of a core in real time". Green < 70, amber 70-85, red > 85.
// ★ A recommended sample rate is never below 1.024 MS/s (RTLs struggle below ~1 MHz — Stuart); lower rates stay
//   a manual choice only.
// ★ Every future decoder adds its row here (the rule is Stuart's): an update re-runs it, so a new decoder starts
//   switched off on a box it would overload.
#pragma once
#include "vibedsp/vibedsp.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <map>
#include <string>
#include <vector>
#include <dirent.h>
#include <pthread.h>
#include <time.h>
#include <unistd.h>

namespace vibe {

namespace benchdetail {
using vibedsp::cf32;
using vibedsp::RxPipeline;

/** CPU seconds per thread of this process, by thread id. Linux / Android: /proc/self/task/<tid>/stat. */
inline std::map<long, double> threadCpu() {
    std::map<long, double> out;
#if defined(__linux__) || defined(__ANDROID__)
    const double hz = (double)sysconf(_SC_CLK_TCK);
    if (DIR* d = opendir("/proc/self/task")) {
        while (dirent* e = readdir(d)) {
            if (e->d_name[0] == '.') continue;
            char path[96]; snprintf(path, sizeof path, "/proc/self/task/%s/stat", e->d_name);
            if (FILE* f = fopen(path, "r")) {
                char buf[1024]; size_t n = fread(buf, 1, sizeof buf - 1, f); fclose(f); buf[n] = 0;
                // ★ Fields after the ")" of the comm, which may itself hold spaces: utime is field 14, stime 15.
                const char* p = strrchr(buf, ')');
                unsigned long ut = 0, st = 0;
                if (p && sscanf(p + 2, "%*c %*d %*d %*d %*d %*d %*u %*u %*u %*u %*u %lu %lu", &ut, &st) == 2)
                    out[atol(e->d_name)] = (ut + st) / hz;
            }
        }
        closedir(d);
    }
#endif
    return out;
}
inline std::string threadName(long tid) {
#if defined(__linux__) || defined(__ANDROID__)
    char path[96]; snprintf(path, sizeof path, "/proc/self/task/%ld/comm", tid);
    if (FILE* f = fopen(path, "r")) { char b[64] = {0}; if (fgets(b, sizeof b, f)) { fclose(f); std::string s(b); while (!s.empty() && s.back() == '\n') s.pop_back(); return s; } fclose(f); }
#endif
    return "thread";
}
inline double threadSelfCpu() { timespec t; clock_gettime(CLOCK_THREAD_CPUTIME_ID, &t); return t.tv_sec + t.tv_nsec / 1e9; }

/** A broadcast-FM station that DECODES: stereo, a 19 kHz pilot and REAL RDS — group 0A with proper checkwords,
 *  differentially encoded, biphase on 57 kHz locked to the pilot (the encoder from vibedsp/test/test_rds_dsp.cpp).
 *  ★★ It has to decode: the Advanced RDS scopes (the eye) only run once RDS locks, so a noise-like subcarrier made
 *     that row read ~free on the Pi 2, where live it costs ~16 % of a core. */
inline std::vector<cf32> fmStation(double fs, double seconds, double offset) {
    using vibedsp::RdsDecoder;
    auto enc = [](uint16_t data, int off) {
        const uint16_t cw = RdsDecoder::checkword(data) ^ RdsDecoder::OFFSET[off];
        return ((uint32_t)data << 10) | cw;
    };
    std::vector<int> bits;
    const char* PS = "VIBESDR ";
    for (int addr = 0; addr < 4; ++addr) {
        const uint32_t blk[4] = { enc(0xC0DE, 0), enc((uint16_t)(addr & 3), 1), enc(0x1234, 2),
                                  enc((uint16_t)(((uint8_t)PS[addr * 2] << 8) | (uint8_t)PS[addr * 2 + 1]), 4) };
        for (int b = 0; b < 4; ++b) for (int k = 25; k >= 0; --k) bits.push_back((blk[b] >> k) & 1);
    }
    std::vector<int> m(bits.size()); int prev = 0;
    for (size_t k = 0; k < bits.size(); ++k) { m[k] = prev ^ bits[k]; prev = m[k]; }
    const int n = (int)(fs * seconds);
    std::vector<cf32> iq(n);
    double ph = 0.0;
    for (int i = 0; i < n; ++i) {
        const double t = i / fs;
        const double L = 0.25 * std::cos(2 * M_PI * 1000.0 * t), R = 0.25 * std::cos(2 * M_PI * 4000.0 * t);
        const double pilot = 0.1 * std::cos(2 * M_PI * 19000.0 * t);
        const double stereo = (L - R) * std::cos(2 * M_PI * 38000.0 * t);
        const long kb = (long)std::floor(t * 1187.5);
        const double phInBit = (t * 1187.5 - kb) * 2 * M_PI;
        const double manch = ((phInBit < M_PI) ? 1.0 : -1.0) * (m[(size_t)kb % m.size()] ? 1.0 : -1.0);
        const double rds = 0.05 * manch * std::cos(2 * M_PI * 57000.0 * t);
        const double mpx = (L + R) + pilot + stereo + rds;
        ph += 2 * M_PI * (offset + 75000.0 * mpx) / fs;
        if (ph > 2 * M_PI) ph -= 2 * M_PI; else if (ph < -2 * M_PI) ph += 2 * M_PI;
        iq[i] = cf32((float)(0.5 * std::cos(ph)), (float)(0.5 * std::sin(ph)));
    }
    return iq;
}
/** A narrowband voice-ish signal (two tones, AM-modulated) near `offset` — for NFM / AM / SSB. */
inline std::vector<cf32> nbSignal(double fs, double seconds, double offset) {
    const int n = (int)(fs * seconds);
    std::vector<cf32> iq(n);
    double ph = 0.0;
    for (int i = 0; i < n; ++i) {
        const double t = i / fs;
        const double a = 0.3 * (1.0 + 0.5 * std::sin(2 * M_PI * 700.0 * t) + 0.3 * std::sin(2 * M_PI * 1700.0 * t));
        ph += 2 * M_PI * offset / fs; if (ph > 2 * M_PI) ph -= 2 * M_PI;
        iq[i] = cf32((float)(a * std::cos(ph)), (float)(a * std::sin(ph)));
    }
    return iq;
}

struct Result { std::string id, label; double rate = 0, pct = 0; std::string hottest;
                std::vector<std::pair<std::string, double>> threads; };   // every thread's own % — see runOne

static void noAudio(void*, const float*, int, int, int) {}
static void noSpec(void*, const float*, int) {}
static void noPs(void*, uint16_t, const char*) {}
static void noText(void*, const char*) {}
static void noExt(void*, const vibedsp::RxPipeline::Callbacks::RdsExt&) {}

/** Run one scenario: `seconds` of signal through a fresh RxPipeline, fed as fast as it will take it; the hottest
 *  thread's CPU over the signal's duration is the score. */
inline Result runOne(const std::string& id, const std::string& label, double fs, RxPipeline::Mode mode, double bw,
                     const std::vector<cf32>& iq, double seconds, bool rdsExt) {
    Result r; r.id = id; r.label = label; r.rate = fs;
    static std::atomic<bool> rdsOff{false}, rdsOn{true};
    RxPipeline pipe;
    RxPipeline::Callbacks cb; cb.audio = noAudio; cb.spectrum = noSpec;
    // ★★ THE SERVER'S RDS CALLBACKS, ALWAYS. The pipeline skips RDS decoding entirely unless the host registers one
    //    (pipeline.cpp: wantRds needs cb.rdsPs/rdsText/rdsPi/rdsSig/rdsExt) and the Advanced RDS scopes also need
    //    rdsExt. A server always wires them, so without these every WFM row read LOW (no RDS decoder at all).
    cb.rdsPs = noPs; cb.rdsText = noText; cb.rdsExt = noExt;
    pipe.setRdsExtWantedFlag(rdsExt ? &rdsOn : &rdsOff);
    const auto before = threadCpu();
    const double self0 = threadSelfCpu();
    pipe.start(fs, 4096, 10.0, 48000, cb);
    pipe.setTune(200000.0, mode, bw);
    // Warm up: the first blocks build the chain and fault the buffers in; the CEQ and AGC settle.
    const int blk = 65536, total = (int)iq.size();
    for (int o = 0; o < std::min(total, (int)fs / 2); o += blk) pipe.feed(iq.data() + o, std::min(blk, total - o));
    const auto mid = threadCpu();
    const double selfMid = threadSelfCpu();
    double fed = 0;
    while (fed < seconds * fs) {
        for (int o = 0; o < total; o += blk) pipe.feed(iq.data() + o, std::min(blk, total - o));
        fed += total;
    }
    // ★★ READ THE WORKERS BEFORE stop(): stop() joins them, and a thread that has exited has taken its
    //    /proc/self/task entry — and its CPU figure — with it. What is still queued (a few blocks) is not counted,
    //    a small under-read against several seconds of signal.
    const auto after = threadCpu();
    const double selfEnd = threadSelfCpu();
    std::map<long, std::string> names;              // ★ named NOW, while the threads still exist
    for (const auto& kv : after) if (!before.count(kv.first)) names[kv.first] = threadName(kv.first);
    pipe.stop();
    const double sigSecs = fed / fs;
    // The feeding thread (vibe-dsp's role) and every worker the pipeline started.
    double best = (selfEnd - selfMid) / sigSecs; r.hottest = "vibe-dsp";
    r.threads.push_back({ "vibe-dsp", 100.0 * best });
    for (const auto& kv : after) {
        if (before.count(kv.first)) continue;       // a thread that existed before this scenario is not ours
        auto m = mid.find(kv.first);
        const double used = kv.second - (m != mid.end() ? m->second : 0.0);
        // ★ EVERY thread's own figure, not only the worst: Advanced RDS lands on vibe-demod, and on a box where
        //   that is not yet the hottest the cost would otherwise be invisible until it is.
        r.threads.push_back({ names[kv.first], 100.0 * used / sigSecs });
        if (used / sigSecs > best) { best = used / sigSecs; r.hottest = names[kv.first]; }
    }
    (void)self0;
    r.pct = 100.0 * best;
    return r;
}
inline const char* grade(double pct) { return pct < 0 ? "none" : pct < 70 ? "green" : pct <= 85 ? "amber" : "red"; }
} // namespace benchdetail

/** ★★ UPLINK, in kB/s — the other half of "how many listeners" (Stuart, 2026-09-19: a box in deepest Brazil may have
 *  CPU to spare and no bandwidth). ~4 MB posted to the directory's /api/speedtest, which reads and discards it; curl
 *  times it. -1 if it could not be measured. Desktop/Linux only — Android measures in Kotlin and passes it in. */
inline double measureUplinkKBps() {
#if defined(__ANDROID__)
    return -1;
#else
    FILE* p = popen("head -c 4194304 /dev/urandom | curl -s --max-time 60 -X POST --data-binary @- "
                    "-H 'Content-Type: application/octet-stream' -o /dev/null -w '%{speed_upload} %{http_code}' "
                    "https://vibeserver.vibesdr.net/api/speedtest 2>/dev/null", "r");
    if (!p) return -1;
    char b[128] = {0}; const bool got = fgets(b, sizeof b, p) != nullptr; pclose(p);
    double bps = 0; int code = 0;
    if (!got || sscanf(b, "%lf %d", &bps, &code) != 2 || code != 200 || bps <= 0) return -1;
    return bps / 1024.0;
#endif
}

/** Run the benchmark. `progress(done, of, label)` is told as each scenario starts. Returns the result as JSON:
 *  {"v":1,"at":<epoch>,"rows":[{id,label,rate,pct,grade,thread}],"recommendRate":<Hz>,"lockedUsers":{nfm,am,ssb}}. */
inline std::string runBenchmark(const std::function<void(int, int, const std::string&)>& progress = nullptr,
                                double secondsPerScenario = 4.0, double uplinkKBps = -2,
                                const std::function<std::vector<benchdetail::Result>()>& moreRows = nullptr) {
    // ★ moreRows: rows a host adds that need more than vibedsp — DAB (vibe_benchmark_dab.h: runDabRows), which
    //   pulls in the DAB service and its audio decoder. A row graded "none" (pct -1) could not be measured.
    // -2 = measure it here (desktop/Linux); an Android host passes its own figure, or -1 for "could not".
    if (uplinkKBps == -2) { if (progress) progress(0, 1, "network uplink"); uplinkKBps = measureUplinkKBps(); }
    using namespace benchdetail;
    using M = RxPipeline::Mode;
    struct Sc { const char* id; const char* label; double fs; M mode; double bw; bool fm; bool rds; };
    // ★ Name the pipeline's worker threads, so the hottest one can be reported — unless the host already does.
    if (!RxPipeline::workerInit()) RxPipeline::workerInit() = [](const char* n) {
#if defined(__linux__) || defined(__ANDROID__)
        pthread_setname_np(pthread_self(), n);
#else
        (void)n;
#endif
    };
    const Sc sc[] = {
        { "wfm_2400",  "WFM stereo @ 2.4 MS/s",            2400000, M::WFM,     200000, true,  false },
        { "wfm_2048",  "WFM stereo @ 2.048 MS/s",          2048000, M::WFM,     200000, true,  false },
        { "wfm_1024",  "WFM stereo @ 1.024 MS/s",          1024000, M::WFM,     200000, true,  false },
        { "rdsx_2048", "WFM + Advanced RDS @ 2.048 MS/s",  2048000, M::WFM,     200000, true,  true  },
        { "nfm_2048",  "NFM @ 2.048 MS/s",                 2048000, M::NFM,      12500, false, false },
        { "am_2048",   "AM @ 2.048 MS/s",                  2048000, M::AM,       10000, false, false },
        { "ssb_2048",  "SSB @ 2.048 MS/s",                 2048000, M::SSB_USB,   2700, false, false },
    };
    const int N = (int)(sizeof sc / sizeof sc[0]);
    std::vector<Result> res;
    std::map<double, std::vector<cf32>> fmCache, nbCache;
    for (int i = 0; i < N; ++i) {
        if (progress) progress(i, N, sc[i].label);
        auto& cache = sc[i].fm ? fmCache : nbCache;
        if (!cache.count(sc[i].fs))
            cache[sc[i].fs] = sc[i].fm ? fmStation(sc[i].fs, 1.0, 200000.0) : nbSignal(sc[i].fs, 1.0, 200000.0);
        res.push_back(runOne(sc[i].id, sc[i].label, sc[i].fs, sc[i].mode, sc[i].bw, cache[sc[i].fs],
                             secondsPerScenario, sc[i].rds));
    }
    // ★★ LOCKED RANGE — ONE LISTENER'S DEMODULATOR AT CHANNEL RATE. There each listener runs their own demod on a
    //    narrow channel cut from the shared capture, on their own thread; the shared front (the wide filtering) is
    //    the vibe-dsp figure above and is paid once. So: time one demod at its channel rate (all its threads summed —
    //    they are that listener's), and fit as many as the spare cores carry inside the green budget.
    struct Lk { const char* id; const char* label; double fs; M mode; double bw; bool fm; };
    const Lk lk[] = {
        // ★ The server's own channel rates (chanBinsFor: ~2.5x the bandwidth, whole FFT bins, 2.048 MS/s / 4096):
        //   512 kHz for WFM, 32 kHz for the narrow modes.
        // ★★ PROVISIONAL: this times the DEMOD only. A live locked-range listener also pays their own Opus encode,
        //    their private zoom spectrum and their slice of the channelizer — live on the Pi 2 an NFM listener cost
        //    ~27 % where this reads ~6 %. Calibrate against a live locked run before these numbers drive a limit.
        { "lk_wfm", "Locked range, per WFM listener (demod only)", 512000, M::WFM,     200000, true  },
        { "lk_nfm", "Locked range, per NFM listener (demod only)",  32000, M::NFM,      12500, false },
        { "lk_am",  "Locked range, per AM listener (demod only)",   32000, M::AM,       10000, false },
        { "lk_ssb", "Locked range, per SSB listener (demod only)",  32000, M::SSB_USB,   2700, false },
    };
    std::map<std::string, double> perListener;
    for (const auto& l : lk) {
        if (progress) progress(N, N, l.label);
        const auto sig = l.fm ? fmStation(l.fs, 1.0, 0.0) : nbSignal(l.fs, 1.0, 0.0);
        Result one = runOne(l.id, l.label, l.fs, l.mode, l.bw, sig, secondsPerScenario, false);
        double sum = 0; for (const auto& t : one.threads) sum += t.second;
        one.pct = sum;                              // ★ a listener's whole cost: all of its threads
        perListener[l.id] = sum;
        res.push_back(one);
    }
    if (moreRows) { if (progress) progress(N, N, "DAB+"); for (auto& r : moreRows()) res.push_back(r); }
    if (progress) progress(N, N, "done");
    // ★ The recommended rate: the highest WFM rate that grades green, never below 1.024 MS/s.
    double rec = 1024000;
    for (const auto& r : res)
        if (r.id.rfind("wfm_", 0) == 0 && r.pct < 70 && r.rate > rec) rec = r.rate;
    // ★ Locked range: every listener is a demodulator of their own, so the ceiling is how many fit in one core's
    //   green budget. An ESTIMATE from the single-listener figure, labelled as one.
    // ★ Spare cores = all but the one the shared front (vibe-dsp) holds; each gets the green budget (70 %).
    const long cores = std::max(1L, sysconf(_SC_NPROCESSORS_ONLN));
    const double budget = 70.0 * std::max(1L, cores - 1);
    auto usersFor = [&](const char* id) {
        auto it = perListener.find(id);
        // ★ Capped at 20: past that the uplink decides, not the CPU (a fast machine "fits" thousands).
        return (it == perListener.end() || it->second <= 0) ? 0 : std::min(20, std::max(0, (int)std::floor(budget / it->second)));
    };
    std::string j = "{\"v\":1,\"at\":" + std::to_string((long long)time(nullptr)) + ",\"rows\":[";
    for (size_t i = 0; i < res.size(); ++i) {
        char b[320];
        snprintf(b, sizeof b, "%s{\"id\":\"%s\",\"label\":\"%s\",\"rate\":%.0f,\"pct\":%.1f,\"grade\":\"%s\",\"thread\":\"%s\",\"threads\":{",
                 i ? "," : "", res[i].id.c_str(), res[i].label.c_str(), res[i].rate, res[i].pct, grade(res[i].pct),
                 res[i].hottest.c_str());
        j += b;
        for (size_t t = 0; t < res[i].threads.size(); ++t) {
            snprintf(b, sizeof b, "%s\"%s\":%.1f", t ? "," : "", res[i].threads[t].first.c_str(), res[i].threads[t].second);
            j += b;
        }
        j += "}}";
    }
    j += "],\"recommendRate\":" + std::to_string((long long)rec);
    j += ",\"cores\":" + std::to_string(cores);
    // ★ Listeners the LINK carries at 100 kB/s each — Stuart's worst case, above the ~80-90 kB/s DAB+ peaks
    //   (a jitter buffer catching up). The smaller of this and the CPU figures is the honest ceiling.
    if (uplinkKBps > 0) {
        char nb[96]; snprintf(nb, sizeof nb, ",\"network\":{\"uplinkKBps\":%.0f,\"users\":%d}", uplinkKBps, (int)std::floor(uplinkKBps / 100.0));
        j += nb;
    } else j += ",\"network\":null";
    j += ",\"lockedUsers\":{\"wfm\":" + std::to_string(usersFor("lk_wfm")) + ",\"nfm\":" + std::to_string(usersFor("lk_nfm"))
       + ",\"am\":" + std::to_string(usersFor("lk_am")) + ",\"ssb\":" + std::to_string(usersFor("lk_ssb")) + "}}";
    return j;
}

} // namespace vibe

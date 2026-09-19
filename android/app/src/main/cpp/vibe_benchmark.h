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

/** A broadcast-FM station: stereo tones, 19 kHz pilot, 57 kHz RDS-like subcarrier — so every stage of the WFM
 *  chain (stereo, RDS, the eye, the CEQ) has real work to do. */
inline std::vector<cf32> fmStation(double fs, double seconds, double offset) {
    const int n = (int)(fs * seconds);
    std::vector<cf32> iq(n);
    double ph = 0.0;
    for (int i = 0; i < n; ++i) {
        const double t = i / fs;
        const double L = 0.3 * std::cos(2 * M_PI * 1000.0 * t), R = 0.3 * std::cos(2 * M_PI * 4000.0 * t);
        const double mpx = (L + R) + 0.1 * std::sin(2 * M_PI * 19000.0 * t) + (L - R) * std::sin(2 * M_PI * 38000.0 * t)
                         + 0.04 * std::sin(2 * M_PI * 57000.0 * t) * (std::sin(2 * M_PI * 1187.5 * t) > 0 ? 1 : -1);
        ph += 2 * M_PI * (offset + 60000.0 * mpx) / fs;
        if (ph > 2 * M_PI) ph -= 2 * M_PI;
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

/** Run one scenario: `seconds` of signal through a fresh RxPipeline, fed as fast as it will take it; the hottest
 *  thread's CPU over the signal's duration is the score. */
inline Result runOne(const std::string& id, const std::string& label, double fs, RxPipeline::Mode mode, double bw,
                     const std::vector<cf32>& iq, double seconds, bool rdsExt) {
    Result r; r.id = id; r.label = label; r.rate = fs;
    static std::atomic<bool> rdsOff{false}, rdsOn{true};
    RxPipeline pipe;
    RxPipeline::Callbacks cb; cb.audio = noAudio; cb.spectrum = noSpec;
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
inline const char* grade(double pct) { return pct < 70 ? "green" : pct <= 85 ? "amber" : "red"; }
} // namespace benchdetail

/** Run the benchmark. `progress(done, of, label)` is told as each scenario starts. Returns the result as JSON:
 *  {"v":1,"at":<epoch>,"rows":[{id,label,rate,pct,grade,thread}],"recommendRate":<Hz>,"lockedUsers":{nfm,am,ssb}}. */
inline std::string runBenchmark(const std::function<void(int, int, const std::string&)>& progress = nullptr,
                                double secondsPerScenario = 4.0) {
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
    if (progress) progress(N, N, "done");
    // ★ The recommended rate: the highest WFM rate that grades green, never below 1.024 MS/s.
    double rec = 1024000;
    for (const auto& r : res)
        if (r.id.rfind("wfm_", 0) == 0 && r.pct < 70 && r.rate > rec) rec = r.rate;
    // ★ Locked range: every listener is a demodulator of their own, so the ceiling is how many fit in one core's
    //   green budget. An ESTIMATE from the single-listener figure, labelled as one.
    auto usersFor = [&](const char* id) {
        for (const auto& r : res) if (r.id == id && r.pct > 0) return std::max(0, (int)std::floor(70.0 / r.pct));
        return 0;
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
    j += ",\"lockedUsers\":{\"nfm\":" + std::to_string(usersFor("nfm_2048")) + ",\"am\":" + std::to_string(usersFor("am_2048"))
       + ",\"ssb\":" + std::to_string(usersFor("ssb_2048")) + "}}";
    return j;
}

} // namespace vibe

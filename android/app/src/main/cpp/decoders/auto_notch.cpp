// VibeSDR V4 — NLMS automatic notch filter (adaptive line enhancer, notch mode).
#include "auto_notch.h"
#include "../vibedsp/simd_internal.h"   // dotReal + the vector NLMS update
#include <algorithm>

namespace vibe {

AutoNotch::AutoNotch() { buf.assign(2 * M, 0.0f); w.assign(L, 0.0f); }

void AutoNotch::reset() {
    std::fill(buf.begin(), buf.end(), 0.0f);
    std::fill(w.begin(), w.end(), 0.0f);
    p = 0;
}

void AutoNotch::process(float* x, int count) {
    for (int n = 0; n < count; n++) {
        // Decreasing write pointer + mirror at p+M: the most recent M samples are
        // always contiguous at buf[p .. p+M-1], newest first — so x[n-d] = buf[p+d]
        // with no per-tap modulo.
        p = (p == 0) ? M - 1 : p - 1;
        float in = x[n];
        buf[p] = in; buf[p + M] = in;

        // FIR predicts the periodic part from samples delayed by D..D+L-1;
        // pwr is the energy of those same taps for the NLMS normalisation.
        int base = p + D;                // index of x[n-D]; base+i = x[n-D-i]
        /* ★ 160 taps, twice, per audio sample = 15 M multiply-adds a second — the heaviest
         *  audio-rate loop in the engine, and it was scalar (2026-09-16). The prediction and
         *  the tap energy are two dot products; the update is an axpy. L is a multiple of 8. */
        const float* s = &buf[(size_t)base];
        const float fir = vibedsp::dotReal(w.data(), s, L);
        const float pwr = vibedsp::dotReal(s, s, L);
        float err = in - fir;            // tones removed → notch output
        x[n] = err;

        // Leaky NLMS coefficient update.
        float g = mu * err / (eps + pwr);
        {
            int i = 0;
#if VIBE_NEON
            const float32x4_t lk = vdupq_n_f32(leak), gv = vdupq_n_f32(g);
            for (; i + 4 <= L; i += 4)
                vst1q_f32(&w[(size_t)i], vmlaq_f32(vmulq_f32(lk, vld1q_f32(&w[(size_t)i])), gv, vld1q_f32(s + i)));
#elif VIBE_SSE
            const __m128 lk = _mm_set1_ps(leak), gv = _mm_set1_ps(g);
            for (; i + 4 <= L; i += 4)
                _mm_storeu_ps(&w[(size_t)i], _mm_add_ps(_mm_mul_ps(lk, _mm_loadu_ps(&w[(size_t)i])), _mm_mul_ps(gv, _mm_loadu_ps(s + i))));
#endif
            for (; i < L; i++) w[i] = leak * w[i] + g * s[i];
        }
    }
}

} // namespace vibe

// vibedsp/neon_compat.h — the AArch64-only NEON intrinsics, spelled for 32-bit ARMv7.
//
// ★★★ EVERY NEON KERNEL IN THIS TREE WAS GATED ON __aarch64__, SO 32-BIT ARM RAN SCALAR.
//     The Android app ships armeabi-v7a alongside arm64-v8a, and armeabi-v7a is exactly the
//     old-hardware phone Stuart wants VibeSDR to run well on ("where most apps and OS's leave old
//     hardware behind I want VibeSDR to break the mould", 2026-09-16). The NDK builds that ABI with
//     NEON on (-mfpu=neon, __ARM_NEON defined), yet the `&& defined(__aarch64__)` on every gate
//     sent it down the fallback path: the Viterbi, the 2.4→2.048 resampler, the FIR and DDC
//     kernels, the u8→float conversion — all scalar on the phones least able to afford it.
//     The Pi 3 benchmark of 2026-09-16 (armhf, 32-bit) measured that same scalar path, which is
//     why its Viterbi and demapper figures looked so far from "already NEON".
//
// ★★ WHY A COMPAT HEADER AND NOT A REWRITE. ARMv7 NEON has the whole 128-bit arithmetic set; what
//    it lacks is the AArch64 ADDITIONS — the across-vector reductions (vaddvq, vmaxvq, vminvq), the
//    16-byte table lookup (vqtbl1), vector divide and sqrt, and vpadd on q registers. The kernels
//    use exactly eleven of those (grep'd 2026-09-16). Supplying those eleven here, with the same
//    names and the same results, lets every NEON body stay byte-for-byte as it was proven on
//    AArch64 — "the NEON bodies are not touched" (simd_internal.h) still holds.
//
// ★ Each function below is the AArch64 instruction's exact semantics built from ARMv7 ones:
//   pairwise adds fold a q register down to one lane in three steps; vqtbl1_u8 is vtbl2_u8 over
//   the two halves of the 16-byte table (out-of-range indices give 0 on both, as the A64 spec
//   says); vdivq_f32 is a reciprocal estimate plus two Newton–Raphson steps, which is what the
//   compiler itself emits for a/b on ARMv7 at -ffast-math and is accurate to ~1 ulp.
//
// Included from simd_internal.h and from every DAB header that carries a NEON kernel; a no-op on
// AArch64 and on x86.
#pragma once

#if defined(__ARM_NEON) && !defined(__aarch64__)
#include <arm_neon.h>

// ── across-vector reductions ────────────────────────────────────────────────
static inline float vaddvq_f32(float32x4_t v) {
    float32x2_t s = vadd_f32(vget_low_f32(v), vget_high_f32(v));
    s = vpadd_f32(s, s);
    return vget_lane_f32(s, 0);
}
static inline uint32_t vaddvq_u32(uint32x4_t v) {
    uint32x2_t s = vadd_u32(vget_low_u32(v), vget_high_u32(v));
    s = vpadd_u32(s, s);
    return vget_lane_u32(s, 0);
}
static inline uint32_t vmaxvq_u32(uint32x4_t v) {
    uint32x2_t s = vmax_u32(vget_low_u32(v), vget_high_u32(v));
    s = vpmax_u32(s, s);
    return vget_lane_u32(s, 0);
}
static inline uint16_t vminvq_u16(uint16x8_t v) {
    uint16x4_t s = vmin_u16(vget_low_u16(v), vget_high_u16(v));
    s = vpmin_u16(s, s);
    s = vpmin_u16(s, s);
    return vget_lane_u16(s, 0);
}
static inline uint8_t vmaxvq_u8(uint8x16_t v) {
    uint8x8_t s = vmax_u8(vget_low_u8(v), vget_high_u8(v));
    s = vpmax_u8(s, s); s = vpmax_u8(s, s); s = vpmax_u8(s, s);
    return vget_lane_u8(s, 0);
}
static inline uint8_t vminvq_u8(uint8x16_t v) {
    uint8x8_t s = vmin_u8(vget_low_u8(v), vget_high_u8(v));
    s = vpmin_u8(s, s); s = vpmin_u8(s, s); s = vpmin_u8(s, s);
    return vget_lane_u8(s, 0);
}
/** ★ Sum of sixteen bytes — widened first, as A64 does, so it cannot wrap at 255. */
static inline uint16_t vaddvq_u8(uint8x16_t v) {
    const uint16x8_t w = vpaddlq_u8(v);                       // 8 x u16
    const uint32x4_t x = vpaddlq_u16(w);                      // 4 x u32
    return uint16_t(vaddvq_u32(x));
}
static inline uint16_t vaddv_u8(uint8x8_t v) {
    const uint16x4_t w = vpaddl_u8(v);                        // 4 x u16
    const uint32x2_t x = vpaddl_u16(w);                       // 2 x u32
    return uint16_t(vget_lane_u32(vpadd_u32(x, x), 0));
}

// ── table lookup ────────────────────────────────────────────────────────────
/** vqtbl1_u8: 8 lookups into a 16-byte table; an index ≥ 16 yields 0 on A64, and vtbl2_u8 does
 *  the same for its 16-entry table. */
static inline uint8x8_t vqtbl1_u8(uint8x16_t table, uint8x8_t idx) {
    uint8x8x2_t t;
    t.val[0] = vget_low_u8(table);
    t.val[1] = vget_high_u8(table);
    return vtbl2_u8(t, idx);
}

// ── divide ──────────────────────────────────────────────────────────────────
/** a / b, four lanes: reciprocal estimate refined twice (≈ 1 ulp). Lanes with b = 0 return the
 *  estimate's ±inf, as a true divide would. */
static inline float32x4_t vdivq_f32(float32x4_t a, float32x4_t b) {
    float32x4_t r = vrecpeq_f32(b);
    r = vmulq_f32(vrecpsq_f32(b, r), r);
    r = vmulq_f32(vrecpsq_f32(b, r), r);
    return vmulq_f32(a, r);
}

#endif  // ARMv7 NEON

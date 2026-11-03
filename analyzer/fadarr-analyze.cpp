/*
 * fadarr-analyze — analyse d'un morceau : BPM et grille, tonalité, premier et dernier son.
 *
 * Entrée : PCM float32 little-endian stéréo entrelacé sur stdin (ex. ffmpeg -ac 2 -f f32le -).
 * Sortie : une ligne JSON sur stdout.
 * Usage  : fadarr-analyze <fréquence d'échantillonnage>
 *
 * Mêmes algorithmes et réglages que Mixxx (https://github.com/mixxxdj/mixxx, GPL-2.0-or-later) :
 *   - src/analyzer/plugins/analyzerqueenmarybeats.cpp  (détection des temps, qm-dsp TempoTrackV2)
 *   - src/track/beatutils.cpp + beatfactory.cpp         (grille à tempo constant, arrondi du BPM, phase)
 *   - src/analyzer/plugins/analyzerqueenmarykey.cpp    (tonalité, qm-dsp GetKeyMode)
 *   - src/track/keyutils.cpp calculateGlobalKey          (tonalité principale = la plus longue)
 *   - src/analyzer/analyzersilence.cpp                   (premier / dernier son à -60 dB)
 *   - src/analyzer/plugins/buffering_utils.cpp           (mixage mono et fenêtres glissantes)
 * Bibliothèque qm-dsp (Queen Mary, University of London), GPL-2.0-or-later, copie de Mixxx dans ./qm-dsp.
 *
 * Copyright (C) Mixxx Development Team et contributeurs qm-dsp ; adaptation fadarr.
 * Ce programme est un logiciel libre : GPL-2.0-or-later (voir LICENSE à la racine).
 */
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <map>
#include <memory>
#include <vector>

#include "dsp/keydetection/GetKeyMode.h"
#include "dsp/onsets/DetectionFunction.h"
#include "dsp/tempotracking/TempoTrackV2.h"
#include "maths/MathUtilities.h"

namespace {

// ---------- buffering_utils.cpp : DownmixAndOverlapHelper ----------
class Overlap {
  public:
    using Cb = std::function<bool(double*, size_t)>;
    bool init(size_t win, size_t step, Cb cb) {
        buf.assign(win, 0.0);
        this->cb = std::move(cb);
        this->win = win;
        this->step = step;
        pos = win / 2; // première trame centrée dans la fenêtre
        return win > 0 && step > 0 && step <= win;
    }
    bool stereo(const float* in, size_t frames) { return inner(in, frames); }
    bool finish() {
        size_t fill = win - pos;
        size_t n = std::max(fill, win / 2 - 1);
        return inner(nullptr, n);
    }

  private:
    bool inner(const float* in, size_t frames) {
        size_t read = 0;
        while (read < frames) {
            size_t n = std::min(frames - read, win - pos);
            for (size_t i = 0; i < n; ++i) {
                buf[pos + i] = in ? (in[(read + i) * 2] + in[(read + i) * 2 + 1]) * 0.5 : 0.0;
            }
            pos += n;
            read += n;
            if (pos == win) {
                if (!cb(buf.data(), win)) return false;
                for (size_t i = 0; i < win - step; ++i) buf[i] = buf[i + step];
                pos -= step;
            }
        }
        return true;
    }
    std::vector<double> buf;
    Cb cb;
    size_t win = 0, step = 0, pos = 0;
};

// ---------- beatutils.cpp ----------
constexpr double kMaxSecsPhaseError = 0.025;
constexpr double kMaxSecsPhaseErrorSum = 0.1;
constexpr int kMaxOutliersCount = 1;
constexpr int kMinRegionBeatCount = 16;

struct Region {
    double firstBeat;
    double beatLength;
};

std::vector<Region> constRegions(const std::vector<double>& b, double sr) {
    std::vector<Region> out;
    if (b.size() < 2) return out;
    const double maxErr = kMaxSecsPhaseError * sr;
    const double maxErrSum = kMaxSecsPhaseErrorSum * sr;
    int left = 0;
    int right = (int)b.size() - 1;
    while (left < (int)b.size() - 1) {
        double mean = (b[right] - b[left]) / (right - left);
        int outliers = 0;
        double ironed = b[left];
        double errSum = 0;
        int i = left + 1;
        for (; i <= right; ++i) {
            ironed += mean;
            const double err = ironed - b[i];
            errSum += err;
            if (std::fabs(err) > maxErr) {
                outliers++;
                if (outliers > kMaxOutliersCount || i == left + 1) break;
            }
            if (std::fabs(errSum) > maxErrSum) break;
        }
        if (i > right) {
            double border = 0;
            if (right > left + 2) {
                const double first = b[left + 1] - b[left];
                const double last = b[right] - b[right - 1];
                border = std::fabs(first + last - 2 * mean);
            }
            if (border < maxErr / 2) {
                out.push_back({b[left], mean});
                left = right;
                right = (int)b.size() - 1;
                continue;
            }
        }
        right--;
    }
    out.push_back({b.back(), 0});
    return out;
}

bool trySnap(double minB, double center, double maxB, double frac, double& res) {
    double s = std::round(center * frac) / frac;
    if (s > minB && s < maxB) {
        res = s;
        return true;
    }
    return false;
}

double roundBpm(double minB, double center, double maxB) {
    double r;
    if (trySnap(minB, center, maxB, 1.0, r)) return r;
    if (center < 85.0 && trySnap(minB, center, maxB, 2.0, r)) return r;
    if (center > 127.0 && trySnap(minB, center, maxB, 2.0 / 3.0, r)) return r;
    if (trySnap(minB, center, maxB, 3.0, r)) return r;
    if (trySnap(minB, center, maxB, 12.0, r)) return r;
    return center;
}

// Renvoie le BPM (0 si impossible) et la position du premier temps (en trames) dans *first.
double makeConstBpm(const std::vector<Region>& R, double sr, double* first) {
    int mid = 0;
    double longLen = 0, longBeat = 0;
    for (int i = 0; i < (int)R.size() - 1; ++i) {
        double len = R[i + 1].firstBeat - R[i].firstBeat;
        if (len > longLen) {
            longLen = len;
            longBeat = R[i].beatLength;
            mid = i;
        }
    }
    if (longLen == 0) return 0;
    int longN = (int)(longLen / longBeat + 0.5);
    double lMin = longBeat - (kMaxSecsPhaseError * sr) / longN;
    double lMax = longBeat + (kMaxSecsPhaseError * sr) / longN;
    int start = mid;

    for (int i = 0; i < mid; ++i) {
        const double len = R[i + 1].firstBeat - R[i].firstBeat;
        const int n = (int)(len / R[i].beatLength + 0.5);
        if (n < kMinRegionBeatCount) continue;
        const double tMin = R[i].beatLength - (kMaxSecsPhaseError * sr) / n;
        const double tMax = R[i].beatLength + (kMaxSecsPhaseError * sr) / n;
        if (longBeat > tMin && longBeat < tMax) {
            const double newLen = R[mid + 1].firstBeat - R[i].firstBeat;
            const double bMin = std::max(lMin, tMin);
            const double bMax = std::min(lMax, tMax);
            const int maxN = (int)std::round(newLen / bMin);
            const int minN = (int)std::round(newLen / bMax);
            if (minN != maxN) continue;
            const double nb = newLen / minN;
            if (nb > lMin && nb < lMax) {
                longLen = newLen;
                longBeat = nb;
                longN = minN;
                lMin = longBeat - (kMaxSecsPhaseError * sr) / longN;
                lMax = longBeat + (kMaxSecsPhaseError * sr) / longN;
                start = i;
                break;
            }
        }
    }
    for (int i = (int)R.size() - 2; i > mid; --i) {
        const double len = R[i + 1].firstBeat - R[i].firstBeat;
        const int n = (int)(len / R[i].beatLength + 0.5);
        if (n < kMinRegionBeatCount) continue;
        const double tMin = R[i].beatLength - (kMaxSecsPhaseError * sr) / n;
        const double tMax = R[i].beatLength + (kMaxSecsPhaseError * sr) / n;
        if (longBeat > tMin && longBeat < tMax) {
            const double newLen = R[i + 1].firstBeat - R[start].firstBeat;
            const double bMin = std::max(lMin, tMin);
            const double bMax = std::min(lMax, tMax);
            const int maxN = (int)std::round(newLen / bMin);
            const int minN = (int)std::round(newLen / bMax);
            if (minN != maxN) continue;
            const double nb = newLen / minN;
            if (nb > lMin && nb < lMax) {
                longLen = newLen;
                longBeat = nb;
                longN = minN;
                break;
            }
        }
    }
    lMin = longBeat - (kMaxSecsPhaseError * sr) / longN;
    lMax = longBeat + (kMaxSecsPhaseError * sr) / longN;
    const double bpm = roundBpm(60.0 * sr / lMax, 60.0 * sr / longBeat, 60.0 * sr / lMin);
    if (!(bpm > 0)) return 0;
    if (first) *first = std::fmod(R[start].firstBeat, 60.0 * sr / bpm);
    return bpm;
}

double adjustPhase(double first, double bpm, double sr, const std::vector<double>& beats) {
    const double len = 60 * sr / bpm;
    const double startOff = std::fmod(first, len);
    double adj = 0, cnt = 0;
    for (double b : beats) {
        double off = std::fmod(b - startOff, len);
        if (off > len / 2) off -= len;
        if (std::fabs(off) < kMaxSecsPhaseError * sr) {
            adj += off;
            cnt++;
        }
    }
    if (cnt > 0) adj /= cnt;
    return first + adj;
}

constexpr float kSilence = 0.001f; // -60 dB (analyzersilence.cpp)

// ---------- ajout fadarr : la grille sur la grosse caisse, pas sur le contretemps ----------
// Le détecteur qm-dsp accroche parfois les charlestons du contretemps (temps juste, grille décalée d'un demi-temps ;
// ~30 % des morceaux sur une clé de test comparée à ses grilles Rekordbox). On compare la montée d'énergie dans les
// graves (< 150 Hz) sur les temps et un demi-temps plus loin, et on garde la plus forte.
constexpr int kLowBlock = 128; // ~2,9 ms à 44,1 kHz

double lowFluxAround(const std::vector<float>& flux, double sr, double tSec, double winSec) {
    const double blocksPerSec = sr / kLowBlock;
    long a = (long)std::floor((tSec - winSec) * blocksPerSec);
    long b = (long)std::ceil((tSec + winSec) * blocksPerSec);
    if (a < 0) a = 0;
    if (b >= (long)flux.size()) b = (long)flux.size() - 1;
    double m = 0;
    for (long i = a; i <= b; ++i) m = std::max(m, (double)flux[i]);
    return m;
}

// Renvoie 0 (garder) ou 0,5 (décaler d'un demi-temps), d'après la somme des montées de graves.
double kickPhase(const std::vector<float>& flux, double sr, double firstBeatSec, double bpm, double durSec, double* ratio) {
    const double beat = 60.0 / bpm;
    double on = 0, off = 0;
    for (double t = firstBeatSec; t < durSec; t += beat) {
        on += lowFluxAround(flux, sr, t, 0.015);
        off += lowFluxAround(flux, sr, t + beat / 2, 0.015);
    }
    if (ratio) *ratio = on > 0 ? off / on : 0;
    return off > on * 1.15 ? 0.5 : 0.0;
}

} // namespace

int main(int argc, char** argv) {
    const double sr = argc > 1 ? std::atof(argv[1]) : 44100.0;
    if (!(sr > 1000)) {
        std::fprintf(stderr, "usage: fadarr-analyze <samplerate>  (f32le stéréo sur stdin)\n");
        return 2;
    }

    // --- temps (analyzerqueenmarybeats.cpp) ---
    const int step = (int)(sr * 0.01161f);
    const int win = MathUtilities::nextPowerOfTwo((int)(sr / 50));
    DFConfig cfg;
    cfg.DFType = DF_COMPLEXSD;
    cfg.stepSize = step;
    cfg.frameLength = win;
    cfg.dbRise = 3;
    cfg.adaptiveWhitening = false;
    cfg.whiteningRelaxCoeff = -1;
    cfg.whiteningFloor = -1;
    auto df = std::make_unique<DetectionFunction>(cfg);
    std::vector<double> results;
    Overlap beatBuf;
    beatBuf.init(win, step, [&](double* w, size_t) {
        results.push_back(df->processTimeDomain(w));
        return true;
    });

    // --- tonalité (analyzerqueenmarykey.cpp) ---
    GetKeyMode::Config kcfg(sr, 440);
    auto km = std::make_unique<GetKeyMode>(kcfg);
    std::vector<std::pair<int, double>> keyChanges;
    int prevKey = 0;
    double frame = 0;
    Overlap keyBuf;
    keyBuf.init(km->getBlockSize(), km->getHopSize(), [&](double* w, size_t) {
        int k = km->process(w);
        if (k < 1 || k > 24) return true;
        if (k != prevKey) {
            keyChanges.push_back({k, frame});
            prevKey = k;
        }
        return true;
    });

    // --- lecture ---
    // graves pour le contrôle de phase (ajout fadarr) : passe-bas à deux pôles ~150 Hz, énergie par bloc de 128 trames
    std::vector<float> lowEnergy;
    double lp1 = 0, lp2 = 0, blockSum = 0;
    int blockFill = 0;
    const double lpc = std::exp(-2.0 * M_PI * 150.0 / sr);

    const size_t CH = 4096;
    std::vector<float> in(CH * 2);
    double total = 0;
    double firstSound = -1, lastSound = -1;
    size_t got;
    while ((got = std::fread(in.data(), sizeof(float) * 2, CH, stdin)) > 0) {
        for (size_t f = 0; f < got; ++f) {
            const double x = 0.5 * (in[f * 2] + in[f * 2 + 1]);
            lp1 = x * (1 - lpc) + lp1 * lpc;
            lp2 = lp1 * (1 - lpc) + lp2 * lpc;
            blockSum += lp2 * lp2;
            if (++blockFill == kLowBlock) { lowEnergy.push_back((float)blockSum); blockSum = 0; blockFill = 0; }
        }
        for (size_t i = 0; i < got * 2; ++i) {
            if (std::fabs(in[i]) >= kSilence) {
                if (firstSound < 0) firstSound = total + (double)(i / 2);
                lastSound = total + (double)(i / 2);
            }
        }
        frame += (double)got;
        beatBuf.stereo(in.data(), got);
        keyBuf.stereo(in.data(), got);
        total += (double)got;
    }
    beatBuf.finish();
    keyBuf.finish();

    // --- grille ---
    size_t nonZero = results.size();
    while (nonZero > 0 && results[nonZero - 1] <= 0.0) --nonZero;
    std::vector<double> dfv;
    for (size_t i = 2; i < nonZero; ++i) dfv.push_back(results[i]);
    std::vector<double> beats;
    double bpm = 0, firstBeat = 0;
    if (dfv.size() > 4) {
        std::vector<int> period(dfv.size() / 128 + 1);
        TempoTrackV2 tt((float)sr, step);
        tt.calculateBeatPeriod(dfv, period);
        std::vector<double> raw;
        tt.calculateBeats(dfv, period, raw);
        for (double b : raw) beats.push_back(b * step + step / 2);
        if (beats.size() >= 2) {
            auto regions = constRegions(beats, sr);
            bpm = makeConstBpm(regions, sr, &firstBeat);
            if (bpm > 0) firstBeat = adjustPhase(firstBeat, bpm, sr, beats);
        }
    }
    double phaseRatio = 0, shifted = 0;
    if (bpm > 0 && lowEnergy.size() > 8) {
        std::vector<float> flux(lowEnergy.size(), 0.f);
        for (size_t i = 1; i < lowEnergy.size(); ++i) flux[i] = std::max(0.f, std::sqrt(lowEnergy[i]) - std::sqrt(lowEnergy[i - 1]));
        shifted = kickPhase(flux, sr, firstBeat / sr, bpm, total / sr, &phaseRatio);
        if (shifted > 0) firstBeat += shifted * 60.0 * sr / bpm;
    }

    // --- tonalité principale (keyutils.cpp calculateGlobalKey) ---
    int key = 0;
    if (keyChanges.size() == 1) {
        key = keyChanges[0].first;
    } else if (!keyChanges.empty()) {
        std::map<int, double> hist;
        for (size_t i = 0; i < keyChanges.size(); ++i) {
            double next = i + 1 == keyChanges.size() ? total : keyChanges[i + 1].second;
            hist[keyChanges[i].first] += next - keyChanges[i].second;
        }
        double best = 0;
        for (auto& kv : hist) {
            if (kv.second > best) {
                best = kv.second;
                key = kv.first;
            }
        }
    }

    std::printf("{\"durationSec\":%.4f,\"bpm\":%.4f,\"firstBeatSec\":%.5f,\"beats\":%zu,\"key\":%d,"
                "\"firstSoundSec\":%.5f,\"lastSoundSec\":%.5f,\"halfShift\":%d,\"phaseRatio\":%.3f}\n",
            total / sr, bpm, bpm > 0 ? firstBeat / sr : 0.0, beats.size(), key,
            firstSound < 0 ? 0.0 : firstSound / sr, lastSound < 0 ? 0.0 : lastSound / sr, shifted > 0 ? 1 : 0, phaseRatio);
    return 0;
}

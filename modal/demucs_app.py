import os
import tempfile
import pathlib
import subprocess
import modal

# Define the Modal App
app = modal.App("demucs-audio-separation")

demucs_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "demucs",
        "soundfile",
        "torch",
        "torchaudio",
        "numpy",
        "audio-separator[gpu]",
        "torchcodec",
        "nvidia-cuda-runtime-cu12",
        "nvidia-cudnn-cu12",
        "nvidia-cublas-cu12",
        "nvidia-cufft-cu12",
        "asteroid",
        "librosa",
        "pyloudnorm",
        "matplotlib",
        "praat-parselmouth",
        "webrtcvad",
        "scipy"
    )
    # Pre-download all models during image compilation to ensure zero startup latency
    .run_commands(
        "python -c 'from demucs.pretrained import get_model; get_model(\"htdemucs\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"UVR-MDX-NET-Inst_HQ_3.onnx\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"model_bs_roformer_ep_317_sdr_12.9755.ckpt\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"melband_roformer_big_beta4.ckpt\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"MDX23C-8KFFT-InstVoc_HQ.ckpt\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"deverb_bs_roformer_8_384dim_10depth.ckpt\")'",
        "python -c 'from audio_separator.separator import Separator; s = Separator(model_file_dir=\"/tmp/audio-separator-models\"); s.load_model(\"mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt\")'",
        "python -c 'from huggingface_hub import hf_hub_download; hf_hub_download(repo_id=\"Cyru5/MedleyVox\", filename=\"vocals 238/vocals.json\"); hf_hub_download(repo_id=\"Cyru5/MedleyVox\", filename=\"vocals 238/vocals.pth\")'"
    )
    .add_local_dir(
        os.path.join(os.path.dirname(__file__), "medleyvox"),
        "/root/medleyvox"
    )
)

import typing

gpu_type = os.getenv("MODAL_GPU_TYPE", "l4")

@app.function(
    image=demucs_image,
    gpu=gpu_type,
    timeout=1200, # 20 minutes max (pro_ensemble runs 3 models + post-processing on long songs)
    env={
        "LD_LIBRARY_PATH": "/usr/local/lib/python3.10/site-packages/nvidia/cuda_runtime/lib:/usr/local/lib/python3.10/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.10/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.10/site-packages/nvidia/cufft/lib"
    }
)
def separate(audio_bytes: bytes, filename: str, model_type: str = "demucs", stems: int = 2, vocal_cleanup: bool = False, instrumental_cleanup: bool = False) -> typing.Iterator[dict]:
    """
    Generator function — yields progress dicts during processing, then yields the final result dict.
    Use remote_gen() on the client side to stream progress in real-time.

    Progress yields: {"progress": int, "stage": str}
    Final result yield: {"vocals": bytes, "instrumental": bytes, ...}  (or {"error": str})
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = pathlib.Path(temp_dir) / filename
        input_path.write_bytes(audio_bytes)
        
        output_dir = pathlib.Path(temp_dir) / "output"
        output_dir.mkdir()
        
        print(f"Starting separation for {filename} using model type: {model_type}, stems: {stems}, cleanup: {vocal_cleanup}, inst_cleanup: {instrumental_cleanup}")
        yield {"progress": 10, "stage": "Getting ready..."}
        
        vocals_path = None
        instrumental_path = None
        drums_path = None
        base_path = None
        other_path = None
        
        # Audio separator invocation helper
        def run_audio_separator(model_name: str, file_path: pathlib.Path, out_dir: pathlib.Path) -> tuple:
            import logging
            from audio_separator.separator import Separator
            
            try:
                separator = Separator(
                    model_file_dir="/tmp/audio-separator-models",
                    output_dir=str(out_dir),
                    output_format="WAV",
                    log_level=logging.INFO,
                    use_autocast=True
                )
                separator.arch_specific_params['MDX']['batch_size'] = 8
                separator.arch_specific_params['MDXC']['batch_size'] = 8
                separator.arch_specific_params['VR']['batch_size'] = 8
                separator.load_model(model_name)
                print(f"Running audio-separator with model {model_name} on {file_path.name}...")
                output_files = separator.separate(str(file_path))
                print(f"Separation complete. Generated files: {output_files}")
                
                voc_file = None
                inst_file = None
                prefix = file_path.stem.lower()
                
                for fp in out_dir.glob("*.wav"):
                    name_lower = fp.name.lower()
                    relative_name = name_lower
                    if name_lower.startswith(prefix):
                        relative_name = name_lower[len(prefix):]
                        
                    if "instrumental" in relative_name or "no_vocals" in relative_name:
                        inst_file = fp
                    elif "vocals" in relative_name or "lead" in relative_name:
                        voc_file = fp
                        
                # Fallback matching
                if not voc_file or not inst_file:
                    for fp in out_dir.glob("*.wav"):
                        if not voc_file:
                            voc_file = fp
                        else:
                            inst_file = fp
                            
                return voc_file, inst_file
            except Exception as e:
                print(f"Audio-separator execution error for {model_name}: {e}")
                return None, None

        # --- MODEL BRANCHES ---
        
        if model_type in ("mdx", "bs_roformer", "melband_roformer", "mdx23c"):
            model_filename = {
                "mdx": "UVR-MDX-NET-Inst_HQ_3.onnx",
                "bs_roformer": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
                "melband_roformer": "melband_roformer_big_beta4.ckpt",
                "mdx23c": "MDX23C-8KFFT-InstVoc_HQ.ckpt"
            }[model_type]
            
            dir_s1 = output_dir / "stage1"
            dir_s1.mkdir()
            yield {"progress": 30, "stage": "Running AI model..."}
            vocals_path, instrumental_path = run_audio_separator(model_filename, input_path, dir_s1)
            
            if not vocals_path or not instrumental_path:
                yield {"error": f"Separation failed for model type {model_type}."}
                return

        elif model_type == "ensemble":
            # Run BS-Roformer and MDX-Net in parallel using ThreadPool
            from multiprocessing.pool import ThreadPool
            pool = ThreadPool(processes=2)
            
            dir_roformer = output_dir / "roformer"
            dir_roformer.mkdir()
            
            dir_mdx = output_dir / "mdx"
            dir_mdx.mkdir()
            
            yield {"progress": 25, "stage": "Starting ensemble AI (2 models)..."}
            # Submit both separation tasks concurrently
            t1 = pool.apply_async(run_audio_separator, ("model_bs_roformer_ep_317_sdr_12.9755.ckpt", input_path, dir_roformer))
            t2 = pool.apply_async(run_audio_separator, ("UVR-MDX-NET-Inst_HQ_3.onnx", input_path, dir_mdx))
            
            yield {"progress": 50, "stage": "Ensemble model 1 processing..."}
            # Retrieve results concurrently
            v_rof, i_rof = t1.get()
            yield {"progress": 65, "stage": "Ensemble model 2 processing..."}
            v_mdx, i_mdx = t2.get()
            
            pool.close()
            pool.join()
            
            if not (v_rof and v_mdx and i_rof and i_mdx):
                yield {"error": "Ensemble separation failed. One or more model outputs were missing."}
                return
                
            # Perform mathematical signal averaging
            import soundfile as sf
            import numpy as np
            
            def average_audio_files(f1, f2, out_path):
                d1, sr1 = sf.read(str(f1))
                d2, sr2 = sf.read(str(f2))
                min_l = min(len(d1), len(d2))
                d1, d2 = d1[:min_l], d2[:min_l]
                sf.write(str(out_path), (d1 + d2) / 2.0, sr1)
                
            vocals_path = output_dir / "vocals_ensembled.wav"
            instrumental_path = output_dir / "instrumental_ensembled.wav"
            
            average_audio_files(v_rof, v_mdx, vocals_path)
            average_audio_files(i_rof, i_mdx, instrumental_path)

        elif model_type == "pro_ensemble":
            # =============================================================
            #  PRO ENSEMBLE — Commercial-Grade Multi-Model Fusion Pipeline
            #  Stage 1: Audio Analysis
            #  Stage 2: 3-Model Parallel Separation
            #  Stage 3: Confidence-Weighted Fusion
            #  Stage 4: Frequency-Band Fusion (STFT)
            #  Stage 5: Phase Alignment (Cross-Correlation)
            #  Stage 6: Loudness Normalization (LUFS matching)
            # =============================================================
            import numpy as np
            import soundfile as sf
            import librosa
            import pyloudnorm as pyln
            from scipy.signal import correlate as scipy_correlate
            from multiprocessing.pool import ThreadPool

            # ── Stage 1: Audio Analysis ─────────────────────────────────
            yield {"progress": 8, "stage": "🔬 Analysing audio characteristics..."}
            print("Pro Ensemble — Stage 1: Audio analysis")
            raw_data, orig_sr = librosa.load(str(input_path), sr=None, mono=False, dtype=np.float32)
            is_stereo = raw_data.ndim == 2
            duration = raw_data.shape[-1] / orig_sr
            meter = pyln.Meter(orig_sr)
            ref_mono = np.mean(raw_data, axis=0) if is_stereo else raw_data
            try:
                orig_lufs = meter.integrated_loudness(ref_mono.astype(np.float64))
            except Exception:
                orig_lufs = -18.0  # safe fallback
            print(f"  Duration: {duration:.1f}s  Stereo: {is_stereo}  LUFS: {orig_lufs:.1f}")

            # ── Stage 2: Parallel 3-Model Separation ────────────────────
            yield {"progress": 15, "stage": "🚀 Launching 3 AI models in parallel..."}
            print("Pro Ensemble — Stage 2: Parallel model execution")

            dir_bsr  = output_dir / "bsr";   dir_bsr.mkdir()
            dir_mbr  = output_dir / "mbr";   dir_mbr.mkdir()
            dir_mdxc = output_dir / "mdxc";  dir_mdxc.mkdir()

            pool = ThreadPool(processes=3)
            t_bsr  = pool.apply_async(run_audio_separator, ("model_bs_roformer_ep_317_sdr_12.9755.ckpt",  input_path, dir_bsr))
            t_mbr  = pool.apply_async(run_audio_separator, ("melband_roformer_big_beta4.ckpt",             input_path, dir_mbr))
            t_mdxc = pool.apply_async(run_audio_separator, ("MDX23C-8KFFT-InstVoc_HQ.ckpt",               input_path, dir_mdxc))

            yield {"progress": 35, "stage": "⏳ BS-RoFormer processing..."}
            v_bsr,  i_bsr  = t_bsr.get()
            yield {"progress": 55, "stage": "⏳ MelBand-RoFormer processing..."}
            v_mbr,  i_mbr  = t_mbr.get()
            yield {"progress": 68, "stage": "⏳ MDX23C processing..."}
            v_mdxc, i_mdxc = t_mdxc.get()
            pool.close(); pool.join()

            if not all([v_bsr, i_bsr, v_mbr, i_mbr, v_mdxc, i_mdxc]):
                missing = [n for n, f in [("BSR-v", v_bsr), ("BSR-i", i_bsr),
                                           ("MBR-v", v_mbr), ("MBR-i", i_mbr),
                                           ("MDX-v", v_mdxc), ("MDX-i", i_mdxc)] if not f]
                yield {"error": f"Pro Ensemble: missing outputs from models: {missing}"}
                return

            # ── Helper: load + resample to common shape ──────────────────
            def load_mono(path):
                d, sr = sf.read(str(path), dtype="float32", always_2d=False)
                if d.ndim == 2:
                    d = np.mean(d, axis=1)
                return d, sr

            def load_stereo(path, target_len=None):
                d, sr = sf.read(str(path), dtype="float32", always_2d=True)
                d = d.T  # (channels, samples)
                if target_len and d.shape[1] != target_len:
                    mn = min(d.shape[1], target_len)
                    out = np.zeros((d.shape[0], target_len), dtype=np.float32)
                    out[:, :mn] = d[:, :mn]
                    return out, sr
                return d, sr

            ref_v, sr_v = load_stereo(v_bsr)
            ref_len = ref_v.shape[1]

            # Load all 6 outputs aligned to ref_len
            voc_bsr,  _ = load_stereo(v_bsr,  ref_len)
            voc_mbr,  _ = load_stereo(v_mbr,  ref_len)
            voc_mdxc, _ = load_stereo(v_mdxc, ref_len)
            ins_bsr,  _ = load_stereo(i_bsr,  ref_len)
            ins_mbr,  _ = load_stereo(i_mbr,  ref_len)
            ins_mdxc, _ = load_stereo(i_mdxc, ref_len)

            # ── Stage 3: Confidence-Weighted Fusion ──────────────────────
            yield {"progress": 72, "stage": "🧠 Computing confidence weights..."}
            print("Pro Ensemble — Stage 3: Confidence-weighted fusion")

            def rms(x): return np.sqrt(np.mean(x ** 2)) + 1e-8

            def confidence_blend_vocals(arrays):
                """Blend vocals by RMS energy — more energy = more confident vocal capture."""
                weights = np.array([rms(a) for a in arrays], dtype=np.float64)
                weights /= weights.sum()
                result = np.zeros_like(arrays[0], dtype=np.float32)
                for w, a in zip(weights, arrays):
                    result += float(w) * a
                return result

            def confidence_blend_instrs(instr_arrays, vocal_arrays):
                """
                Blend instrumentals using INVERSE vocal-correlation weighting.
                A model whose instrumental sounds most UNLIKE its own vocals
                = best separation (least bleed). Give it more weight.
                Models with high vocal bleed have high cross-energy with their
                vocal track, so they get penalised.
                """
                cross_energies = []
                for inst, voc in zip(instr_arrays, vocal_arrays):
                    # Pearson-like: mean absolute product (how much do they share?)
                    cross = np.mean(np.abs(inst.astype(np.float64) * voc.astype(np.float64)))
                    cross_energies.append(cross + 1e-8)

                # Invert: models with LOWER cross-energy (less bleed) get higher weight
                inv_weights = np.array([1.0 / ce for ce in cross_energies], dtype=np.float64)
                inv_weights /= inv_weights.sum()
                print(f"  Instrumental blend weights (anti-bleed): {inv_weights.round(3)}")

                result = np.zeros_like(instr_arrays[0], dtype=np.float32)
                for w, a in zip(inv_weights, instr_arrays):
                    result += float(w) * a
                return result

            vocals_fused = confidence_blend_vocals([voc_bsr, voc_mbr, voc_mdxc])
            # Instrumental uses anti-bleed weighting — penalise models with vocal residue
            instrs_fused = confidence_blend_instrs(
                [ins_bsr, ins_mbr, ins_mdxc],
                [voc_bsr, voc_mbr, voc_mdxc]
            )

            # ── Stage 4: Frequency-Band Fusion (numpy rfft — O(n log n)) ──
            yield {"progress": 78, "stage": "🎛️ Frequency-band intelligent fusion..."}
            print("Pro Ensemble — Stage 4: Frequency-band rfft fusion")

            def freq_band_fuse_channel(ch_bsr, ch_mbr, ch_mdxc, sr):
                """
                Direct FFT frequency-domain masking — fast O(n log n) on full signal.
                Low  (0 – 500 Hz)  → BS-RoFormer  (cleanest bass-range)
                Mid  (500 – 4 kHz) → BS-RoFormer  (best vocal clarity)
                High (4k – Nyq)    → MelBand-RoF  (preserves air/breathiness)
                """
                n = len(ch_bsr)
                freqs = np.fft.rfftfreq(n, d=1.0 / sr)  # frequency axis for rfft

                lo  = freqs < 500
                hi  = freqs > 4000
                mid = ~lo & ~hi

                # One rfft per source (3 total per channel — very fast even at 17M samples)
                F_bsr = np.fft.rfft(ch_bsr.astype(np.float64))
                F_mbr = np.fft.rfft(ch_mbr.astype(np.float64))
                # ch_mdxc not used in freq fusion (kept for confidence blend)

                F_merged = np.empty_like(F_bsr)
                F_merged[lo]  = F_bsr[lo]   # low: BS-RoFormer (punchy, clean)
                F_merged[mid] = F_bsr[mid]  # mid: BS-RoFormer (vocal clarity)
                F_merged[hi]  = F_mbr[hi]   # high: MelBand (airy breathiness)

                result = np.fft.irfft(F_merged, n=n)
                return result.astype(np.float32)

            # Apply per-channel (left/right)
            n_ch = vocals_fused.shape[0]
            vocals_banded = np.stack([
                freq_band_fuse_channel(voc_bsr[c], voc_mbr[c], voc_mdxc[c], sr_v)
                for c in range(n_ch)
            ])
            instrs_banded = np.stack([
                freq_band_fuse_channel(ins_bsr[c], ins_mbr[c], ins_mdxc[c], sr_v)
                for c in range(n_ch)
            ])

            # Blend frequency-banded result with confidence-weighted result (60/40)
            vocals_merged = 0.60 * vocals_banded + 0.40 * vocals_fused
            instrs_merged = 0.60 * instrs_banded + 0.40 * instrs_fused

            # ── Stage 5: Phase Alignment (windowed FFT correlate) ──────────
            # CRITICAL: only use first 5 seconds for shift estimation.
            # np.correlate(mode='full') on 17M samples is O(n²) — never use on full audio.
            yield {"progress": 84, "stage": "🔄 Phase-aligning outputs..."}
            print("Pro Ensemble — Stage 5: Phase alignment (windowed)")

            def phase_align_channels(src, ref, sr):
                """
                Estimate time-domain shift using only first 5 s of audio (FFT correlate),
                cap shift at ±100 ms, then apply to full signal.
                """
                # Limit to first 5 seconds to keep correlate fast at any song length
                window = min(src.shape[1], int(5 * sr))
                r_ref = ref[0, :window].astype(np.float64)
                r_src = src[0, :window].astype(np.float64)

                # FFT-based correlate is O(n log n) — safe on 5s × 44100 = 220k samples
                c = scipy_correlate(r_ref, r_src, mode="full", method="fft")
                raw_shift = int(np.argmax(c)) - (window - 1)

                # Cap at ±100 ms — larger shifts indicate model differences, not phase errors
                max_shift = int(0.1 * sr)
                shift = int(np.clip(raw_shift, -max_shift, max_shift))
                print(f"  Phase shift estimated: {raw_shift} samples, clamped to: {shift}")

                if shift == 0:
                    return src
                aligned = np.zeros_like(src)
                if shift > 0:
                    aligned[:, shift:] = src[:, :src.shape[1] - shift]
                else:
                    s = abs(shift)
                    aligned[:, :src.shape[1] - s] = src[:, s:]
                return aligned

            instrs_aligned = phase_align_channels(instrs_merged, vocals_merged, sr_v)

            # ── Stage 6: Loudness Normalisation (LUFS) ───────────────────
            yield {"progress": 88, "stage": "📢 Loudness normalisation..."}
            print("Pro Ensemble — Stage 6: Loudness normalisation")

            def lufs_normalise(stereo_data, target_lufs, sr):
                mono = np.mean(stereo_data, axis=0).astype(np.float64)
                try:
                    current = pyln.Meter(sr).integrated_loudness(mono)
                    gain_db = target_lufs - current
                    gain_lin = 10 ** (gain_db / 20.0)
                    gain_lin = np.clip(gain_lin, 0.01, 10.0)  # safety clamp
                    return (stereo_data * gain_lin).astype(np.float32)
                except Exception:
                    return stereo_data

            vocals_final = lufs_normalise(vocals_merged,  orig_lufs - 0.5, sr_v)
            instrs_final = lufs_normalise(instrs_aligned, orig_lufs - 1.0, sr_v)

            # ── Stage 7: Vocal Residue Suppression (Wiener spectral filter) ───
            yield {"progress": 92, "stage": "🧹 Suppressing vocal residue in instrumental..."}
            print("Pro Ensemble — Stage 7: Vocal residue suppression")

            def suppress_vocal_residue(instr, vocals, sr, alpha=2.5, floor_db=-45):
                """
                Optimal frame-by-frame STFT Wiener Filter vocal residue suppression.
                alpha: aggressiveness parameter (higher = more vocal suppression, e.g. 1.5 - 3.0)
                floor_db: floor limit in dB to prevent musical noise/artifacts.
                """
                from scipy.signal import stft, istft

                nperseg = 2048
                noverlap = 1536  # 75% overlap for smooth reconstruction
                n_ch = instr.shape[0]
                result = np.zeros_like(instr)
                floor = 10 ** (floor_db / 20.0)

                for c in range(n_ch):
                    # Compute STFT for both instrumental and vocal tracks
                    f, t, Z_inst = stft(instr[c].astype(np.float64), fs=sr, nperseg=nperseg, noverlap=noverlap)
                    _, _, Z_voc  = stft(vocals[c].astype(np.float64), fs=sr, nperseg=nperseg, noverlap=noverlap)

                    # Compute power spectrograms
                    P_inst = np.abs(Z_inst) ** 2
                    P_voc  = np.abs(Z_voc) ** 2

                    # Wiener filter gain: G = P_inst / (P_inst + alpha * P_voc + eps)
                    eps = 1e-10
                    gain = P_inst / (P_inst + alpha * P_voc + eps)
                    gain = np.maximum(gain, floor)  # preserve background transient floor

                    # Apply filter and reconstruct
                    Z_clean = Z_inst * gain
                    _, x_clean = istft(Z_clean, fs=sr, nperseg=nperseg, noverlap=noverlap)

                    # Align lengths perfectly
                    mn = min(len(x_clean), instr.shape[1])
                    result[c, :mn] = x_clean[:mn].astype(np.float32)

                return result

            if instrumental_cleanup:
                instrs_final = suppress_vocal_residue(instrs_final, vocals_final, sr_v, alpha=2.5)
                print("  Vocal residue suppression applied.")
            else:
                print("  Vocal residue suppression skipped (toggle off).")

            # Write WAV outputs (transposed back to [samples, channels])
            vocals_wav_path = output_dir / "vocals_pro.wav"
            instrs_wav_path = output_dir / "instrumental_pro.wav"
            sf.write(str(vocals_wav_path), vocals_final.T, sr_v)
            sf.write(str(instrs_wav_path), instrs_final.T, sr_v)

            vocals_path      = vocals_wav_path
            instrumental_path = instrs_wav_path

        elif model_type == "male_female":

            # Stage 1: Separate vocals and instrumental using BS-Roformer
            dir_s1 = output_dir / "stage1"
            dir_s1.mkdir()
            yield {"progress": 25, "stage": "Separating vocals (Stage 1)..."}
            v_temp, instrumental_path = run_audio_separator("model_bs_roformer_ep_317_sdr_12.9755.ckpt", input_path, dir_s1)
            
            if not v_temp or not instrumental_path:
                yield {"error": "Male/Female split: vocal pre-extraction failed."}
                return
                
            yield {"progress": 55, "stage": "Splitting male & female voices (Stage 2)..."}
            # Stage 2: Split isolated vocal track into male and female vocals
            dir_s2 = output_dir / "stage2"
            dir_s2.mkdir()
            male_path, female_path = run_audio_separator("bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt", v_temp, dir_s2)
            
            if not male_path or not female_path:
                yield {"error": "Male/Female split: gender isolation failed."}
                return
                
            # Convert outputs to MP3
            male_mp3 = output_dir / "male_vocals.mp3"
            female_mp3 = output_dir / "female_vocals.mp3"
            inst_mp3 = output_dir / "instrumental.mp3"
            
            yield {"progress": 75, "stage": "Compressing stems to MP3..."}
            print("Compressing Male/Female stems to MP3 using ffmpeg...")
            processes = []
            for src, dst in [
                (male_path, male_mp3),
                (female_path, female_mp3),
                (instrumental_path, inst_mp3)
            ]:
                p = subprocess.Popen([
                    "ffmpeg", "-y", "-i", str(src),
                    "-codec:a", "libmp3lame", "-qscale:a", "2",
                    str(dst)
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                processes.append(p)
            for p in processes:
                p.wait()
                
            yield {
                "lead_vocals": male_mp3.read_bytes(),
                "backing_vocals": female_mp3.read_bytes(),
                "instrumental": inst_mp3.read_bytes(),
                "lead_vocals_filename": "male_vocals.mp3",
                "backing_vocals_filename": "female_vocals.mp3",
                "instrumental_filename": "instrumental.mp3"
            }
            return

        elif model_type == "medleyvox":
            # MedleyVox Multi-Singer Separation
            yield {"progress": 20, "stage": "Loading MedleyVox model..."}
            import sys
            if "/root/medleyvox" not in sys.path:
                sys.path.append("/root/medleyvox")
                
            from models import load_model_with_args
            from utils import loudnorm, db2linear
            from huggingface_hub import hf_hub_download
            import torch
            import json
            import numpy as np
            import librosa
            import soundfile as sf
            import pyloudnorm as pyln
            
            # Load model config and weights dynamically from HF cache
            json_path = hf_hub_download(repo_id="Cyru5/MedleyVox", filename="vocals 238/vocals.json")
            pth_path = hf_hub_download(repo_id="Cyru5/MedleyVox", filename="vocals 238/vocals.pth")
            
            with open(json_path, "r") as f:
                args_dict = json.load(f)
                
            class ArgsNamespace:
                def __init__(self, d):
                    for k, v in d.items():
                        setattr(self, k, v)
                        
            model_args = ArgsNamespace(args_dict["args"])
            model = load_model_with_args(model_args)
            
            # Load state dict and handle prefixes
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            checkpoint = torch.load(pth_path, map_location=device)
            model_dict = model.state_dict()
            
            # Clean up the state_dict keys based on whether training used EMA
            prefix = "ema_model.module." if model_args.ema else "online_model.module."
            cleaned_checkpoint = {}
            for k, v in checkpoint.items():
                k_clean = k.replace(prefix, "")
                if k_clean in model_dict:
                    cleaned_checkpoint[k_clean] = v
                    
            model_dict.update(cleaned_checkpoint)
            model.load_state_dict(model_dict)
            model = model.to(device)
            model.eval()
            
            yield {"progress": 35, "stage": "Isolating vocals (Demucs Stage 1)..."}
            import demucs.separate
            demucs_out = output_dir / "demucs_out"
            demucs_out.mkdir()
            
            print("Demucs: Isolating vocals before running MedleyVox...")
            demucs.separate.main([
                "-n", "htdemucs",
                "--two-stems", "vocals",
                "-o", str(demucs_out),
                str(input_path)
            ])
            
            model_dir = demucs_out / "htdemucs"
            vocals_temp = None
            instrumental_path = None
            
            for path in model_dir.rglob("vocals.wav"):
                vocals_temp = path
            for path in model_dir.rglob("no_vocals.wav"):
                instrumental_path = path
                
            if not vocals_temp or not instrumental_path:
                yield {"error": "MedleyVox: Primary vocal isolation failed."}
                return
                
            yield {"progress": 55, "stage": "Separating voices (MedleyVox Stage 2)..."}
            
            # Load mixture wave using librosa
            mixture, _ = librosa.load(
                path=str(vocals_temp),
                sr=model_args.sample_rate,
                mono=False,
                dtype=np.float32
            )
            
            meter = pyln.Meter(model_args.sample_rate)
            
            def run_medleyvox_inference(mix_channel):
                mix_norm, adjusted_gain = loudnorm(mix_channel, -24.0, meter)
                mix_tensor = np.expand_dims(mix_norm, axis=0)
                mix_tensor = mix_tensor.reshape(1, mix_tensor.shape[0], mix_tensor.shape[1])
                mix_tensor = torch.as_tensor(mix_tensor, dtype=torch.float32).to(device)
                
                with torch.no_grad():
                    out_wavs = model.separate(mix_tensor)
                    
                if device.type == "cuda":
                    out_1 = out_wavs[0, 0, :].cpu().numpy()
                    out_2 = out_wavs[0, 1, :].cpu().numpy()
                else:
                    out_1 = out_wavs[0, 0, :].numpy()
                    out_2 = out_wavs[0, 1, :].numpy()
                    
                out_1 = out_1 * db2linear(-adjusted_gain)
                out_2 = out_2 * db2linear(-adjusted_gain)
                return out_1, out_2
                
            if len(mixture.shape) == 2:
                # Stereo processing
                left = mixture[0, :]
                right = mixture[1, :]
                left_out_1, left_out_2 = run_medleyvox_inference(left)
                right_out_1, right_out_2 = run_medleyvox_inference(right)
                out_wav_1 = np.stack([left_out_1, right_out_1], axis=-1)
                out_wav_2 = np.stack([left_out_2, right_out_2], axis=-1)
            else:
                # Mono processing
                out_wav_1, out_wav_2 = run_medleyvox_inference(mixture)
                
            vocalist1_wav = output_dir / "vocalist1.wav"
            vocalist2_wav = output_dir / "vocalist2.wav"
            
            sf.write(str(vocalist1_wav), out_wav_1, model_args.sample_rate)
            sf.write(str(vocalist2_wav), out_wav_2, model_args.sample_rate)
            
            vocalist1_mp3 = output_dir / "vocalist1.mp3"
            vocalist2_mp3 = output_dir / "vocalist2.mp3"
            inst_mp3 = output_dir / "instrumental.mp3"
            
            yield {"progress": 80, "stage": "Compressing MedleyVox stems to MP3..."}
            processes = []
            for src, dst in [
                (vocalist1_wav, vocalist1_mp3),
                (vocalist2_wav, vocalist2_mp3),
                (instrumental_path, inst_mp3)
            ]:
                p = subprocess.Popen([
                    "ffmpeg", "-y", "-i", str(src),
                    "-codec:a", "libmp3lame", "-qscale:a", "2",
                    str(dst)
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                processes.append(p)
            for p in processes:
                p.wait()
                
            yield {
                "vocals": vocalist1_mp3.read_bytes(),
                "backing_vocals": vocalist2_mp3.read_bytes(),
                "instrumental": inst_mp3.read_bytes(),
                "vocals_filename": "vocalist1.mp3",
                "backing_vocals_filename": "vocalist2.mp3",
                "instrumental_filename": "instrumental.mp3"
            }
            return
            

        elif model_type == "bve":
            # Consolidated Backing Vocals Extraction
            import demucs.separate
            demucs_out = output_dir / "demucs_out"
            demucs_out.mkdir()
            
            yield {"progress": 25, "stage": "Separating vocals (Demucs Stage 1)..."}
            print("Demucs: Separating vocals and instrumental tracks...")
            demucs.separate.main([
                "-n", "htdemucs",
                "--two-stems", "vocals",
                "-o", str(demucs_out),
                str(input_path)
            ])
            yield {"progress": 55, "stage": "Extracting backing vocals (BVE Stage 2)..."}
            
            model_dir = demucs_out / "htdemucs"
            vocals_temp = None
            instrumental_path = None
            
            for path in model_dir.rglob("vocals.wav"):
                vocals_temp = path
            for path in model_dir.rglob("no_vocals.wav"):
                instrumental_path = path
                
            if not vocals_temp or not instrumental_path:
                yield {"error": "BVE: Demucs primary separation failed."}
                return
                
            dir_bve = output_dir / "bve_out"
            dir_bve.mkdir()
            lead_vocals_path, backing_vocals_path = run_audio_separator("mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt", vocals_temp, dir_bve)
            
            if not lead_vocals_path or not backing_vocals_path:
                yield {"error": "BVE: Lead/Backing separation failed."}
                return
                
            vocals_mp3 = output_dir / "vocals.mp3"
            backing_mp3 = output_dir / "backing_vocals.mp3"
            inst_mp3 = output_dir / "instrumental.mp3"
            
            yield {"progress": 75, "stage": "Compressing BVE stems to MP3..."}
            print("Compressing BVE stems to MP3 using ffmpeg...")
            processes = []
            for src, dst in [
                (lead_vocals_path, vocals_mp3),
                (backing_vocals_path, backing_mp3),
                (instrumental_path, inst_mp3)
            ]:
                p = subprocess.Popen([
                    "ffmpeg", "-y", "-i", str(src),
                    "-codec:a", "libmp3lame", "-qscale:a", "2",
                    str(dst)
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                processes.append(p)
            for p in processes:
                p.wait()
                
            yield {
                "vocals": vocals_mp3.read_bytes(),
                "backing_vocals": backing_mp3.read_bytes(),
                "instrumental": inst_mp3.read_bytes(),
                "vocals_filename": "vocals.mp3",
                "backing_vocals_filename": "backing_vocals.mp3",
                "instrumental_filename": "instrumental.mp3"
            }
            return

        else:
            # --- Meta Demucs HTDemucs Separation ---
            import demucs.separate
            
            try:
                cmd = ["-n", "htdemucs", "-o", str(output_dir)]
                if stems == 2:
                    cmd.extend(["--two-stems", "vocals"])
                cmd.append(str(input_path))
                
                yield {"progress": 30, "stage": "Running Demucs AI..."}
                print(f"Running Demucs command with arguments: {cmd}")
                demucs.separate.main(cmd)
                yield {"progress": 70, "stage": "Demucs complete, locating output files..."}
                print("Demucs completed successfully.")
                
                # Locate Demucs WAV files
                model_dir = output_dir / "htdemucs"
                
                if stems == 4:
                    for path in model_dir.rglob("vocals.wav"):
                        vocals_path = path
                    for path in model_dir.rglob("drums.wav"):
                        drums_path = path
                    for path in model_dir.rglob("bass.wav"):
                        bass_path = path
                    for path in model_dir.rglob("other.wav"):
                        other_path = path
                        
                    if not all([vocals_path, drums_path, bass_path, other_path]):
                        all_files = [str(p) for p in output_dir.rglob("*")]
                        yield {"error": f"Demucs 4-stem files not found. Files present: {all_files}"}
                        return
                else:
                    for path in model_dir.rglob("vocals.wav"):
                        vocals_path = path
                    for path in model_dir.rglob("no_vocals.wav"):
                        instrumental_path = path
                        
                    if not vocals_path or not instrumental_path:
                        all_files = [str(p) for p in output_dir.rglob("*")]
                        yield {"error": f"Demucs 2-stem files not found. Files present: {all_files}"}
                        return
                    
            except Exception as e:
                print(f"Demucs execution failed: {str(e)}")
                yield {"error": f"Demucs execution failed: {str(e)}"}
                return
                
        # --- Stage 2 Post-Processing: Studio Vocal Cleanup (De-Reverb) ---
        yield {"progress": 75, "stage": "Cleaning up vocals (De-Reverb)..."}
        if vocal_cleanup and vocals_path and vocals_path.exists():
            print(f"Applying Studio Vocal Cleanup (De-Reverb) on isolated vocals...")
            dir_cleanup = output_dir / "cleanup"
            dir_cleanup.mkdir()
            clean_vocals_path, _ = run_audio_separator("deverb_bs_roformer_8_384dim_10depth.ckpt", vocals_path, dir_cleanup)
            if clean_vocals_path and clean_vocals_path.exists():
                print("Studio Vocal Cleanup completed successfully.")
                vocals_path = clean_vocals_path

        # --- Stage 3 Post-Processing: Instrumental Vocal Suppress (Wiener Filter) ---
        if instrumental_cleanup and vocals_path and vocals_path.exists() and instrumental_path and instrumental_path.exists() and model_type != "pro_ensemble":
            yield {"progress": 82, "stage": "🧹 Suppressing vocal residue in instrumental..."}
            print("Applying Instrumental Vocal Suppress Wiener Filter on non-pro-ensemble model...")
            try:
                import numpy as np
                import soundfile as sf
                from scipy.signal import stft, istft
                
                # Load tracks
                v_data, v_sr = sf.read(str(vocals_path), dtype="float32", always_2d=True)
                i_data, i_sr = sf.read(str(instrumental_path), dtype="float32", always_2d=True)
                
                # Wiener function
                def suppress_vocal_residue(instr, vocals, sr, alpha=2.5, floor_db=-45):
                    nperseg = 2048
                    noverlap = 1536
                    n_ch = instr.shape[1]
                    result = np.zeros_like(instr)
                    floor = 10 ** (floor_db / 20.0)

                    for c in range(n_ch):
                        f, t, Z_inst = stft(instr[:, c].astype(np.float64), fs=sr, nperseg=nperseg, noverlap=noverlap)
                        _, _, Z_voc  = stft(vocals[:, c].astype(np.float64), fs=sr, nperseg=nperseg, noverlap=noverlap)

                        P_inst = np.abs(Z_inst) ** 2
                        P_voc  = np.abs(Z_voc) ** 2

                        eps = 1e-10
                        gain = P_inst / (P_inst + alpha * P_voc + eps)
                        gain = np.maximum(gain, floor)

                        Z_clean = Z_inst * gain
                        _, x_clean = istft(Z_clean, fs=sr, nperseg=nperseg, noverlap=noverlap)

                        mn = min(len(x_clean), instr.shape[0])
                        result[:mn, c] = x_clean[:mn].astype(np.float32)

                    return result
                
                # Match lengths
                min_len = min(len(v_data), len(i_data))
                v_data = v_data[:min_len]
                i_data = i_data[:min_len]
                
                cleaned_inst = suppress_vocal_residue(i_data, v_data, i_sr, alpha=2.5)
                
                # Write back over instrumental_path
                sf.write(str(instrumental_path), cleaned_inst, i_sr)
                print("Instrumental vocal suppression applied successfully to non-pro-ensemble model.")
            except Exception as e:
                print(f"Error applying instrumental vocal suppression: {e}")

        # --- MP3 Compression & Delivery ---
        yield {"progress": 85, "stage": "Compressing stems to MP3..."}
        if stems == 4 and model_type == "demucs":
            vocals_mp3_path = output_dir / "vocals.mp3"
            drums_mp3_path = output_dir / "drums.mp3"
            bass_mp3_path = output_dir / "bass.mp3"
            other_mp3_path = output_dir / "other.mp3"
            
            print("Compressing 4 stems to MP3 using ffmpeg...")
            processes = []
            for src, dst in [
                (vocals_path, vocals_mp3_path),
                (drums_path, drums_mp3_path),
                (bass_path, bass_mp3_path),
                (other_path, other_mp3_path)
            ]:
                p = subprocess.Popen([
                    "ffmpeg", "-y", "-i", str(src),
                    "-codec:a", "libmp3lame", "-qscale:a", "2",
                    str(dst)
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                processes.append(p)
            for p in processes:
                p.wait()
                
            if all(p.exists() for p in [vocals_mp3_path, drums_mp3_path, bass_mp3_path, other_mp3_path]):
                print("MP3 compression complete. Returning 4 stems.")
                yield {
                    "vocals": vocals_mp3_path.read_bytes(),
                    "drums": drums_mp3_path.read_bytes(),
                    "bass": bass_mp3_path.read_bytes(),
                    "other": other_mp3_path.read_bytes(),
                    "vocals_filename": "vocals.mp3",
                    "drums_filename": "drums.mp3",
                    "bass_filename": "bass.mp3",
                    "other_filename": "other.mp3"
                }
            else:
                print("MP3 compression failed. Returning raw WAV bytes for 4 stems.")
                yield {
                    "vocals": vocals_path.read_bytes(),
                    "drums": drums_path.read_bytes(),
                    "bass": bass_path.read_bytes(),
                    "other": other_path.read_bytes(),
                    "vocals_filename": vocals_path.name,
                    "drums_filename": drums_path.name,
                    "bass_filename": bass_path.name,
                    "other_filename": other_path.name
                }
        else:
            vocals_mp3_path = output_dir / "vocals.mp3"
            no_vocals_mp3_path = output_dir / "instrumental.mp3"
            
            print("Compressing 2 stems to MP3 using ffmpeg...")
            p1 = subprocess.Popen([
                "ffmpeg", "-y", "-i", str(vocals_path),
                "-codec:a", "libmp3lame", "-qscale:a", "2",
                str(vocals_mp3_path)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            p2 = subprocess.Popen([
                "ffmpeg", "-y", "-i", str(instrumental_path),
                "-codec:a", "libmp3lame", "-qscale:a", "2",
                str(no_vocals_mp3_path)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            p1.wait()
            p2.wait()
            
            if vocals_mp3_path.exists() and no_vocals_mp3_path.exists():
                print("MP3 compression complete. Returning 2 stems.")
                yield {
                    "vocals": vocals_mp3_path.read_bytes(),
                    "instrumental": no_vocals_mp3_path.read_bytes(),
                    "vocals_filename": "vocals.mp3",
                    "instrumental_filename": "instrumental.mp3"
                }
            else:
                print("MP3 compression failed. Returning raw WAV bytes.")
                yield {
                    "vocals": vocals_path.read_bytes(),
                    "instrumental": instrumental_path.read_bytes(),
                    "vocals_filename": vocals_path.name,
                    "instrumental_filename": instrumental_path.name
                }

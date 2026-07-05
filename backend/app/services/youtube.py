import uuid
import time
import logging
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
import yt_dlp

logger = logging.getLogger("uvicorn")

def download_youtube_audio(url: str, output_dir: Path) -> dict:
    """
    Downloads the audio from a YouTube video URL using yt-dlp,
    extracts the audio, converts it to 320kbps MP3 using FFmpeg,
    and saves it to the output_dir.

    Optimisations applied:
    - Single-pass: info extraction is piggybacked on the download itself
      (no separate `download=False` pre-fetch) via an `info_dict` capture
      in the progress hook, eliminating one full round-trip to YouTube.
    - Format selector prefers audio-only streams (m4a/webm/opus) so FFmpeg
      does not have to demux a video container before re-encoding.
    - Concurrent fragment downloads (4 workers) speed up DASH/HLS streams.
    - prefer_ffmpeg ensures the fast system FFmpeg is always used.
    """
    file_id = str(uuid.uuid4())
    t_start = time.monotonic()

    # ── URL Sanitization ─────────────────────────────────────────────────────
    # Strip playlist/radio query params that cause yt-dlp to resolve an entire
    # playlist before downloading, adding ~30s of unnecessary delay.
    # We keep only `v` (video ID) and `t` (timestamp) parameters.
    _KEEP_PARAMS = {"v", "t"}
    parsed = urlparse(url)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    filtered_qs = {k: v for k, v in qs.items() if k in _KEEP_PARAMS}
    clean_url = urlunparse(parsed._replace(query=urlencode(filtered_qs, doseq=True)))
    if clean_url != url:
        logger.info(f"[YT] Stripped playlist params. Clean URL: {clean_url}")
    url = clean_url
    # ─────────────────────────────────────────────────────────────────────────

    logger.info(f"[YT] Starting download | file_id={file_id} | url={url}")

    temp_template = str(output_dir / f"{file_id}_temp.%(ext)s")

    # Capture the info dict when yt-dlp fires the 'finished' progress hook
    # so we can read the video title without a separate pre-fetch call.
    captured_info: dict = {}

    def _progress_hook(d: dict) -> None:
        if d.get("status") == "finished" and not captured_info:
            captured_info.update(d.get("info_dict") or {})
            elapsed = time.monotonic() - t_start
            logger.info(f"[YT] Download finished in {elapsed:.1f}s — starting FFmpeg conversion…")
        elif d.get("status") == "downloading":
            pct = d.get("_percent_str", "?").strip()
            speed = d.get("_speed_str", "?").strip()
            eta = d.get("_eta_str", "?").strip()
            logger.info(f"[YT] Progress: {pct}  speed={speed}  ETA={eta}")

    ydl_opts = {
        # Prefer audio-only streams (no video data to download/demux).
        # Falls back to best available if no audio-only stream exists.
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": temp_template,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",   # 320 kbps MP3
        }],
        # Speed improvements
        "noplaylist": True,              # CRITICAL: never expand playlists/radios
        "concurrent_fragment_downloads": 4,  # parallel DASH/HLS segment fetch
        "prefer_ffmpeg": True,               # always use system FFmpeg
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [_progress_hook],
        # Extractor arguments to bypass bot/login checks on cloud hosts (e.g. Render)
        # by mimicking official mobile clients (android, ios).
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios"]
            }
        },
    }

    # Check if a secure cookies file is configured on Render
    secrets_cookie = Path("/etc/secrets/cookies.txt")
    if secrets_cookie.exists():
        try:
            import shutil
            writable_cookie = Path("/tmp/cookies.txt")
            # Ensure the directory exists and copy the file
            writable_cookie.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(secrets_cookie, writable_cookie)
            ydl_opts["cookiefile"] = str(writable_cookie)
            logger.info("[YT] Secure cookies copied to writable path: /tmp/cookies.txt")
        except Exception as copy_err:
            logger.error(f"[YT] Failed to copy cookies to /tmp: {copy_err}. Falling back to direct read.")
            ydl_opts["cookiefile"] = str(secrets_cookie)
    else:
        # Fallback to local cookie file if available for local testing
        local_cookie = Path("cookies.txt")
        if local_cookie.exists():
            ydl_opts["cookiefile"] = str(local_cookie)
            logger.info("[YT] Found local cookies.txt, applying to yt-dlp.")

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Single call — downloads AND captures info via progress hook.
            # extract_info(download=True) returns the full info dict too.
            info = ydl.extract_info(url, download=True)
            # Merge whatever extract_info returned (may differ from hook capture)
            if info:
                captured_info.update(info)

        title = captured_info.get("title", "youtube_audio")

        # Sanitize title to a safe filename
        clean_title = "".join(
            c for c in title if c.isalnum() or c in (" ", "_", "-", ".")
        ).strip().replace(" ", "_")
        if not clean_title:
            clean_title = "youtube_audio"

        # The FFmpeg post-processor writes: {file_id}_temp.mp3
        temp_file = output_dir / f"{file_id}_temp.mp3"
        final_filename = f"{file_id}_{clean_title}.mp3"
        final_file = output_dir / final_filename

        if temp_file.exists():
            temp_file.rename(final_file)
        else:
            matching = list(output_dir.glob(f"{file_id}_temp.*"))
            if matching:
                matching[0].rename(final_file)
            else:
                raise FileNotFoundError(
                    "yt-dlp completed but the post-processed MP3 could not be found."
                )

        file_size = final_file.stat().st_size
        total_time = time.monotonic() - t_start
        logger.info(
            f"[YT] Done in {total_time:.1f}s | file={final_filename} | size={file_size:,} bytes"
        )

        return {
            "file_id": file_id,
            "filename": f"{clean_title}.mp3",
            "size": file_size,
        }

    except Exception as e:
        logger.error(f"[YT] Failed to download/convert: {e}")
        for leftover in output_dir.glob(f"{file_id}_temp.*"):
            try:
                leftover.unlink()
            except Exception:
                pass
        raise RuntimeError(f"YouTube import failed: {e}")

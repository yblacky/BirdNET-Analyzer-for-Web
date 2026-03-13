from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BIRDNET_",
        extra="ignore",
    )

    app_name: str = "BirdNET Local Web UI"
    default_language: str = "en_uk"

    ffmpeg_binary: str = "ffmpeg"
    max_upload_size_mb: int = 64
    allowed_extensions: tuple[str, ...] = (
        ".mp3",
        ".wav",
        ".m4a",
        ".ogg",
        ".flac",
        ".aac",
    )

    # -------- BirdNET profile WITH geolocation --------
    geo_min_confidence: float = 0.45
    geo_sensitivity: float = 1.25

    # -------- BirdNET profile WITHOUT geolocation --------
    nogeo_min_confidence: float = 0.6
    nogeo_sensitivity: float = 1.1

    # BirdNET tuning
    overlap: float = 0.45
    merge_consecutive: bool = True
    merge_gap_tolerance_seconds: float = 1.8
    batch_size: int = 2
    threads: int = 2
    locale: str = "eu"

    # Frontend / job polling
    poll_interval_ms: int = 500

    # Spectrogram
    spectrogram_fft_size: int = 2048
    spectrogram_smoothing: float = 0.35

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    def birdnet_params(self, lat=None, lon=None):
        if lat is not None or lon is not None:
            return {
                "min_conf": self.geo_min_confidence,
                "sensitivity": self.geo_sensitivity,
            }

        return {
            "min_conf": self.nogeo_min_confidence,
            "sensitivity": self.nogeo_sensitivity,
        }

settings = Settings()
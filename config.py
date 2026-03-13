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

    # BirdNET tuning
    min_confidence: float = 0.45
    sensitivity: float = 1.0
    overlap: float = 0.3
    merge_consecutive: bool = True
    merge_gap_tolerance_seconds: float = 1.3
    batch_size: int = 1
    threads: int = 2
    locale: str = "en"

    # Frontend / job polling
    poll_interval_ms: int = 500

    # Spectrogram
    spectrogram_fft_size: int = 2048
    spectrogram_smoothing: float = 0.35

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()
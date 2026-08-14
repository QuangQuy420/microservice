"""Input normalization helpers (same behavior as the original service)."""


def collapse_whitespace(value: str) -> str:
    """Trim and collapse inner whitespace runs to a single space."""
    return " ".join(value.split())


def blank_to_none(value):
    """Blank string -> None (used for optional profile/phone fields)."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None

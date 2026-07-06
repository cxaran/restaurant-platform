"""Presets de tema NEUTROS (§58.4): ningún preset de marca.

Cada negocio construye su identidad configurando paleta, acento, tipografía
autorizada, logo, favicon y metadatos — nunca editando código ni CSS libre.
La selección se guarda como tokens en ``storefront_theme_revisions``.
"""

from copy import deepcopy

THEME_PRESETS: dict[str, dict] = {
    "calido": {
        "colors": {
            "brand_primary": "#C2410C",
            "brand_secondary": "#1C1917",
            "accent": "#F59E0B",
            "surface": "#F6EEDD",
            "surface_muted": "#F1E7D2",
            "text_primary": "#1C1917",
            "text_inverse": "#FFFBF5",
            "success": "#15803D",
        },
        "typography": {
            "font_family_key": "display_slab",
            "heading_weight": "700",
            "body_weight": "400",
        },
        "shape": {"button_radius": "pill", "card_radius": "large", "image_radius": "large"},
        "effects": {"card_shadow": "soft", "button_style": "solid", "page_background_style": "flat"},
    },
    "fresco": {
        "colors": {
            "brand_primary": "#0F766E",
            "brand_secondary": "#134E4A",
            "accent": "#F97316",
            "surface": "#FFFFFF",
            "surface_muted": "#F0FDFA",
            "text_primary": "#134E4A",
            "text_inverse": "#FFFFFF",
            "success": "#16A34A",
        },
        "typography": {
            "font_family_key": "modern_sans",
            "heading_weight": "800",
            "body_weight": "400",
        },
        "shape": {"button_radius": "rounded", "card_radius": "medium", "image_radius": "medium"},
        "effects": {"card_shadow": "soft", "button_style": "solid", "page_background_style": "flat"},
    },
    "oscuro": {
        "colors": {
            "brand_primary": "#F59E0B",
            "brand_secondary": "#0B0B0C",
            "accent": "#EF4444",
            "surface": "#111113",
            "surface_muted": "#1B1B1E",
            "text_primary": "#F5F5F4",
            "text_inverse": "#111113",
            "success": "#22C55E",
        },
        "typography": {
            "font_family_key": "modern_sans",
            "heading_weight": "700",
            "body_weight": "400",
        },
        "shape": {"button_radius": "rounded", "card_radius": "large", "image_radius": "large"},
        "effects": {"card_shadow": "none", "button_style": "solid", "page_background_style": "flat"},
    },
    "menta": {
        "colors": {
            "brand_primary": "#059669",
            "brand_secondary": "#064E3B",
            "accent": "#F59E0B",
            "surface": "#F0FDF4",
            "surface_muted": "#DCFCE7",
            "text_primary": "#052E23",
            "text_inverse": "#FFFFFF",
            "success": "#16A34A",
        },
        "typography": {
            "font_family_key": "friendly_rounded",
            "heading_weight": "700",
            "body_weight": "400",
        },
        "shape": {"button_radius": "rounded", "card_radius": "medium", "image_radius": "medium"},
        "effects": {"card_shadow": "soft", "button_style": "solid", "page_background_style": "flat"},
    },
    "coral": {
        "colors": {
            "brand_primary": "#E11D48",
            "brand_secondary": "#4C0519",
            "accent": "#FB923C",
            "surface": "#FFF1F2",
            "surface_muted": "#FFE4E6",
            "text_primary": "#4C0519",
            "text_inverse": "#FFFFFF",
            "success": "#16A34A",
        },
        "typography": {
            "font_family_key": "friendly_rounded",
            "heading_weight": "800",
            "body_weight": "400",
        },
        "shape": {"button_radius": "pill", "card_radius": "large", "image_radius": "large"},
        "effects": {"card_shadow": "soft", "button_style": "solid", "page_background_style": "flat"},
    },
    "clasico": {
        "colors": {
            "brand_primary": "#7C2D12",
            "brand_secondary": "#1C1917",
            "accent": "#B45309",
            "surface": "#FAF6EF",
            "surface_muted": "#F0E9DC",
            "text_primary": "#292524",
            "text_inverse": "#FAF6EF",
            "success": "#15803D",
        },
        "typography": {
            "font_family_key": "classic_serif",
            "heading_weight": "700",
            "body_weight": "400",
        },
        "shape": {"button_radius": "rounded", "card_radius": "medium", "image_radius": "medium"},
        "effects": {"card_shadow": "soft", "button_style": "solid", "page_background_style": "flat"},
    },
    "marino": {
        "colors": {
            "brand_primary": "#1E3A8A",
            "brand_secondary": "#0F172A",
            "accent": "#CA8A04",
            "surface": "#F8FAFC",
            "surface_muted": "#EEF2F7",
            "text_primary": "#0F172A",
            "text_inverse": "#FFFFFF",
            "success": "#15803D",
        },
        "typography": {
            "font_family_key": "classic_serif",
            "heading_weight": "700",
            "body_weight": "400",
        },
        "shape": {"button_radius": "rounded", "card_radius": "large", "image_radius": "medium"},
        "effects": {"card_shadow": "soft", "button_style": "solid", "page_background_style": "flat"},
    },
}

DEFAULT_PRESET = "calido"

# Fuentes AUTORIZADAS (§39): jamás fuentes externas arbitrarias.
ALLOWED_FONT_KEYS = ("display_slab", "modern_sans", "classic_serif", "friendly_rounded")


def build_tokens(preset_name: str, *, accent: str | None = None) -> dict:
    """Tokens desde un preset + acento opcional (hex validado por el llamador)."""
    preset = THEME_PRESETS.get(preset_name)
    if preset is None:
        raise KeyError(preset_name)
    tokens = deepcopy(preset)
    if accent:
        tokens["colors"]["accent"] = accent
    return tokens

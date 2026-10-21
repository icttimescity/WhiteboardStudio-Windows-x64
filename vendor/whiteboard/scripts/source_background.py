"""Estimate only the empty canvas colour; never recolour the source image."""
import numpy as np


def background_rgb(image):
    h, w = image.shape[:2]
    sample = image[np.linspace(0, h - 1, 64).astype(int)[:, None],
                   np.linspace(0, w - 1, 64).astype(int)[None, :]]
    border = np.zeros((64, 64), dtype=bool)
    border[:2] = True; border[-2:] = True
    border[:, :2] = True; border[:, -2:] = True
    pixels = sample[border]
    if pixels.shape[1] == 4:
        pixels = pixels[pixels[:, 3] >= 250]
    if not len(pixels):
        return (246, 241, 227)  # Only genuinely transparent images need a fallback.
    rgb = pixels[:, :3].astype(np.int32)
    bins = (rgb[:, 0] // 16) * 256 + (rgb[:, 1] // 16) * 16 + rgb[:, 2] // 16
    winner = np.bincount(bins, minlength=4096).argmax()
    return tuple(int(v) for v in np.median(rgb[bins == winner], axis=0))

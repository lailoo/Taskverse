"""Render original layered cloud scenery for the cloud-railway theme.

Requires numpy and Pillow. The connected height profiles keep each cloud bank
coherent; small fractal lobes refine its silhouette without making terrain-like
contour islands. Both assets are generated offline, with no remote source art.
"""
from pathlib import Path
import numpy as np
from PIL import Image

WIDTH, HEIGHT = 1920, 1080
OUT = Path(__file__).resolve().parents[1] / "public/assets"
OUT.mkdir(parents=True, exist_ok=True)


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def profile(seed, anchors, width=WIDTH, height=HEIGHT, lift=1):
    """A continuous, irregular billow edge with large masses and small lobes."""
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, width)
    knots = np.linspace(0, 1, len(anchors))
    # Cubic smoothstep between shape anchors avoids angular mountain peaks.
    index = np.minimum((x * (len(anchors) - 1)).astype(int), len(anchors) - 2)
    t = (x - knots[index]) / (knots[1] - knots[0])
    smooth = t * t * (3 - 2 * t)
    values = np.array(anchors)
    values[-1] = values[0]  # Periodic panorama: both ends meet at the same height.
    edge = (values[index] * (1 - smooth) + values[index + 1] * smooth) * height
    for frequency, amplitude in [(9, 31), (22, 19), (51, 10), (113, 5), (247, 2.5), (507, 1.3)]:
        grid = rng.uniform(-1, 1, frequency + 1)
        grid[-1] = grid[0]
        xx = x * frequency
        ix = np.minimum(xx.astype(int), frequency - 1)
        dt = xx - ix
        dt = dt * dt * (3 - 2 * dt)
        edge += ((1 - dt) * grid[ix] + dt * grid[ix + 1]) * amplitude * lift
    return edge


def paint_below(image, edge, color):
    mask = np.arange(image.shape[0])[:, None] >= edge[None, :]
    image[mask] = (*rgb(color), 255) if image.shape[-1] == 4 else rgb(color)


def bank(image, seed, anchors, layers, lift=1):
    """Shared large billows, varied fine contours; no disconnected color rings."""
    base = profile(seed, anchors, width=image.shape[1], height=image.shape[0], lift=lift)
    for index, (offset, color) in enumerate(layers):
        detail = profile(seed + 81 + index, [0, 0], width=image.shape[1], height=image.shape[0], lift=.28 * lift)
        paint_below(image, base + offset + detail, color)


def curl_edges(image, seed, strength=1):
    """Warp the connected cloud banks into soft lobes instead of parallel waves."""
    rng = np.random.default_rng(seed)
    height, width = image.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    displacement = np.zeros((height, width), dtype=np.float32)
    for cell, amplitude in [(160, 55), (80, 31), (40, 16), (20, 8), (10, 3)]:
        cols, rows = int(np.ceil(width / cell)), int(np.ceil(height / cell)) + 2
        grid = rng.uniform(-1, 1, (rows, cols + 2))
        grid[:, cols] = grid[:, 0]
        grid[:, cols + 1] = grid[:, 1]
        px, py = xx / (width - 1) * cols, yy / cell
        ix, iy = px.astype(int), py.astype(int)
        dx, dy = px - ix, py - iy
        dx, dy = dx * dx * (3 - 2 * dx), dy * dy * (3 - 2 * dy)
        displacement += (((1 - dx) * grid[iy, ix] + dx * grid[iy, ix + 1]) * (1 - dy)
                         + ((1 - dx) * grid[iy + 1, ix] + dx * grid[iy + 1, ix + 1]) * dy) * amplitude * strength
    # Keep image borders stable so stretching cannot produce vertical streaks.
    taper = np.clip(np.minimum(yy, height - 1 - yy) / 100, 0, 1)
    sample_y = np.clip(yy + displacement * taper, 0, height - 1).astype(int)
    return image[sample_y, xx.astype(int)]


canvas = np.empty((HEIGHT, WIDTH, 3), dtype=np.uint8)
# A quiet blue opening above the warm cloud wall.
for row in range(HEIGHT):
    t = min(1, row / 600)
    canvas[row] = np.array(rgb("#89a4df")) * (1 - t) + np.array(rgb("#a1bafa")) * t

bank(canvas, 23, [.18, .19, .22, .26, .12, .03, .025],
     [(0, "#eee4da"), (38, "#d5c5bd"), (77, "#e5d7cf")], lift=1.4)

# The red upper bank transitions into a broad orange face, like the samples.
bank(canvas, 41, [.13, .04, .12, .26, .31, .36, .45],
     [(0, "#b15e4d"), (29, "#9d5147"), (65, "#854039"),
      (121, "#f5ae80"), (181, "#e99567"), (231, "#f68b4d"), (264, "#fc925b")], lift=1.45)

# Warm highlights and red-violet undersides are broad connected cloud masses.
bank(canvas, 104, [.53, .58, .44, .57, .53, .46, .64],
     [(0, "#f9c6a1"), (49, "#efae84"), (98, "#f59467"),
      (126, "#ef714f"), (153, "#f45336"), (185, "#b45343"),
      (213, "#8e6460"), (248, "#715151"), (299, "#f69561")], lift=1.2)

bank(canvas, 69, [.86, .88, .80, .89, .88, .82, .91],
     [(0, "#d87a4e"), (47, "#b45c42"), (87, "#913e3b"), (134, "#74353b")], lift=.65)

# Near clouds are a separate transparent layer so they can occlude bridge piers
# in world coordinates while the deck, locomotive and task cards stay usable.
near = np.zeros((480, WIDTH, 4), dtype=np.uint8)
bank(near, 127, [.12, .25, .09, .35, .25, .06, .18],
     [(0, "#ecd9d2"), (31, "#f7dec4"), (86, "#edbd94"),
      (139, "#dba77f"), (201, "#c98c80"), (248, "#a66e71")], lift=.62)

for name, pixels in [("cloud-sea.webp", curl_edges(canvas, 62, .45)), ("cloud-foreground.webp", curl_edges(near, 87, .55))]:
    destination = OUT / name
    # Lossless WebP preserves matching boundary pixels, including transparency.
    Image.fromarray(pixels).save(destination, lossless=True, method=6)
    print(f"Generated {destination} ({destination.stat().st_size:,} bytes)")

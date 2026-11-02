"""Run: python scripts/test_make_og.py"""
from PIL import Image

from make_og import GAP, HEIGHT, WIDTH, collage, grid

for count in range(1, 31):
    cols, rows = grid(count, 0.8)
    assert cols * rows >= count, count
    assert (WIDTH - GAP * (cols + 1)) // cols > 0, count
    assert (HEIGHT - GAP * (rows + 1)) // rows > 0, count

# Wide posters stack and tall posters sit side by side.
assert grid(2, 4.0) == (1, 2)
assert grid(2, 0.7) == (2, 1)

# Every tile lands on the canvas: a short last row must not run off the right edge.
canvas = collage([Image.new('RGB', (800, 1000), 'white') for _ in range(5)])
assert canvas.size == (WIDTH, HEIGHT)
assert canvas.getpixel((WIDTH - 1, HEIGHT - 1)) != (255, 255, 255)
white = sum(1 for pixel in canvas.getdata() if pixel == (255, 255, 255))
assert white > 0.3 * WIDTH * HEIGHT, white

print('ok')

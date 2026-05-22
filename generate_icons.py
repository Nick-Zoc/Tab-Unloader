#!/usr/bin/env python3
"""Generate Tab Unload extension icons at 16, 48, and 128 pixel sizes."""

import struct
import zlib
import os

def create_png(width, height, pixels):
    """Create a PNG file from raw RGBA pixel data."""
    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)

    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)

    # IDAT
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter byte
        for x in range(width):
            idx = (y * width + x) * 4
            raw_data += bytes(pixels[idx:idx+4])
    idat_data = zlib.compress(raw_data, 9)
    idat = make_chunk(b'IDAT', idat_data)

    # IEND
    iend = make_chunk(b'IEND', b'')

    return signature + ihdr + idat + iend

def draw_icon(size):
    """Draw the Tab Unload icon at the given size."""
    pixels = [0] * (size * size * 4)

    cx, cy = size / 2, size / 2

    # Colors
    bg_r, bg_g, bg_b = 0x1a, 0x73, 0xe8  # Google Blue
    ring_r, ring_g, ring_b = 0xff, 0xff, 0xff  # White ring

    radius = size * 0.42
    ring_radius = size * 0.38
    inner_radius = size * 0.22
    ring_width = max(1.0, size * 0.06)
    dash_len = max(2.0, size * 0.12)
    gap_len = max(1.5, size * 0.09)

    import math

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            dist = math.sqrt(dx * dx + dy * dy)

            # Background circle (filled blue)
            if dist <= radius:
                # Anti-alias edge
                alpha = min(1.0, max(0.0, radius - dist + 0.5))
                pixels[idx] = bg_r
                pixels[idx+1] = bg_g
                pixels[idx+2] = bg_b
                pixels[idx+3] = int(alpha * 255)

                # Inner lighter circle
                if dist <= inner_radius:
                    inner_alpha = min(1.0, max(0.0, inner_radius - dist + 0.5))
                    # Blend lighter blue
                    blend = inner_alpha * 0.3
                    pixels[idx] = int(bg_r + (255 - bg_r) * blend)
                    pixels[idx+1] = int(bg_g + (255 - bg_g) * blend)
                    pixels[idx+2] = int(bg_b + (255 - bg_b) * blend)

            # Dotted ring
            ring_dist = abs(dist - ring_radius)
            if ring_dist < ring_width:
                # Calculate angle for dash pattern
                angle = math.atan2(dy, dx)
                arc_pos = (angle + math.pi) / (2 * math.pi)  # 0 to 1
                circumference = 2 * math.pi * ring_radius
                arc_len = arc_pos * circumference
                period = dash_len + gap_len
                in_dash = (arc_len % period) < dash_len

                if in_dash:
                    ring_alpha = min(1.0, max(0.0, 1.0 - ring_dist / ring_width))
                    ring_alpha *= 0.95

                    # Blend ring color on top
                    existing_a = pixels[idx+3] / 255.0
                    new_a = ring_alpha
                    out_a = new_a + existing_a * (1 - new_a)

                    if out_a > 0:
                        pixels[idx] = int((ring_r * new_a + pixels[idx] * existing_a * (1 - new_a)) / out_a)
                        pixels[idx+1] = int((ring_g * new_a + pixels[idx+1] * existing_a * (1 - new_a)) / out_a)
                        pixels[idx+2] = int((ring_b * new_a + pixels[idx+2] * existing_a * (1 - new_a)) / out_a)
                        pixels[idx+3] = int(out_a * 255)

    return pixels

def main():
    os.makedirs('icons', exist_ok=True)

    for size in [16, 48, 128]:
        print(f'Generating icon-{size}.png ({size}x{size})...')
        pixels = draw_icon(size)
        png_data = create_png(size, size, pixels)
        with open(f'icons/icon-{size}.png', 'wb') as f:
            f.write(png_data)
        print(f'  ✓ Created icons/icon-{size}.png')

    print('\nAll icons generated successfully!')

if __name__ == '__main__':
    main()

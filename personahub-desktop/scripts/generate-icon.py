#!/usr/bin/env python3
"""Generate PersonaHub Desktop app icon (1024x1024 PNG)."""

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
import os

SIZE = 1024
CORNER_RADIUS = 220

def rounded_rect_mask(size, radius):
    """Create a rounded rectangle mask."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)
    return mask

def draw_gradient_bg(img):
    """Draw a rich gradient background."""
    draw = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / SIZE
        # Deep indigo at top → rich purple in middle → dark at bottom
        r = int(15 + 25 * math.sin(t * math.pi * 0.8))
        g = int(8 + 12 * math.sin(t * math.pi * 0.5))
        b = int(40 + 60 * math.sin(t * math.pi * 0.7))
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b))

def draw_glow_circle(img, cx, cy, radius, color, intensity=0.6):
    """Draw a soft glowing circle."""
    glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for r_offset in range(int(radius * 1.5), 0, -2):
        alpha = int(255 * intensity * (1 - r_offset / (radius * 1.5)) ** 2)
        alpha = max(0, min(255, alpha))
        c = (*color, alpha)
        draw.ellipse(
            [cx - r_offset, cy - r_offset, cx + r_offset, cy + r_offset],
            fill=c
        )
    return glow

def draw_person_silhouette(draw, cx, cy, scale=1.0, color=(255, 255, 255)):
    """Draw a clean person/avatar silhouette."""
    # Head (circle)
    head_r = int(85 * scale)
    head_cy = cy - int(140 * scale)
    draw.ellipse(
        [cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r],
        fill=color
    )

    # Body (rounded arc/shoulders shape)
    body_top = head_cy + head_r + int(25 * scale)
    body_w = int(200 * scale)
    body_h = int(180 * scale)
    draw.rounded_rectangle(
        [cx - body_w, body_top, cx + body_w, body_top + body_h],
        radius=int(100 * scale),
        fill=color
    )

def draw_sparkle(draw, cx, cy, size, color):
    """Draw a 4-point sparkle/star."""
    # Vertical line
    draw.line([(cx, cy - size), (cx, cy + size)], fill=color, width=max(2, size // 5))
    # Horizontal line
    draw.line([(cx - size, cy), (cx + size, cy)], fill=color, width=max(2, size // 5))
    # Small center dot
    dot = size // 4
    draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=color)

def main():
    # 1. Create base image with gradient background
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 255))
    draw_gradient_bg(img)

    # 2. Add ambient glow orbs (like the app's header)
    # Top-right cyan glow
    glow1 = draw_glow_circle(img, 750, 200, 300, (0, 220, 255), 0.25)
    img = Image.alpha_composite(img, glow1)

    # Bottom-left purple glow
    glow2 = draw_glow_circle(img, 250, 800, 350, (139, 92, 246), 0.2)
    img = Image.alpha_composite(img, glow2)

    # Center magenta glow (behind the person)
    glow3 = draw_glow_circle(img, 512, 480, 250, (200, 80, 255), 0.15)
    img = Image.alpha_composite(img, glow3)

    # 3. Draw subtle border ring
    overlay = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    # Outer ring glow
    for i in range(8):
        alpha = int(30 - i * 3)
        r = CORNER_RADIUS + i * 2
        overlay_draw.rounded_rectangle(
            [(20 - i, 20 - i), (SIZE - 21 + i, SIZE - 21 + i)],
            radius=r,
            outline=(0, 220, 255, alpha),
            width=2
        )
    img = Image.alpha_composite(img, overlay)

    # 4. Draw the person silhouette with glow
    # First draw a glow behind the person
    person_glow = draw_glow_circle(img, 512, 450, 200, (0, 240, 255), 0.3)
    img = Image.alpha_composite(img, person_glow)

    # Draw the person
    person_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    person_draw = ImageDraw.Draw(person_layer)
    draw_person_silhouette(person_draw, 512, 500, scale=1.3, color=(255, 255, 255, 230))
    img = Image.alpha_composite(img, person_layer)

    # 5. Add sparkles around the person (AI magic effect)
    sparkle_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    sparkle_draw = ImageDraw.Draw(sparkle_layer)

    # Top-right sparkle (cyan)
    draw_sparkle(sparkle_draw, 720, 250, 28, (0, 240, 255, 220))
    # Top-left smaller sparkle
    draw_sparkle(sparkle_draw, 280, 300, 18, (139, 92, 246, 200))
    # Bottom-right sparkle
    draw_sparkle(sparkle_draw, 760, 550, 15, (0, 220, 255, 180))
    # Mid-left sparkle
    draw_sparkle(sparkle_draw, 220, 550, 22, (236, 72, 153, 180))

    img = Image.alpha_composite(img, sparkle_layer)

    # 6. Add subtle top accent line (like the app header)
    accent = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accent)
    for x in range(SIZE):
        t = x / SIZE
        # Fade in and out from edges
        edge_fade = math.sin(t * math.pi) ** 0.5
        alpha = int(100 * edge_fade)
        accent_draw.line([(x, 30), (x, 33)], fill=(0, 240, 255, alpha))
    img = Image.alpha_composite(img, accent)

    # 7. Apply rounded rectangle mask
    mask = rounded_rect_mask(SIZE, CORNER_RADIUS)
    # Create final image with transparency
    final = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(img, mask=mask)

    # Save
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'build')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'icon.png')
    final.save(output_path, 'PNG')
    print(f"Icon saved to {output_path}")
    print(f"Size: {final.size}")

if __name__ == '__main__':
    main()

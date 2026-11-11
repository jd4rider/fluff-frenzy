"""
Fluff Frenzy character renderer.

Builds one shaggy pom-pom creature: a softly lumpy sphere under a coat of real
3D fur strands, with embedded glossy eyes and a tiny mouth. The scene is lit
like a plush product shot and rendered with a transparent alpha, so the frames
drop straight into the Phaser board as 2D sprites.

Usage (headless):
    blender -b --factory-startup --python art/blender/fluff.py -- \
        --color ruby --action idle --frames 1 --out art/render --save-blend art/blender/fluff.blend

`--color all --action all` renders the full set and writes the .blend so the
artwork stays reproducible.
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector

# Mirrors src/phaser/textures.ts: base, light, dark.
COLORS = {
    "ruby": ("#f0495f", "#ff8f9c", "#b3223a"),
    "sunshine": ("#ffcb2e", "#ffe98a", "#d09a00"),
    "ocean": ("#38a8f2", "#9ad8ff", "#1d6fb8"),
    "emerald": ("#31c46c", "#9deebc", "#1a8b4a"),
    "amethyst": ("#9a6cff", "#c9b0ff", "#6438c4"),
    "tangerine": ("#ff8a3d", "#ffc38c", "#c25a10"),
}

ACTIONS = {
    # name: frames rendered for that expression
    "idle": 6,
    "blink": 4,
    "wow": 3,
    "happy": 5,
}

SIZE = 384
# Dense and short: a plush coat, not a hedgehog.
STRANDS = 11000
EYE_X = 0.34
EYE_Z = 0.10
MOUTH_Z = -0.30


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def rgba(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = hex_color.lstrip("#")
    parts = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*(srgb_to_linear(part) for part in parts), alpha)


def rgb(hex_color: str) -> tuple[float, float, float]:
    value = hex_color.lstrip("#")
    return tuple(srgb_to_linear(int(value[i : i + 2], 16) / 255) for i in (0, 2, 4))  # type: ignore[return-value]


def set_if(target: object, name: str, value: object) -> None:
    """Blender renames settings between releases; set only what exists."""
    if hasattr(target, name):
        setattr(target, name, value)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 80
    scene.render.fps = 24
    scene.view_settings.view_transform = "Standard"
    set_if(scene.eevee, "taa_render_samples", 16)
    scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.6, 0.62, 0.7, 1.0)
    background.inputs["Strength"].default_value = 0.5


def make_body() -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=72, ring_count=48, radius=1.0)
    body = bpy.context.object
    body.name = "FluffBody"
    bpy.ops.object.shade_smooth()

    tex = bpy.data.textures.new("FluffLumps", type="CLOUDS")
    tex.noise_scale = 0.55
    tex.noise_depth = 2
    displace = body.modifiers.new("Lumps", "DISPLACE")
    displace.texture = tex
    displace.strength = 0.075
    displace.mid_level = 0.5
    displace.texture_coords = "LOCAL"

    body.scale = (1.0, 0.96, 1.02)
    return body


def make_body_material(name: str, base: str, dark: str) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba(base)
    bsdf.inputs["Roughness"].default_value = 0.8
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.2
    mat.diffuse_color = rgba(dark)
    return mat


def make_fur_material(name: str) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.62
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.24
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.45
        bsdf.inputs["Sheen Roughness"].default_value = 0.5
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "furcolor"
    links.new(colors.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def face_clear(direction: Vector) -> bool:
    """True when a strand grows from a patch of cheek/forehead, not the face."""
    eyes = [
        Vector((EYE_X, -0.86, EYE_Z)).normalized(),
        Vector((-EYE_X, -0.86, EYE_Z)).normalized(),
    ]
    mouth = Vector((0.0, -0.93, MOUTH_Z)).normalized()
    if any(direction.angle(eye, 0.0) < 0.27 for eye in eyes):
        return False
    if direction.angle(mouth, 0.0) < 0.17:
        return False
    return True


def add_fur(body: bpy.types.Object, base: str, light: str, dark: str) -> None:
    body.data.materials.append(make_body_material("Undercoat", base, dark))
    base_rgb = rgb(base)
    light_rgb = rgb(light)
    dark_rgb = rgb(dark)

    rng = random.Random(20261110)
    golden = math.pi * (3.0 - math.sqrt(5.0))
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    colours: list[tuple[float, float, float, float]] = []
    rings = 3
    sides = 4

    for index in range(STRANDS):
        z = 1.0 - 2.0 * (index + 0.5) / STRANDS
        radius = math.sqrt(max(0.0, 1.0 - z * z))
        theta = golden * index
        direction = Vector((math.cos(theta) * radius, math.sin(theta) * radius, z))
        if not face_clear(direction):
            continue

        length = 0.082 * rng.uniform(0.55, 1.5)
        # Strands lean outwards and then curl over, so the edge reads combed
        # and soft instead of radiating like a starburst.
        outward = (
            direction
            + Vector((rng.uniform(-0.16, 0.16), rng.uniform(-0.16, 0.16), rng.uniform(-0.16, 0.16)))
        ).normalized()
        bend = Vector((rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0)))
        bend -= outward * bend.dot(outward)
        if bend.length > 1e-6:
            bend.normalize()

        thick = 0.0145 * rng.uniform(0.7, 1.35)
        helper = Vector((0.0, 0.0, 1.0)) if abs(outward.z) < 0.9 else Vector((1.0, 0.0, 0.0))
        side = outward.cross(helper).normalized()
        up = outward.cross(side).normalized()

        # Root darker, tip warmer: reads as depth in a small sprite.
        jitter = rng.uniform(0.82, 1.16)
        start_index = len(verts)
        for ring in range(rings + 1):
            t = ring / rings
            centre = direction * 0.98 + outward * (length * t) + bend * (length * 1.15 * t * t)
            taper = max(0.0009, thick * (1.0 - t) ** 0.75)
            mix = 0.5 + 0.45 * t
            colour = tuple(
                (dark_rgb[channel] * (1.0 - mix) + base_rgb[channel] * mix * jitter) * (1.0 - 0.18 * (1.0 - t))
                for channel in range(3)
            )
            if t > 0.7:
                colour = tuple(
                    colour[channel] * 0.85 + light_rgb[channel] * 0.22 for channel in range(3)
                )
            for corner in range(sides):
                angle = (corner / sides) * math.tau
                offset = side * math.cos(angle) * taper + up * math.sin(angle) * taper
                point = centre + offset
                verts.append((point.x, point.y, point.z))
                colours.append((colour[0], colour[1], colour[2], 1.0))

        for ring in range(rings):
            for corner in range(sides):
                a = start_index + ring * sides + corner
                b = start_index + ring * sides + (corner + 1) % sides
                c = start_index + (ring + 1) * sides + (corner + 1) % sides
                d = start_index + (ring + 1) * sides + corner
                faces.append((a, b, c, d))

    mesh = bpy.data.meshes.new("FurCoat")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    attribute = mesh.color_attributes.new("furcolor", "FLOAT_COLOR", "POINT")
    for index, colour in enumerate(colours):
        attribute.data[index].color = colour

    fur = bpy.data.objects.new("FurCoat", mesh)
    bpy.context.collection.objects.link(fur)
    fur.parent = body
    bpy.ops.object.select_all(action="DESELECT")
    fur.select_set(True)
    bpy.context.view_layer.objects.active = fur
    bpy.ops.object.shade_smooth()
    fur.data.materials.append(make_fur_material("Fur"))
    print(f"[fluff] fur strands: {len(verts) // ((rings + 1) * sides)}", flush=True)


def make_eye_ball(name: str, x: float, z: float) -> tuple[bpy.types.Object, bpy.types.Object]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, radius=1.0, location=(x, -0.86, z))
    ball = bpy.context.object
    ball.name = name
    bpy.ops.object.shade_smooth()
    ball.scale = (0.19, 0.115, 0.205)

    mat = bpy.data.materials.new(f"{name}Mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba("#241a3a")
    bsdf.inputs["Roughness"].default_value = 0.16
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.75
    ball.data.materials.append(mat)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.052, location=(x - 0.055, -1.12, z + 0.072))
    glint = bpy.context.object
    glint.name = f"{name}Glint"
    bpy.ops.object.shade_smooth()
    glint.scale = (1.0, 0.6, 1.0)
    glint_mat = bpy.data.materials.new(f"{name}GlintMat")
    glint_mat.use_nodes = True
    glint_bsdf = glint_mat.node_tree.nodes["Principled BSDF"]
    glint_bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    glint_bsdf.inputs["Roughness"].default_value = 0.05
    glint_bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    glint_bsdf.inputs["Emission Strength"].default_value = 0.45
    glint.data.materials.append(glint_mat)
    return ball, glint


def make_mouth() -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=1.0, location=(0.0, -0.93, MOUTH_Z))
    mouth = bpy.context.object
    mouth.name = "Mouth"
    bpy.ops.object.shade_smooth()
    mouth.scale = (0.078, 0.05, 0.038)
    mat = bpy.data.materials.new("MouthMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba("#5b1730")
    bsdf.inputs["Roughness"].default_value = 0.35
    mouth.data.materials.append(mat)
    return mouth


def make_blush() -> None:
    for sign in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0, location=(sign * 0.56, -0.80, -0.14))
        patch = bpy.context.object
        patch.name = f"Blush{sign}"
        bpy.ops.object.shade_smooth()
        patch.scale = (0.17, 0.045, 0.10)
        mat = bpy.data.materials.new(f"BlushMat{sign}")
        mat.use_nodes = True
        set_if(mat, "blend_method", "BLEND")
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = rgba("#ff6f92", 0.55)
        bsdf.inputs["Alpha"].default_value = 0.38
        bsdf.inputs["Roughness"].default_value = 0.8
        patch.data.materials.append(mat)


def add_lighting() -> None:
    def area(name: str, location: Vector, energy: float, size: float, colour: tuple[float, float, float]) -> None:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size
        light.data.color = colour
        direction = Vector((0, 0, 0)) - location
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    area("Key", Vector((-2.4, -3.4, 3.0)), 420, 5.0, (1.0, 0.97, 0.92))
    area("Fill", Vector((3.0, -2.2, 0.4)), 150, 6.0, (0.82, 0.88, 1.0))
    area("Rim", Vector((1.4, 3.2, 2.6)), 280, 4.0, (1.0, 0.95, 0.85))


def add_camera() -> None:
    bpy.ops.object.camera_add(location=(0.0, -7.0, 0.55), rotation=(math.radians(87.5), 0.0, 0.0))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    # Framed so the creature covers about 78% of the square, matching the
    # spacing the board was designed around.
    camera.data.ortho_scale = 2.78
    bpy.context.scene.camera = camera


def set_pose(parts: dict, action: str, frame: int, frames: int) -> None:
    """Breathing, blinking and expression poses. None of this touches gameplay."""
    phase = (frame / max(1, frames)) * math.tau
    body = parts["body"]
    breathe = math.sin(phase) * 0.016

    left_eye = parts["left_eye"]
    right_eye = parts["right_eye"]
    mouth = parts["mouth"]

    body.scale = (1.0 + breathe, 0.96 - breathe * 0.4, 1.02 + breathe)
    body.location = (0.0, 0.0, breathe * 0.06)

    for eye in (left_eye, right_eye):
        eye.scale = (0.19, 0.115, 0.205)
    mouth.scale = (0.078, 0.05, 0.038)
    mouth.location = (0.0, -0.93, MOUTH_Z)

    if action == "blink":
        close = [0.18, 0.03, 0.03, 0.18][min(frame, 3)]
        for eye in (left_eye, right_eye):
            eye.scale = (0.19, 0.115, 0.205 * close)
    elif action == "wow":
        for eye in (left_eye, right_eye):
            eye.scale = (0.225, 0.13, 0.245)
        mouth.scale = (0.065, 0.05, 0.062)
    elif action == "happy":
        bounce = abs(math.sin(phase)) * 0.05
        body.location = (0.0, 0.0, bounce + 0.02)
        for eye in (left_eye, right_eye):
            eye.scale = (0.20, 0.115, 0.115)
        mouth.scale = (0.10, 0.05, 0.072)


def build(color_key: str) -> dict:
    base, light, dark = COLORS[color_key]
    reset_scene()
    body = make_body()
    add_fur(body, base, light, dark)
    left_eye, left_glint = make_eye_ball("EyeL", EYE_X, EYE_Z)
    right_eye, right_glint = make_eye_ball("EyeR", -EYE_X, EYE_Z)
    mouth = make_mouth()
    make_blush()
    add_lighting()
    add_camera()
    return {
        "body": body,
        "left_eye": left_eye,
        "right_eye": right_eye,
        "left_glint": left_glint,
        "right_glint": right_glint,
        "mouth": mouth,
    }


def render_action(parts: dict, out_dir: str, color_key: str, action: str, frames: int) -> None:
    target = os.path.join(out_dir, color_key, action)
    os.makedirs(target, exist_ok=True)
    scene = bpy.context.scene
    for frame in range(frames):
        set_pose(parts, action, frame, frames)
        scene.frame_set(frame + 1)
        scene.render.filepath = os.path.join(target, f"{action}_{frame:02d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[fluff] {color_key}/{action} frame {frame + 1}/{frames}", flush=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--color", default="ruby")
    parser.add_argument("--action", default="idle")
    parser.add_argument("--frames", type=int, default=0)
    parser.add_argument("--out", default="art/render")
    parser.add_argument("--save-blend", default="")
    args = parser.parse_args(argv)

    colors = list(COLORS) if args.color == "all" else [args.color]
    actions = list(ACTIONS) if args.action == "all" else [args.action]

    for color_key in colors:
        parts = build(color_key)
        if args.save_blend:
            os.makedirs(os.path.dirname(args.save_blend) or ".", exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend))
        for action in actions:
            frames = args.frames or ACTIONS[action]
            render_action(parts, args.out, color_key, action, frames)


if __name__ == "__main__":
    main()

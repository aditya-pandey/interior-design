# Build the /play/ protagonist in headless Blender with MPFB2 (MakeHuman, CC0): a fictional Indian woman in
# her early thirties, ~1.57 m, with a Mixamo-named skeleton; a kurta and churidar-style trousers cut from the
# body and MakeHuman's own skirt / tights helper shapes; a hair cap and a braid as placeholders until the
# MakeHuman asset pack (hair, brows, lashes, skins) is downloaded. Exports a GLB.
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import *
import bmesh
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.path.dirname(__file__), '../../viewer/play/models/protagonist.glb')

h = make_human()
rig = HumanService.add_builtin_rig(h, "mixamo")
bpy.context.view_layer.update()

# ---- bake the shape (targets) into the mesh, keeping the vertex groups
for m in h.modifiers: m.show_viewport = False
dg = bpy.context.evaluated_depsgraph_get()
baked = bpy.data.meshes.new_from_object(h.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
h.shape_key_clear()
old = h.data; h.data = baked; bpy.data.meshes.remove(old)
for m in list(h.modifiers):
    if m.type == 'MASK': h.modifiers.remove(m)
    else: m.show_viewport = True
print('baked verts', len(h.data.vertices), 'groups', len(h.vertex_groups))

G = {g.name: g.index for g in h.vertex_groups}
bones = [g for g in h.vertex_groups if g.name.startswith('mixamorig:')]
bone_idx = {g.index: g.name.split(':')[1] for g in bones}
me = h.data
def groups_of(v): return {gr.group: gr.weight for gr in v.groups}
in_group = lambda v, name: any(gr.group == G[name] and gr.weight > 0.5 for gr in v.groups)
def dominant(v):
    best, bw = None, 0
    for gr in v.groups:
        if gr.group in bone_idx and gr.weight > bw: best, bw = bone_idx[gr.group], gr.weight
    return best
DOM = [dominant(v) for v in me.vertices]
HELPER = [in_group(v, 'HelperGeometry') or in_group(v, 'JointCubes') for v in me.vertices]
CO = [v.co.copy() for v in me.vertices]
NO = [v.normal.copy() for v in me.vertices]

# elbow positions (rest pose, object space): sleeves end ~13 cm past the elbow (three-quarter sleeves)
def bone_head(name):
    b = rig.data.bones['mixamorig:' + name]
    return (h.matrix_world.inverted() @ rig.matrix_world @ b.head_local)
ELB = {s: bone_head(f'{s}ForeArm') for s in ('Left', 'Right')}
TORSO = {'Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm'}
def under_kurta(i):
    d = DOM[i]
    if d in TORSO: return True
    for s in ('Left', 'Right'):
        if d == f'{s}ForeArm' and (CO[i] - ELB[s]).length < 0.13: return True
    return False
LEGS = {'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'}
def under_trousers(i): return DOM[i] in LEGS or DOM[i] == 'Hips'

def piece(name, keep_face, offset=0.0, mat=None):
    """a copy of the human keeping only faces where keep_face(face) is true, pushed out along normals"""
    ob = h.copy(); ob.data = h.data.copy(); ob.name = name
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if not keep_face([v.index for v in f.verts])]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.normal_update()
    if offset:
        for v in bm.verts: v.co += v.normal * offset
    bm.to_mesh(ob.data); bm.free()
    ob.data.materials.clear()
    if mat: ob.data.materials.append(mat)
    for m in ob.modifiers:
        if m.type == 'ARMATURE': m.object = rig
    return ob

def principled(name, rgb, rough=0.6, sheen=0.0, sss=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if sheen: p.inputs['Sheen Weight'].default_value = sheen
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss
        p.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    return m

srgb = lambda hx: tuple(((int(hx[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5))
SKIN = principled('skin', srgb('#94603f'), rough=0.52, sss=0.2)
KURTA = principled('kurta', srgb('#1e6a73'), rough=0.85, sheen=0.4)
TROUSERS = principled('trousers', srgb('#ece4d6'), rough=0.9, sheen=0.3)
HAIR = principled('hair', srgb('#120d0a'), rough=0.62, sheen=0.0)
EYE = principled('eyes', srgb('#f1ece6'), rough=0.08)
# the eye: white, a dark brown iris with a darker ring, a black pupil (laid out as MakeHuman's eye texture:
# the iris at the centre of the image)
def eye_image(S=256):
    img = bpy.data.images.new('eye_brown', S, S)
    px = [0.0] * (S * S * 4)
    for y in range(S):
        for x in range(S):
            dx, dy = (x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5
            r = math.hypot(dx, dy) * 2
            if r < 0.16: c = (0.02, 0.015, 0.012)
            elif r < 0.42:
                k = (r - 0.16) / 0.26; streak = 0.85 + 0.15 * math.sin(math.atan2(dy, dx) * 23)
                c = tuple(v * streak for v in ((0.16, 0.08, 0.035) if k < 0.85 else (0.06, 0.035, 0.02)))
            else: c = (0.86, 0.82, 0.78) if r < 0.95 else (0.8, 0.72, 0.68)
            i = (y * S + x) * 4
            px[i:i + 4] = [c[0], c[1], c[2], 1.0]
    img.pixels = px
    img.pack()
    return img
tex = EYE.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = eye_image()
EYE.node_tree.links.new(tex.outputs['Color'], EYE.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
LASH = principled('lashes', srgb('#120d0b'), rough=0.6)

ingrp = lambda name: [in_group(v, name) for v in me.vertices]
SKIRT, TIGHTS, HAIRCAP = ingrp('helper-skirt'), ingrp('helper-tights'), ingrp('helper-hair')
EYES = [a or b for a, b in zip(ingrp('helper-l-eye'), ingrp('helper-r-eye'))]
LASHES = [any(t) for t in zip(*[ingrp(n) for n in ('helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2')])]

# heights (object space, Z up; the model faces -Y)
KNEE = min(bone_head('LeftLeg').z, bone_head('RightLeg').z)
ANKLE = bone_head('LeftFoot').z
HIPZ = bone_head('Hips').z
HEAD = bone_head('Head')
def hairline(i):
    # hair over the crown and back of the head: the hairline is high on the forehead, above the ears,
    # and low at the nape
    r = CO[i] - HEAD
    if DOM[i] not in ('Head', 'Neck') and r.z < 0.0: return False
    front = max(0.0, min(1.0, (-r.y + 0.02) / 0.1))          # 0 at the back of the head, 1 at the face
    return r.z > -0.045 + front * 0.165 and not (abs(r.x) > 0.06 and r.z < 0.06 + 0.04 * front and r.y < 0.03)   # (and not over the ears)
kurta_top = piece('kurta', lambda vs: all(not HELPER[i] and under_kurta(i) for i in vs), 0.011, KURTA)
kurta_skirt = piece('kurta_skirt', lambda vs: all(SKIRT[i] and CO[i].z > KNEE - 0.06 for i in vs), 0.006, KURTA)       # knee length
trousers = piece('trousers', lambda vs: all(TIGHTS[i] and CO[i].z < KNEE + 0.12 and CO[i].z > ANKLE + 0.04 and DOM[i] in (LEGS | {'Hips'}) for i in vs), 0.005, TROUSERS)
hair = piece('hair', lambda vs: all(not HELPER[i] and hairline(i) for i in vs), 0.007, HAIR)        # a cap shaped to her head
eyes = piece('eyes', lambda vs: all(EYES[i] for i in vs), 0.0, EYE)
# each eyeball gets its own front-on texture layout, the iris at the front (the helper's UVs are a tiny
# patch of the body's atlas)
def eye_uvs(ob):
    me2 = ob.data; uvl = me2.uv_layers.active.data
    for side in (-1, 1):
        vs = [v for v in me2.vertices if (v.co.x > 0) == (side > 0)]
        cx = sum(v.co.x for v in vs) / len(vs); cz = sum(v.co.z for v in vs) / len(vs)
        r = (max(v.co.x for v in vs) - min(v.co.x for v in vs)) / 2
        for p in me2.polygons:
            for li in p.loop_indices:
                v = me2.vertices[me2.loops[li].vertex_index].co
                if (v.x > 0) == (side > 0): uvl[li].uv = ((v.x - cx) / (2 * r) * 0.92 + 0.5, (v.z - cz) / (2 * r) * 0.92 + 0.5)
eye_uvs(eyes)
lashes = piece('lashes', lambda vs: all(LASHES[i] for i in vs), 0.0, LASH)

# the body: no helpers, and nothing hidden under the clothes (keeps the skin from poking through)
body = piece('body', lambda vs: all(not HELPER[i] for i in vs) and not all(under_kurta(i) or (under_trousers(i) and CO[i].z > ANKLE + 0.06) for i in vs), 0.0, SKIN)
bpy.data.objects.remove(h)

# a simple braid down the back: a chain of slightly twisted ellipsoids, weighted to the neck and upper spine
hb = rig.matrix_world @ rig.data.bones['mixamorig:Head'].head_local
nb = rig.matrix_world @ rig.data.bones['mixamorig:Neck'].head_local
bm = bmesh.new()
top = Vector((hb.x, hb.y + 0.09, hb.z + 0.02))            # behind the head (the model faces -Y)
n = 14
for k in range(n):
    t = k / (n - 1)
    c = top + Vector((0, 0.035 * math.sin(t * 1.2), -0.42 * t))
    r = 0.034 * (1 - 0.55 * t)
    m = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=r)
    for v in m['verts']:
        v.co.x *= 1.0; v.co.z *= 1.5
        v.co.rotate(__import__('mathutils').Euler((0, 0, (k % 2 - 0.5) * 0.6)))
        v.co += c
braid = bpy.data.objects.new('braid', bpy.data.meshes.new('braid'))
bm.to_mesh(braid.data); bm.free()
bpy.context.collection.objects.link(braid)
braid.data.materials.append(HAIR)
braid.parent = rig
braid.matrix_parent_inverse = rig.matrix_world.inverted()
for nm in ('mixamorig:Neck', 'mixamorig:Spine2', 'mixamorig:Head'): braid.vertex_groups.new(name=nm)
for v in braid.data.vertices:
    z = (braid.matrix_world @ v.co).z
    w = max(0.0, min(1.0, (z - (nb.z - 0.25)) / 0.3))
    braid.vertex_groups['mixamorig:Head'].add([v.index], w, 'REPLACE')
    braid.vertex_groups['mixamorig:Spine2'].add([v.index], 1 - w, 'REPLACE')
am = braid.modifiers.new('Armature', 'ARMATURE'); am.object = rig

parts = [body, kurta_top, kurta_skirt, trousers, hair, eyes, lashes, braid]
for ob in parts:
    for p in ob.data.polygons: p.use_smooth = True
print('pieces', {ob.name: len(ob.data.polygons) for ob in parts})

# ---- export
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for ob in parts: ob.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
                          export_morph=False, export_apply=False, export_yup=True)
print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))

# ---- a single mesh (no skeleton) for Mixamo's auto-rigger: upload it, rig it, download animations
if '--fbx' in sys.argv:
    fbx = sys.argv[sys.argv.index('--fbx') + 1]
    bpy.ops.object.select_all(action='DESELECT')
    keep = []
    for ob in parts:
        c = ob.copy(); c.data = ob.data.copy(); bpy.context.collection.objects.link(c)
        c.modifiers.clear(); c.parent = None; c.matrix_world = ob.matrix_world.copy()
        c.vertex_groups.clear(); keep.append(c)
    for c in keep: c.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.object.join()
    bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True, add_leaf_bones=False, mesh_smooth_type='FACE', path_mode='COPY', embed_textures=True)
    print('fbx', fbx, os.path.getsize(fbx) // 1024, 'KB')

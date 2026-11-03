import bpy, addon_utils, importlib
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
def svc(mod, cls): return getattr(importlib.import_module('bl_ext.user_default.mpfb.' + mod), cls)
HumanService = svc('services.humanservice', 'HumanService')
TargetService = svc('services.targetservice', 'TargetService')
HOP = svc('entities.objectproperties', 'HumanObjectProperties')

# a fictional woman in her early thirties, of average height for India (~1.57 m), slim-average build
MACROS = dict(gender=0.0, age=0.5615, muscle=0.45, weight=0.48, height=0.45, proportions=0.6, cupsize=0.5, firmness=0.5,
              african=0.3, asian=0.2, caucasian=0.5)
def make_human():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
    h = HumanService.create_human()
    for k, v in MACROS.items(): HOP.set_value(k, v, entity_reference=h)
    TargetService.reapply_macro_details(h)
    return h

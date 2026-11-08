"""
Oral / denture base helper for FreeCAD 1.1
Creates a simplified full-denture base plate with controlled thickness.
Units: mm. Suitable as starting point for elderly severe alveolar ridge atrophy research.
"""
import FreeCAD as App
import Part

doc = App.newDocument("DentureBase")

# Simplified U-shaped base (parametric)
length = 60.0   # mm, arch length
width = 40.0    # mm
thickness = 3.0 # mm, base plate thickness

# Outer box then cut inner for U-shape approximation
outer = doc.addObject("Part::Box", "Outer")
outer.Length = length
outer.Width = width
outer.Height = thickness

inner = doc.addObject("Part::Box", "Inner")
inner.Length = length - 16
inner.Width = width - 20
inner.Height = thickness + 2
inner.Placement.Base = App.Vector(8, 10, -1)

cut = doc.addObject("Part::Cut", "DentureBase")
cut.Base = outer
cut.Tool = inner
doc.recompute()

print("DENTURE_BASE_VOLUME:", cut.Shape.Volume)
print("OK: denture base plate ready")
# Optional: doc.saveAs(r"C:\temp\denture_base.FCStd")

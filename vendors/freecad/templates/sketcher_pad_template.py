"""
High-quality Sketcher + PartDesign Pad template for FreeCAD 1.1
Units: mm. Includes recompute + volume check.
Usage: freecadcmd this_file.py
"""
import FreeCAD as App
import Part
import Sketcher

doc = App.newDocument("HQ_Pad")
body = doc.addObject("PartDesign::Body", "Body")
sketch = body.newObject("Sketcher::SketchObject", "Sketch")

# Rectangle sketch on XY (50x30 mm)
sketch.addGeometry(Part.LineSegment(App.Vector(0,0,0), App.Vector(50,0,0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(50,0,0), App.Vector(50,30,0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(50,30,0), App.Vector(0,30,0)), False)
sketch.addGeometry(Part.LineSegment(App.Vector(0,30,0), App.Vector(0,0,0)), False)

# Coincident constraints for closed profile
for i in range(4):
    sketch.addConstraint(Sketcher.Constraint("Coincident", i, 2, (i+1)%4, 1))

pad = body.newObject("PartDesign::Pad", "Pad")
pad.Profile = sketch
pad.Length = 20.0
doc.recompute()

vol = pad.Shape.Volume
print("VOLUME:", vol)
if abs(vol - 50*30*20) > 0.1:
    raise Exception("Volume mismatch in HQ pad")

print("OK: high-quality pad created")

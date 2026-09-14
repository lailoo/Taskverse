"""Reproducible pixel-town architecture. Run with Python 3 + Pillow.

Original AI Town house parts are retained; extensions assemble the same parts.
The resulting art is distributed under CC BY-SA 3.0, see buildings/SOURCES.md.
"""
from pathlib import Path
import json
import random
from hashlib import sha256
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/ai-town/buildings"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = Image.open(ROOT / "public/assets/ai-town/rpg-tileset.png").convert("RGBA")
PARTS = {
    "gold_roof": (824, 0, 940, 108),
    "brown_roof": (824, 224, 940, 332),
    "plaster": (1200, 696, 1224, 728),
    "wood": (1104, 752, 1128, 824),
    "stone": (1440, 688, 1472, 720),
    "doorway": (1120, 656, 1184, 752),
    "wood_doorway": (1120, 752, 1184, 848),
    "stone_doorway": (1376, 656, 1440, 752),
    "timber_facade": (1104, 624, 1232, 656),
}
KINDS = [
    ("cottage", "原版木屋"), ("inn", "林间旅馆"), ("tavern", "小镇餐馆"),
    ("boutique", "礼服小店"), ("florist", "花艺温室"), ("studio", "摄影工坊"),
    ("chapel", "婚礼礼堂"), ("warehouse", "物资仓库"), ("station", "接待驿站"),
    ("bank", "预算账房"), ("postoffice", "小镇邮局"), ("pavilion", "音乐花亭"),
    ("grandhotel", "鸿福大酒店"), ("dragoninn", "龙门客栈"), ("lodge", "小旅馆"),
    ("watchtower", "箭塔"), ("wall", "园区围墙"),
]
INK = "#4b2d3c"


def rgb(value):
    return tuple(bytes.fromhex(value.lstrip("#")))


def source_part(name):
    return SOURCE.crop(PARTS[name])


def original_house(variant=0):
    """The early integration's original roof and half-timber facade, un-repainted."""
    house = Image.new("RGBA", (80, 88))
    house.alpha_composite(source_part("timber_facade").resize((52, 18), Image.Resampling.NEAREST), (14, 60))
    house.alpha_composite(source_part("brown_roof" if variant == 1 else "gold_roof").resize((64, 60), Image.Resampling.NEAREST), (8, 3))
    return house


class Builder:
    def __init__(self, kind, variant):
        self.im = Image.new("RGBA", (80, 88))
        self.d = ImageDraw.Draw(self.im)
        self.rng = random.Random(f"town-{kind}-{variant}-v1")
        self.variant = variant
        self.material = "plaster"
        self.d.polygon([(9, 74), (64, 73), (76, 79), (67, 84), (15, 83), (5, 79)], fill="#253c2760")
        self.d.rectangle((20, 76, 62, 80), fill="#8c80615a")

    def rect(self, box, fill, outline=None):
        self.d.rectangle(box, fill=fill, outline=outline)

    def line(self, points, fill, width=1):
        self.d.line(points, fill=fill, width=width)

    def textured(self, points, color):
        mask = Image.new("L", self.im.size)
        ImageDraw.Draw(mask).polygon(points, fill=255)
        x0, y0, x1, y1 = mask.getbbox()
        base = rgb(color)
        pixels = self.im.load()
        for y in range(y0, y1):
            for x in range(x0, x1):
                if mask.getpixel((x, y)):
                    noise = self.rng.choice([-4, 0, 0, 2])
                    pixels[x, y] = tuple(max(0, min(255, c + noise)) for c in base) + (255,)

    def tile(self, name, x, y, w, h):
        part = source_part(name)
        tile = part.resize((max(1, part.width // 2), max(1, part.height // 2)), Image.Resampling.NEAREST)
        surface = Image.new("RGBA", (w, h))
        for yy in range(0, h, tile.height):
            for xx in range(0, w, tile.width):
                surface.alpha_composite(tile, (xx, yy))
        self.im.alpha_composite(surface, (x, y))

    def wall(self, x, y, w, h, material="plaster"):
        material = "plaster" if material == "rose" else material
        self.material = material
        self.tile(material, x, y, w + 1, h + 1)
        if material == "plaster":
            # Same red timber and warm plaster as the untouched original facade.
            facade = source_part("timber_facade").resize((w + 1, 12), Image.Resampling.NEAREST)
            self.im.alpha_composite(facade, (x, y))
            for xx in [x + 1, x + w - 3]:
                self.rect((xx, y + 10, xx + 2, y + h), "#914b52")
                self.line([(xx, y + 10), (xx, y + h)], "#bd755d")
        self.line([(x, y), (x, y + h), (x + w, y + h), (x + w, y)], INK)
        self.rect((x, y + h - 1, x + w, y + h + 1), "#91564b")
        self.line([(x, y + h - 1), (x + w, y + h - 1)], "#d59a6b")

    def roof(self, x, y, w, h, palette="straw", style="hip"):
        # Keep source colours, three roof planes and the original irregular eaves.
        # Names from older recipes choose either of the two original roof materials.
        part = source_part("brown_roof" if palette in ("clay", "plum") else "gold_roof")
        self.im.alpha_composite(part.resize((w + 6, h + 4), Image.Resampling.NEAREST), (x - 3, y))

    def window(self, x, y, w=8, h=10, arch=False, shutters=False):
        # Thin timber frames, shaded openings and tiny highlights, at the source pixel scale.
        self.rect((x - 1, y - 1, x + w + 1, y + h + 1), "#7a414b")
        self.rect((x, y, x + w, y + h), "#322f40")
        self.rect((x + 1, y + 1, x + w // 2, y + h - 1), "#556e73")
        self.line([(x + 1, y + 2), (x + w - 2, y + 2)], "#90a5a0")
        self.line([(x + w // 2, y), (x + w // 2, y + h)], "#be785e")
        self.line([(x, y + h // 2), (x + w, y + h // 2)], "#a26552")
        self.line([(x - 1, y + h + 1), (x + w + 1, y + h + 1)], "#dfa576")
        if arch:
            self.rect((x - 1, y - 1, x, y), "#f1c89b")
            self.rect((x + w, y - 1, x + w + 1, y), "#f1c89b")
        if shutters:
            for xx in [x - 4, x + w + 2]:
                self.tile("wood", xx, y, 3, h + 1)

    def door(self, x=35, y=60, w=10, h=17, arch=False):
        # Reuse the original arched doorway; fill its opening with the source wood tile.
        frame = source_part({"wood": "wood_doorway", "stone": "stone_doorway"}.get(self.material, "doorway"))
        frame.alpha_composite(source_part("wood").resize((24, 68), Image.Resampling.NEAREST), (20, 28))
        self.im.alpha_composite(frame.resize((w + 6, h + 3), Image.Resampling.NEAREST), (x - 3, y - 2))
        self.rect((x + w - 2, y + h // 2, x + w - 1, y + h // 2 + 1), "#e6c35e")
        self.line([(x - 2, y + h + 1), (x + w + 2, y + h + 1)], "#c8a57b")

    def chimney(self, x, y):
        self.rect((x,y,x+6,y+14), "#886e58", INK)
        for yy in range(y+3,y+14,4): self.line([(x+1,yy),(x+5,yy)], "#b49471")
        self.rect((x-1,y-1,x+7,y+2), "#b6a38a", INK)
        self.rect((x+1,y,x+5,y+1), "#4c463b")

    def awning(self, x, y, w, color):
        self.d.polygon([(x+2,y),(x+w-2,y),(x+w+1,y+8),(x-1,y+8)],fill="#daceb0",outline=INK)
        for xx in range(x+2,x+w-1,7): self.d.polygon([(xx,y+1),(xx+3,y+1),(xx+4,y+7),(xx-1,y+7)], fill=color)
        self.rect((x-1,y+8,x+w+1,y+10), "#d5c49e")
        for xx in range(x,x+w,7): self.rect((xx,y+8,xx+3,y+11),color)
        self.line([(x-1,y+11),(x-1,y+20)],"#64533c"); self.line([(x+w+1,y+11),(x+w+1,y+20)],"#64533c")

    def planter(self, x, y, flowers=True):
        self.rect((x,y,x+8,y+4),"#8d684a",INK); self.line([(x,y),(x+8,y)],"#be9568")
        for xx in range(x+1,x+8,2):
            self.rect((xx,y-3,xx+1,y-1),self.rng.choice(["#799156","#566c44","#a0af65"]))
            if flowers: self.rect((xx,y-4,xx+1,y-3),self.rng.choice(["#dbaa90","#ddd7af","#a694b5"]))

    def sign(self, x, y, icon="flower"):
        self.line([(x,y-6),(x+9,y-6),(x+9,y)], "#68563f",2)
        self.rect((x+3,y-1,x+15,y+9),"#bfa778",INK)
        self.rect((x+5,y+1,x+13,y+7),"#4c6255")
        if icon == "camera":
            self.rect((x+6,y+3,x+12,y+6),"#cecbb0");self.rect((x+9,y+4,x+10,y+5),"#475a53")
        elif icon == "letter":
            self.rect((x+6,y+2,x+12,y+6),"#e5d7b0"); self.line([(x+6,y+2),(x+9,y+4),(x+12,y+2)],"#947e55")
        elif icon == "dress": self.d.polygon([(x+8,y+2),(x+10,y+2),(x+10,y+4),(x+12,y+6),(x+6,y+6),(x+8,y+4)],fill="#eee0c8")
        elif icon == "coin": self.d.ellipse((x+7,y+2,x+11,y+6), fill="#e2bc68")
        else: self.d.ellipse((x+7,y+2,x+11,y+6),fill="#d9ae8e")

    def crate(self, x, y):
        self.rect((x,y,x+9,y+9),"#9a8055",INK)
        self.line([(x+1,y+1),(x+8,y+8)],"#c8a877",2);self.line([(x+8,y+1),(x+1,y+8)],"#c8a877")

    def clock(self, x, y):
        self.d.ellipse((x,y,x+10,y+10),fill="#d9cfad",outline="#675c48")
        self.line([(x+5,y+2),(x+5,y+5),(x+8,y+6)],"#655b44")


def build(kind, variant):
    b = Builder(kind,variant)
    accent = ["sage","clay","slate"][variant]
    if kind == "cottage":
        b.im = original_house(variant)
        b.d = ImageDraw.Draw(b.im)
        if variant == 2: b.chimney(51,19)
        return b.im.resize((160,176),Image.Resampling.NEAREST)
    elif kind == "inn":
        b.wall(13,30,52,45); b.roof(10,8,58,27,accent)
        for xx in [20,38,54]: b.window(xx,40,6,9,arch=True)
        b.door(33,59,12,18); b.window(19,60,8,10); b.window(53,60,7,10)
        b.line([(16,55),(62,55)],"#674e3b",2)
        for xx in range(18,63,6):b.line([(xx,51),(xx,56)],"#998262")
        if variant==1:b.roof(46,19,16,13,"straw","gable")
        else:b.chimney(54,9)
        b.sign(59,53); b.planter(13,76)
    elif kind == "tavern":
        b.wall(12,40,55,35,"wood"); b.roof(9,15,61,31,"clay")
        b.chimney(18,15); b.door(36,59,10,18)
        b.window(18,52,12,12);b.window(52,52,8,12)
        b.awning(17,51,42,"#8c624c"); b.sign(61,45)
        b.d.ellipse((7,67,17,78),fill="#987649",outline=INK);b.line([(7,72),(17,72)],"#504c3d")
        if variant==2:b.planter(65,73)
    elif kind == "boutique":
        b.wall(18,38,44,38,"rose");b.roof(15,11,50,32,"plum")
        b.window(23,48,14,16);b.door(44,58,10,19)
        b.d.polygon([(28,52),(32,52),(32,56),(35,60),(26,60),(29,55)],fill="#ecdfc3")
        b.awning(19,45,40,"#957790");b.sign(57,36,"dress")
        b.planter(12,74);b.planter(65,74)
        if variant==1:b.window(35,31,7,8,arch=True)
    elif kind == "florist":
        b.wall(9,52,60,23,"stone")
        # Long glazed conservatory and a small timber shop wing.
        b.textured([(8,50),(34,18),(68,37),(70,57),(8,57)],"#98b5a3")
        b.d.polygon([(34,18),(68,37),(70,57),(34,42)],fill="#648e82")
        for xx in range(8,66,10):b.line([(xx,54),(min(34+int((xx-8)*.5),66),22+int((xx-8)*.25))],"#cfccb0",2)
        b.line([(8,50),(34,18),(68,37),(70,57),(8,57),(8,50)],"#5c7157",2)
        b.line([(16,41),(43,50),(68,43)],"#d3dbc0")
        b.door(34,60,11,17)
        for xx in [6,18,53,66]: b.planter(xx,73)
        b.sign(61,53)
    elif kind == "studio":
        b.wall(13,39,53,36,"wood");b.roof(10,14,59,29,"slate")
        b.window(19,50,24,18);b.door(51,57,10,19)
        b.rect((25,22,17+25,31),"#435c65",INK)
        b.line([(27,23),(39,23),(35,29)],"#b2c9be")
        b.sign(59,40,"camera");b.planter(9,76,False)
        if variant==1:b.chimney(54,13)
        b.line([(24,72),(18,79)],"#564b3b");b.line([(24,72),(30,79)],"#564b3b");b.rect((20,66,29,71),"#555b54",INK)
    elif kind == "chapel":
        b.wall(15,42,50,34,"stone");b.roof(12,17,56,34,"clay" if variant==1 else "sage","gable")
        b.window(20,53,7,16,arch=True);b.window(53,53,7,16,arch=True)
        b.wall(33,27,15,47,"stone");b.roof(31,6,19,24,"slate","gable")
        b.rect((36,31,44,39),"#4d5041");b.d.ellipse((38,32,42,37),fill="#c1a56f")
        b.door(35,59,11,19,True);b.clock(35,43)
        b.planter(9,76);b.planter(65,76)
    elif kind == "warehouse":
        b.wall(9,38,61,37,"wood");b.roof(7,10,65,34,"clay","gable")
        b.door(27,51,25,25);b.line([(39,52),(39,76)],INK,2)
        b.line([(28,53),(50,73)],"#ad9570",2);b.line([(50,53),(28,73)],"#ad9570",2)
        b.window(15,50,7,9);b.window(57,49,7,9)
        b.crate(7,72);b.crate(62,70);b.crate(67,75)
        if variant==2:b.window(35,30,9,7)
    elif kind == "station":
        b.wall(10,40,59,35);b.roof(7,19,65,27,accent)
        b.wall(31,24,18,28,"wood");b.roof(29,9,22,17,"clay","gable");b.clock(35,29)
        b.door(35,58,10,19);b.window(17,51,10,12);b.window(54,51,8,12)
        b.awning(9,51,61,"#688066")
        b.rect((8,75,25,77),"#b89964",INK);b.line([(11,78),(11,81)],INK);b.line([(22,78),(22,81)],INK)
        b.crate(62,76)
    elif kind == "bank":
        b.wall(13,35,53,40,"stone");b.roof(10,13,59,27,"slate")
        b.door(34,53,13,23,True)
        b.window(19,44,8,15,True);b.window(54,44,7,15,True)
        # Portico, stone pillars and wide stairs distinguish the public building.
        b.roof(28,39,27,13,"straw","gable")
        for xx in [28,51]:
            b.rect((xx,54,xx+3,75),"#d2c7a9",INK);b.rect((xx-1,73,xx+4,76),"#b5ac92")
        b.rect((26,77,59,79),"#b7b39b");b.line([(26,77),(59,77)],"#ded5b8")
        b.sign(59,34,"coin")
    elif kind == "postoffice":
        b.wall(17,43,47,32);b.roof(14,14,53,33,"clay")
        b.window(22,54,11,11);b.door(41,58,11,19);b.sign(57,45,"letter")
        b.rect((8,62,16,74),"#996653",INK);b.rect((7,60,17,64),"#bb8269",INK);b.line([(10,66),(14,66)],"#473f36")
        b.line([(11,75),(11,80)],"#6a5943",2);b.planter(63,75)
        if variant!=1:b.chimney(21,15)
    elif kind == "pavilion":
        b.d.polygon([(10,69),(64,66),(72,73),(60,81),(12,78)],fill="#8f7852",outline=INK)
        for yy in range(71,78,3):b.line([(13,yy),(64,yy)],"#b49b6f")
        for xx in [15,34,61]:b.rect((xx,40,xx+3,74),"#c4ad79",INK)
        b.roof(9,15,60,30,"sage" if variant!=1 else "plum")
        b.line([(11,61),(65,61)],"#987e53",2)
        for xx in range(14,66,7):b.line([(xx,62),(xx,69)],"#a28c64")
        b.line([(43,50),(43,65),(38,67)],"#d8c38e",2);b.line([(43,50),(50,52)],"#d8c38e",2)
        b.planter(6,76);b.planter(65,75)
    elif kind == "grandhotel":
        # A tall civic hotel: three stacked floors, balconies and a lit crown.
        b.wall(14,27,53,48,"plaster")
        for yy in [44,60]:
            b.rect((12,yy,68,yy+1),"#8e4750"); b.line([(12,yy),(68,yy)],"#c88060")
        for yy in [32,48,63]:
            for xx in [20,35,50,59]: b.window(xx,yy,5,8,arch=True)
        b.door(34,61,13,15,True); b.roof(11,3,59,25,"clay" if variant == 1 else "straw")
        if variant == 2: b.chimney(53,9)
        b.sign(58,57,"coin"); b.planter(7,76); b.planter(68,76)
    elif kind == "dragoninn":
        # Layered eaves and a narrow entrance tower, inspired by an old gate inn.
        b.wall(9,39,62,36,"wood"); b.roof(6,26,68,20,"clay","gable")
        b.wall(27,22,27,40,"wood"); b.roof(23,9,35,19,"straw","gable")
        b.roof(5,34,70,13,"clay"); b.roof(24,17,36,12,"straw")
        for xx in [14,22,57,64]: b.window(xx,49,7,10,arch=True)
        b.window(35,29,10,12,arch=True); b.door(34,57,12,19,True)
        b.sign(58,45); b.planter(7,76); b.planter(68,76)
        if variant == 1: b.chimney(15,24)
        if variant == 2: b.clock(35,43)
    elif kind == "lodge":
        b.wall(18,43,44,32,"wood"); b.roof(12,17,55,30,"sage" if variant == 1 else "straw","gable")
        b.door(35,59,10,17); b.window(22,51,10,11,shutters=True); b.window(50,51,8,11)
        b.chimney(52 if variant != 2 else 20,18); b.planter(12,75); b.planter(63,75,False)
        if variant == 2: b.roof(43,31,19,13,"clay","gable")
    elif kind == "watchtower":
        # Stone arrow tower with crenellated crown and visible slit windows.
        b.wall(25,26,30,50,"stone"); b.roof(21,10,38,18,"slate","gable")
        for xx in [24,31,39,47,54]: b.rect((xx,21,xx+5,27),"#b6aa8d",INK)
        b.rect((25,17,55,22),"#8e8872",INK)
        for yy in [34,47,60]:
            b.rect((38,yy,42,yy+8),"#414b49",INK); b.rect((39,yy,40,yy+2),"#a7b1a0")
        b.door(34,58,12,18,True); b.planter(14,76); b.planter(58,76,False)
    elif kind == "wall":
        # A low defensive wall and gate that can mark a park boundary.
        b.wall(5,42,68,33,"stone")
        for xx in range(6,71,9):
            b.tile("stone",xx,34,6,9);b.line([(xx,34),(xx+5,34)],"#b2a6ba")
        b.door(33,56,14,20,True)
        if variant == 1:
            for xx in [11,64]: b.tile("wood",xx,43,2,30)
        if variant == 2: b.planter(11,74,False)
    # Additional structural detail per stable variant, using the same limited palette.
    if variant==2 and kind in ["cottage","tavern","postoffice"]:
        b.roof(27,32,19,13,"straw","gable"); b.window(34,40,6,6)
    if variant==1 and kind in ["florist","boutique","studio","bank"]:
        b.planter(27,77)
    if variant==1 and kind in ["tavern","warehouse","postoffice"]:
        b.roof(8,47,19,12,"sage");b.crate(5,74)
    if variant==2 and kind in ["boutique","studio","bank"]:
        b.roof(28,22,19,14,"plum" if kind=="boutique" else "clay","gable")
        b.window(34,31,7,7,arch=True)
    if variant==2 and kind=="florist":
        b.wall(8,56,18,18,"wood");b.roof(7,40,21,17,"straw","gable");b.planter(10,74)
    if variant==2 and kind=="chapel":
        b.window(16,48,9,18,arch=True);b.window(55,48,8,18,arch=True)
        b.line([(11,74),(11,55),(17,49)],"#b49b68",2)
        b.rect((8,54,13,59),"#e2c382",INK)
    if variant==2 and kind=="pavilion":
        b.line([(18,48),(58,48)],"#5f6c42")
        for xx in range(18,59,8):b.rect((xx,49,xx+2,52),"#dfc898")
        b.planter(16,75);b.planter(53,75)
    return b.im.resize((160,176),Image.Resampling.NEAREST)


ATLAS_COLUMNS = 6
ATLAS_FRAME_W, ATLAS_FRAME_H = 160, 176
atlas_rows = (len(KINDS) * 3 + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
atlas = Image.new("RGBA", (ATLAS_COLUMNS * ATLAS_FRAME_W, atlas_rows * ATLAS_FRAME_H))
frames = {}
for index,(kind,label) in enumerate(KINDS):
    variants=[]
    for variant in range(3):
        frame_index=index*3+variant
        x=frame_index%ATLAS_COLUMNS*ATLAS_FRAME_W;y=frame_index//ATLAS_COLUMNS*ATLAS_FRAME_H
        atlas.alpha_composite(build(kind,variant),(x,y))
        variants.append({"x":x,"y":y,"w":160,"h":176})
    frames[kind]={"label":label,"variants":variants}
atlas.save(OUT / "town-buildings.png",optimize=True)
(OUT / "town-buildings.json").write_text(json.dumps({
    "image": "town-buildings.png",
    "revision": sha256((OUT / "town-buildings.png").read_bytes()).hexdigest()[:12],
    "style": "ai-town-original-parts",
    "source": "rpg-tileset.png",
    "sourceSha256": sha256((ROOT / "public/assets/ai-town/rpg-tileset.png").read_bytes()).hexdigest(),
    "sourceParts": {name: {"x": box[0], "y": box[1], "w": box[2] - box[0], "h": box[3] - box[1]} for name, box in PARTS.items()},
    "width": atlas.width, "height": atlas.height, "frames": frames,
},ensure_ascii=False,indent=2)+"\n")

# A reviewable catalog is generated from the same sprites used in the application.
preview_columns = 4
preview_rows = (len(KINDS) + preview_columns - 1) // preview_columns
preview=Image.new("RGB",(1200,74 + preview_rows * 294),"#263b2c");d=ImageDraw.Draw(preview)
font_path=next((p for p in ["/System/Library/Fonts/PingFang.ttc","/System/Library/Fonts/STHeiti Light.ttc","/System/Library/Fonts/Supplemental/Arial Unicode.ttf"] if Path(p).exists()),None)
font=ImageFont.truetype(font_path,17) if font_path else ImageFont.load_default()
small=ImageFont.truetype(font_path,11) if font_path else ImageFont.load_default()
d.text((28,22),f"婚礼小镇 · 建筑图鉴   /   {len(KINDS)} 类建筑 · {len(KINDS) * 3} 个外观",font=font,fill="#e9ddbb")
for index,(kind,label) in enumerate(KINDS):
    x=24+(index%4)*294;y=74+(index//4)*294
    d.rounded_rectangle((x,y,x+280,y+278),radius=6,fill="#304735",outline="#566449")
    preview.paste(build(kind,0).resize((176,194),Image.Resampling.NEAREST),(x+50,y+10),build(kind,0).resize((176,194),Image.Resampling.NEAREST))
    for variant in [1,2]:
        sprite=build(kind,variant).resize((54,59),Image.Resampling.NEAREST)
        preview.paste(sprite,(x+variant*64+31,y+211),sprite)
    d.text((x+14,y+201),label,font=font,fill="#e1d4af")
    d.text((x+14,y+231),kind,font=small,fill="#a9b294")
preview_path=ROOT / "docs/design-references/ai-town/building-catalog.png"
preview_path.parent.mkdir(parents=True,exist_ok=True)
preview.save(preview_path)

# Original art and extensions shown together, without altering task status in the live project.
comparison = Image.new("RGB", (1200, 696), "#263b2c")
cd = ImageDraw.Draw(comparison)
heading = ImageFont.truetype(font_path, 23) if font_path else font
cd.text((28, 20), "保留原版建筑，用同一套素材扩展小镇", font=heading, fill="#f1dfb8")
cd.text((28, 58), "原版基准：金顶木屋、帐篷、市政风车", font=font, fill="#c4caa6")
terrain = Image.open(ROOT / "public/assets/ai-town/gentle-obj.png").convert("RGBA")
windmill = Image.open(ROOT / "public/assets/ai-town/windmill.png").convert("RGBA")
originals = [(build("cottage", 0), "原版木屋 · 保留原始屋顶与墙面"),
             (terrain.crop((992, 512, 1088, 608)), "原版帐篷 · 原图保留"),
             (windmill.crop((0, 0, 208, 208)), "市政风车 · 原图保留")]
for index, (sprite, label) in enumerate(originals):
    x = 28 + index * 392
    sprite.thumbnail((186, 192), Image.Resampling.NEAREST)
    comparison.paste(sprite, (x + (360 - sprite.width) // 2, 86 + 192 - sprite.height), sprite)
    cd.text((x + 30, 290), label, font=font, fill="#e9ddbb")
cd.line((28, 331, 1172, 331), fill="#526243")
cd.text((28, 350), "同源扩展：统一原版屋顶、木墙、石墙与拱门", font=font, fill="#c4caa6")
for index, kind in enumerate(["grandhotel", "dragoninn", "lodge", "watchtower", "wall"]):
    sprite = build(kind, 0).resize((176, 194), Image.Resampling.NEAREST)
    x = 28 + index * 234
    comparison.paste(sprite, (x + 14, 405), sprite)
    cd.text((x + 14, 618), dict(KINDS)[kind], font=font, fill="#e9ddbb")
comparison.save(preview_path.with_name("original-style-buildings.png"))
print(f"Generated {len(KINDS)*3} building sprites and {preview_path}")

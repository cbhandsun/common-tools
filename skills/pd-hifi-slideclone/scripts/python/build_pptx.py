import argparse
import json
import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Pt


EMU_PER_PT = 12700


def emu(value):
    return int(round(float(value) * EMU_PER_PT))


def rgb(value, default="000000"):
    if not value:
        value = default
    value = value.strip().lstrip("#")
    if len(value) != 6:
        value = default
    return RGBColor(int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def abs_path(base, value):
    if not value:
        return None
    return value if os.path.isabs(value) else os.path.abspath(os.path.join(base, value))


def add_textbox(slide, item):
    box = item["box"]
    shape = slide.shapes.add_textbox(emu(box["x"]), emu(box["y"]), emu(box["w"]), emu(box["h"]))
    tf = shape.text_frame
    tf.clear()
    tf.margin_left = emu((item.get("style") or {}).get("marginLeftPt", 0))
    tf.margin_right = emu((item.get("style") or {}).get("marginRightPt", 0))
    tf.margin_top = emu((item.get("style") or {}).get("marginTopPt", 0))
    tf.margin_bottom = emu((item.get("style") or {}).get("marginBottomPt", 0))
    if (item.get("font") or {}).get("valign") == "middle":
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    paragraph = tf.paragraphs[0]
    align = (item.get("font") or {}).get("align")
    if align == "center":
        paragraph.alignment = PP_ALIGN.CENTER
    elif align == "right":
        paragraph.alignment = PP_ALIGN.RIGHT
    run = paragraph.add_run()
    run.text = item.get("text", "")
    font = item.get("font") or {}
    run.font.size = Pt(font.get("sizePt", 14))
    run.font.bold = str(font.get("weight", "")).lower() == "bold"
    run.font.color.rgb = rgb(font.get("color"), "111111")
    if font.get("family"):
        run.font.name = font.get("family")
        set_run_typeface(run, font.get("family"))
    return shape


def set_run_typeface(run, family):
    r_pr = run._r.get_or_add_rPr()
    for child in list(r_pr):
        if child.tag.endswith("}latin") or child.tag.endswith("}ea") or child.tag.endswith("}cs"):
            r_pr.remove(child)
    for tag in ("a:latin", "a:ea", "a:cs"):
        node = OxmlElement(tag)
        node.set("typeface", family)
        r_pr.append(node)


def shape_type(kind):
    kind = (kind or "rect").lower()
    if kind in ("ellipse", "oval", "circle"):
        return MSO_SHAPE.OVAL
    if kind in ("roundrect", "rounded-rect", "roundedrectangle"):
        return MSO_SHAPE.ROUNDED_RECTANGLE
    if kind == "triangle":
        return MSO_SHAPE.ISOSCELES_TRIANGLE
    if kind in ("right-triangle", "righttriangle"):
        return MSO_SHAPE.RIGHT_TRIANGLE
    if kind == "diamond":
        return MSO_SHAPE.DIAMOND
    if kind == "line":
        return None
    return MSO_SHAPE.RECTANGLE


def add_shape(slide, item):
    box = item["box"]
    style = item.get("style") or {}
    if (item.get("type") or "").lower() == "line":
        connector_type = connector_type_for(style.get("connectorType"))
        shape = slide.shapes.add_connector(connector_type, emu(box["x"]), emu(box["y"]), emu(box["x"] + box["w"]), emu(box["y"] + box["h"]))
    else:
        shape = slide.shapes.add_shape(shape_type(item.get("type")), emu(box["x"]), emu(box["y"]), emu(box["w"]), emu(box["h"]))
        if (item.get("type") or "").lower() in ("roundrect", "rounded-rect", "roundedrectangle") and style.get("radiusRatio") is not None:
            try:
                shape.adjustments[0] = float(style.get("radiusRatio"))
            except Exception:
                pass
        if style.get("rotation") is not None:
            shape.rotation = float(style.get("rotation"))
        fill = style.get("fill")
        if fill:
            shape.fill.solid()
            shape.fill.fore_color.rgb = rgb(fill, "FFFFFF")
        else:
            shape.fill.background()
    stroke = style.get("stroke")
    if stroke and stroke != "none":
        shape.line.color.rgb = rgb(stroke, "000000")
    elif stroke == "none":
        shape.line.fill.background()
    if style.get("strokeWidthPt") is not None:
        shape.line.width = Pt(style.get("strokeWidthPt"))
    if style.get("endArrow"):
        add_line_end(shape, style.get("endArrow"), "tailEnd")
    if style.get("startArrow"):
        add_line_end(shape, style.get("startArrow"), "headEnd")
    if style.get("shadow"):
        add_outer_shadow(shape, style.get("shadow"))
    return shape


def add_outer_shadow(shape, shadow):
    sp_pr = shape.element.spPr
    for child in list(sp_pr):
        if child.tag.endswith("}effectLst"):
            sp_pr.remove(child)
    effect_lst = OxmlElement("a:effectLst")
    outer = OxmlElement("a:outerShdw")
    outer.set("blurRad", str(emu(shadow.get("blurPt", 4))))
    outer.set("dist", str(emu(shadow.get("distancePt", 1.5))))
    outer.set("dir", str(int(float(shadow.get("angleDeg", 45)) * 60000)))
    outer.set("algn", "ctr")
    outer.set("rotWithShape", "0")
    color = OxmlElement("a:srgbClr")
    color_value = (shadow.get("color") or "#000000").strip().lstrip("#")
    if len(color_value) != 6:
        color_value = "000000"
    color.set("val", color_value)
    alpha = OxmlElement("a:alpha")
    alpha_value = max(0, min(1, float(shadow.get("alpha", 0.18))))
    alpha.set("val", str(int(alpha_value * 100000)))
    color.append(alpha)
    outer.append(color)
    effect_lst.append(outer)
    sp_pr.append(effect_lst)


def connector_type_for(value):
    value = (value or "straight").lower()
    if value == "elbow":
        return MSO_CONNECTOR.ELBOW
    if value == "curve":
        return MSO_CONNECTOR.CURVE
    return MSO_CONNECTOR.STRAIGHT


def add_line_end(shape, arrow_type, tag_name):
    sp_pr = shape.element.spPr
    ln = sp_pr.ln
    if ln is None:
        ln = OxmlElement("a:ln")
        sp_pr.append(ln)
    for child in list(ln):
        if child.tag.endswith("}" + tag_name):
            ln.remove(child)
    end = OxmlElement(f"a:{tag_name}")
    end.set("type", arrow_type if isinstance(arrow_type, str) else "triangle")
    ln.append(end)


def add_picture(slide, item, base):
    if item.get("type") == "source-reference" and (item.get("style") or {}).get("opacity", 1) < 0.99:
        return None
    source = item.get("source") or {}
    asset = item.get("assetPath") or (item.get("style") or {}).get("assetPath") or source.get("pageImage")
    asset = abs_path(base, asset)
    if not asset or not os.path.exists(asset):
        return None
    box = item["box"]
    return slide.shapes.add_picture(asset, emu(box["x"]), emu(box["y"]), emu(box["w"]), emu(box["h"]))


def add_table(slide, item):
    rows = item.get("rows") or []
    if not rows:
        return None
    col_count = max(len(row) for row in rows)
    box = item["box"]
    shape = slide.shapes.add_table(len(rows), col_count, emu(box["x"]), emu(box["y"]), emu(box["w"]), emu(box["h"]))
    table = shape.table
    for row_index, row in enumerate(rows):
        for col_index in range(col_count):
            table.cell(row_index, col_index).text = row[col_index] if col_index < len(row) else ""
    return shape


def build(ir_file, out_file):
    with open(ir_file, "r", encoding="utf-8") as handle:
        deck = json.load(handle)
    base = os.path.dirname(os.path.abspath(ir_file))

    prs = Presentation()
    prs.slide_width = emu(deck["slideSize"]["widthPt"])
    prs.slide_height = emu(deck["slideSize"]["heightPt"])
    blank_layout = prs.slide_layouts[6]

    for page in sorted(deck.get("pages", []), key=lambda item: item.get("pageIndex", 0)):
        slide = prs.slides.add_slide(blank_layout)
        background = page.get("background") or {}
        if background.get("fill"):
            shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
            shape.fill.solid()
            shape.fill.fore_color.rgb = rgb(background.get("fill"), "FFFFFF")
            shape.line.fill.background()
        for item in page.get("shapes", []):
            add_shape(slide, item)
        for item in page.get("images", []):
            add_picture(slide, item, base)
        for item in page.get("tables", []):
            add_table(slide, item)
        for item in page.get("textBoxes", []):
            add_textbox(slide, item)

    os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)
    prs.save(out_file)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ir", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    build(args.ir, args.out)


if __name__ == "__main__":
    main()

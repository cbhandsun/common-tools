"""Bounded OOXML decoding for the disposable LibreOffice rendering copy."""
from collections import Counter
from dataclasses import dataclass
import math
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'p': P, 'a': A}
SUPPORTED = {'line', 'bentConnector3', 'bentConnector4', 'bentConnector5'}


@dataclass(frozen=True)
class Track:
    page: int
    name: str
    points: tuple[tuple[int, int], ...]


def integer(value: str | None) -> int:
    if not isinstance(value, str) or not re.fullmatch(r'-?\d{1,12}', value):
        raise ValueError('invalid-coordinate')
    return int(value)


def xml(archive: ZipFile, name: str) -> ET.Element:
    entry = archive.getinfo(name)
    if entry.file_size > 4 * 1024 * 1024:
        raise ValueError('xml-budget')
    data = archive.read(entry)
    if b'<!' in data or b'\x00' in data:
        raise ValueError('unsupported-xml')
    return ET.fromstring(data)


def page_names(archive: ZipFile) -> list[str]:
    presentation = xml(archive, 'ppt/presentation.xml')
    relationships = xml(archive, 'ppt/_rels/presentation.xml.rels')
    targets = {}
    for relation in relationships:
        if relation.tag != '{' + REL + '}Relationship':
            raise ValueError('invalid-relationship')
        identity = relation.get('Id')
        if not identity or identity in targets:
            raise ValueError('ambiguous-relationship')
        targets[identity] = relation
    result = []
    for slide in presentation.findall('p:sldIdLst/p:sldId', NS):
        relation = targets.get(slide.get('{' + R + '}id'))
        if relation is None or relation.get('TargetMode', 'Internal') != 'Internal':
            raise ValueError('invalid-slide-target')
        target = relation.get('Target', '')
        target = posixpath.normpath('ppt/' + target) if not target.startswith('/') else target[1:]
        if not re.fullmatch(r'ppt/slides/slide[1-9]\d{0,4}\.xml', target) or target in result:
            raise ValueError('invalid-slide-target')
        result.append(target)
    if not result or len(result) > 1000:
        raise ValueError('page-budget')
    return result


def transform(point: tuple[float, float], frame: ET.Element | None, group: bool = False) -> tuple[float, float]:
    if frame is None:
        return point
    offset, extent = frame.find('a:off', NS), frame.find('a:ext', NS)
    if offset is None and extent is None and group:
        return point
    if offset is None or extent is None:
        raise ValueError('incomplete-transform')
    x, y, w, h = (integer(element.get(key)) for element, key in
                   ((offset, 'x'), (offset, 'y'), (extent, 'cx'), (extent, 'cy')))
    if w < 0 or h < 0:
        raise ValueError('invalid-extent')
    px, py = point
    if group:
        child_offset, child_extent = frame.find('a:chOff', NS), frame.find('a:chExt', NS)
        if child_offset is None or child_extent is None:
            raise ValueError('incomplete-group-transform')
        cw, ch = integer(child_extent.get('cx')), integer(child_extent.get('cy'))
        if cw <= 0 or ch <= 0:
            raise ValueError('invalid-group-extent')
        px = x + (px - integer(child_offset.get('x'))) * w / cw
        py = y + (py - integer(child_offset.get('y'))) * h / ch
    else:
        px, py = px + x, py + y
    cx, cy = x + w / 2, y + h / 2
    dx, dy = px - cx, py - cy
    for key in ('flipH', 'flipV'):
        if frame.get(key, '0') not in ('0', '1', 'false', 'true'):
            raise ValueError('invalid-flip')
    dx *= -1 if frame.get('flipH') in ('1', 'true') else 1
    dy *= -1 if frame.get('flipV') in ('1', 'true') else 1
    radians = math.radians(integer(frame.get('rot', '0')) / 60000)
    return cx + dx * math.cos(radians) - dy * math.sin(radians), cy + dx * math.sin(radians) + dy * math.cos(radians)


def connector_points(connector: ET.Element, ancestors: list[ET.Element | None]) -> tuple[tuple[int, int], ...]:
    frame = connector.find('p:spPr/a:xfrm', NS)
    geometry = connector.find('p:spPr/a:prstGeom', NS)
    if frame is None or geometry is None:
        raise ValueError('missing-connector-geometry')
    extent = frame.find('a:ext', NS)
    if extent is None:
        raise ValueError('missing-connector-extent')
    w, h = integer(extent.get('cx')), integer(extent.get('cy'))
    adjustments = {}
    for guide in geometry.findall('a:avLst/a:gd', NS):
        name, formula = guide.get('name'), guide.get('fmla', '')
        if name not in ('adj1', 'adj2', 'adj3') or name in adjustments or not formula.startswith('val '):
            raise ValueError('unsupported-adjustment')
        adjustments[name] = integer(formula[4:]) / 100000
    a1, a2, a3 = (adjustments.get('adj' + str(i), .5) for i in (1, 2, 3))
    preset = geometry.get('prst')
    if preset == 'line':
        points = [(0, 0), (w, h)]
    elif preset == 'bentConnector3':
        points = [(0, 0), (a1 * w, 0), (a1 * w, h), (w, h)]
    elif preset == 'bentConnector4':
        points = [(0, 0), (a1 * w, 0), (a1 * w, a2 * h), (w, a2 * h), (w, h)]
    elif preset == 'bentConnector5':
        points = [(0, 0), (a1 * w, 0), (a1 * w, a2 * h), (a3 * w, a2 * h), (a3 * w, h), (w, h)]
    else:
        raise ValueError('unsupported-preset')
    result = []
    for point in points:
        point = transform(point, frame)
        for ancestor in reversed(ancestors):
            point = transform(point, ancestor, group=True)
        if any(not math.isfinite(v) or abs(v / 12700) > 1_000_000 for v in point):
            raise ValueError('coordinate-budget')
        # One UNO unit is 1/100 mm, or 360 EMU. Keep authored vertex order.
        result.append(tuple(round(value / 360) for value in point))
    if len(set(result)) < 2:
        raise ValueError('degenerate-connector')
    return tuple(result)


def read_plan(source: Path) -> tuple[list[Track], int]:
    if not source.is_file() or source.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('package-budget')
    tracks, skipped = [], 0
    with ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > 10000 or sum(e.file_size for e in entries) > 128 * 1024 * 1024:
            raise ValueError('archive-budget')
        if len({e.filename for e in entries}) != len(entries):
            raise ValueError('duplicate-archive-entry')
        for page, name in enumerate(page_names(archive)):
            tree = xml(archive, name)
            if sum(1 for _ in tree.iter()) > 100000:
                raise ValueError('drawing-budget')
            names = Counter(e.get('name') for e in tree.iter('{' + P + '}cNvPr'))
            stack = [(tree.find('p:cSld/p:spTree', NS), [])]
            while stack:
                container, ancestors = stack.pop()
                if container is None or len(ancestors) > 32:
                    raise ValueError('group-budget')
                for element in container:
                    if element.tag == '{' + P + '}grpSp':
                        stack.append((element, ancestors + [element.find('p:grpSpPr/a:xfrm', NS)]))
                    elif element.tag == '{' + P + '}cxnSp':
                        geometry = element.find('p:spPr/a:prstGeom', NS)
                        if geometry is None or geometry.get('prst') not in SUPPORTED:
                            skipped += 1
                            continue
                        identity = element.find('p:nvCxnSpPr/p:cNvPr', NS)
                        value = identity.get('name', '') if identity is not None else ''
                        if not value or len(value) > 1024 or names[value] != 1:
                            raise ValueError('ambiguous-connector-name')
                        if (element.find('p:nvCxnSpPr/p:cNvCxnSpPr/a:stCxn', NS) is not None
                                or element.find('p:nvCxnSpPr/p:cNvCxnSpPr/a:endCxn', NS) is not None):
                            raise ValueError('render-copy-still-bound')
                        tracks.append(Track(page, value, connector_points(element, ancestors)))
                        if len(tracks) > 10000:
                            raise ValueError('track-budget')
    return tracks, skipped

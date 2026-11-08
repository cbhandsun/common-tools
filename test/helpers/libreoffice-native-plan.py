"""Pure parser and lifecycle regressions; UNO is not imported by these tests."""
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
import xml.etree.ElementTree as ET
from zipfile import ZipFile

sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve()))
import libreoffice_native_plan as plan
import libreoffice_native_render as renderer

HEADER = f'<p:sld xmlns:p="{plan.P}" xmlns:a="{plan.A}"><p:cSld><p:spTree>'
FOOTER = '</p:spTree></p:cSld></p:sld>'
FRAME = '<a:xfrm><a:off x="3600" y="7200"/><a:ext cx="36000" cy="72000"/></a:xfrm>'


def connector(name='route', preset='bentConnector5', frame=FRAME):
    return (f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="3" name="{name}"/><p:cNvCxnSpPr/></p:nvCxnSpPr><p:spPr>'
            f'{frame}<a:prstGeom prst="{preset}"><a:avLst><a:gd name="adj1" fmla="val 25000"/>'
            '<a:gd name="adj2" fmla="val 50000"/><a:gd name="adj3" fmla="val 75000"/>'
            '</a:avLst></a:prstGeom></p:spPr></p:cxnSp>')


class NativePlanTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='slideclone-lo-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def package(self, slides, order=None):
        source = self.root / 'input.pptx'
        order = order if order is not None else list(range(1, len(slides) + 1))
        with ZipFile(source, 'w') as z:
            z.writestr('ppt/presentation.xml', f'<p:presentation xmlns:p="{plan.P}" xmlns:r="{plan.R}"><p:sldIdLst>' +
                       ''.join(f'<p:sldId id="{i}" r:id="r{i}"/>' for i in order) + '</p:sldIdLst></p:presentation>')
            z.writestr('ppt/_rels/presentation.xml.rels', f'<Relationships xmlns="{plan.REL}">' +
                       ''.join(f'<Relationship Id="r{i}" Target="slides/slide{i}.xml"/>' for i in range(1, len(slides) + 1)) + '</Relationships>')
            for index, slide in enumerate(slides):
                z.writestr(f'ppt/slides/slide{index + 1}.xml', slide)
        return source

    def test_five_leg_geometry(self):
        tracks, skipped = plan.read_plan(self.package([HEADER + connector() + FOOTER]))
        self.assertEqual(skipped, 0)
        self.assertEqual(tracks[0].points, ((10, 20), (35, 20), (35, 120), (85, 120), (85, 220), (110, 220)))

    def test_other_supported_presets(self):
        for preset, count in [('line', 2), ('bentConnector3', 4), ('bentConnector4', 5)]:
            tracks, _ = plan.read_plan(self.package([HEADER + connector(preset=preset) + FOOTER]))
            self.assertEqual(len(tracks[0].points), count)

    def test_page_order_uses_manifest_not_filenames(self):
        tracks, _ = plan.read_plan(self.package([HEADER + connector('first') + FOOTER,
                                               HEADER + connector('second') + FOOTER], [2, 1]))
        self.assertEqual([(r.page, r.name) for r in tracks], [(0, 'second'), (1, 'first')])

    def test_flip_and_rotation(self):
        for attributes, first, last in [('flipH="1"', (110, 20), (10, 220)),
                                        ('rot="5400000"', (160, 70), (-40, 170)),
                                        ('flipH="true" flipV="true"', (110, 220), (10, 20))]:
            frame = FRAME.replace('<a:xfrm>', '<a:xfrm ' + attributes + '>')
            tracks, _ = plan.read_plan(self.package([HEADER + connector(frame=frame) + FOOTER]))
            self.assertEqual((tracks[0].points[0], tracks[0].points[-1]), (first, last))

    def test_scaled_nonidentity_group(self):
        group = ('<p:grpSp><p:grpSpPr><a:xfrm><a:off x="36000" y="72000"/>'
                 '<a:ext cx="72000" cy="144000"/><a:chOff x="3600" y="7200"/>'
                 '<a:chExt cx="36000" cy="72000"/></a:xfrm></p:grpSpPr>')
        tracks, _ = plan.read_plan(self.package([HEADER + group + connector() + '</p:grpSp>' + FOOTER]))
        self.assertEqual((tracks[0].points[0], tracks[0].points[-1]), ((100, 200), (300, 600)))

    def test_empty_page(self):
        self.assertEqual(plan.read_plan(self.package([HEADER + FOOTER])), ([], 0))

    def test_unknown_preset_is_reported(self):
        self.assertEqual(plan.read_plan(self.package([HEADER + connector(preset='curvedConnector5') + FOOTER])), ([], 1))

    def test_ambiguous_name(self):
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            plan.read_plan(self.package([HEADER + connector() + connector() + FOOTER]))

    def test_remaining_attachment_is_rejected(self):
        content = connector().replace('<p:cNvCxnSpPr/>', '<p:cNvCxnSpPr><a:stCxn id="2" idx="0"/></p:cNvCxnSpPr>')
        with self.assertRaisesRegex(ValueError, 'still-bound'):
            plan.read_plan(self.package([HEADER + content + FOOTER]))

    def test_entities_and_utf16_are_rejected(self):
        for slide in [b'<!DOCTYPE x [<!ENTITY e "attack">]><x>&e;</x>', (HEADER + FOOTER).encode('utf16')]:
            with self.assertRaisesRegex(ValueError, 'unsupported-xml'):
                plan.read_plan(self.package([slide]))

    def test_invalid_xml(self):
        with self.assertRaises(ET.ParseError):
            plan.read_plan(self.package(['<broken>']))

    def test_coordinate_extremes(self):
        for value in ['NaN', 'Infinity', '1e3', '9' * 30, '999999999999']:
            content = connector(frame=FRAME.replace('x="3600"', 'x="' + value + '"'))
            with self.assertRaises(ValueError):
                plan.read_plan(self.package([HEADER + content + FOOTER]))

    def test_formula_injection_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unsupported-adjustment'):
            plan.read_plan(self.package([HEADER + connector().replace('val 25000', '*/ w 1 0') + FOOTER]))

    def test_negative_extent(self):
        with self.assertRaisesRegex(ValueError, 'invalid-extent'):
            plan.read_plan(self.package([HEADER + connector(frame=FRAME.replace('cx="36000"', 'cx="-1"')) + FOOTER]))

    def test_xml_size_budget(self):
        with self.assertRaisesRegex(ValueError, 'xml-budget'):
            plan.read_plan(self.package([' ' * (4 * 1024 * 1024 + 1)]))

    def test_group_depth_budget(self):
        content = '<p:grpSp>' * 33 + connector() + '</p:grpSp>' * 33
        with self.assertRaisesRegex(ValueError, 'group-budget'):
            plan.read_plan(self.package([HEADER + content + FOOTER]))

    def test_zero_child_extent(self):
        frame = ET.fromstring('<a:xfrm xmlns:a="' + plan.A + '"><a:off x="0" y="0"/><a:ext cx="1" cy="1"/>'
                              '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="1"/></a:xfrm>')
        with self.assertRaisesRegex(ValueError, 'invalid-group-extent'):
            plan.transform((0, 0), frame, group=True)

    def test_paths_reject_traversal_and_stale_output(self):
        (self.root / 'input.pptx').write_bytes(b'controlled')
        (self.root / 'profile').mkdir()
        (self.root / 'out').mkdir()
        with self.assertRaisesRegex(ValueError, 'invalid-render-input'):
            renderer.paths(str(self.root), '../input.pptx')
        renderer.paths(str(self.root), 'input.pptx')
        (self.root / 'out' / 'input.pdf').write_bytes(b'stale')
        with self.assertRaisesRegex(ValueError, 'stale'):
            renderer.paths(str(self.root), 'input.pptx')

    def test_shutdown_disposal_requires_clean_exit(self):
        class Disposed(Exception):
            pass
        document, desktop, process = Mock(), Mock(), Mock()
        document.close.side_effect = Disposed()
        process.wait.return_value = 0
        self.assertEqual(renderer.shutdown(document, desktop, process, Disposed), 'bridge-disposed-clean-exit')
        desktop.terminate.assert_not_called()
        process.wait.return_value = 1
        with self.assertRaisesRegex(RuntimeError, 'shutdown-failed'):
            renderer.shutdown(document, desktop, process, Disposed)

    def test_shutdown_does_not_swallow_arbitrary_failure(self):
        document, desktop, process = Mock(), Mock(), Mock()
        document.close.side_effect = RuntimeError('controlled')
        process.wait.return_value = 0
        with self.assertRaisesRegex(RuntimeError, 'shutdown-failed'):
            renderer.shutdown(document, desktop, process, LookupError)

    def test_shutdown_timeout_propagates(self):
        process = Mock()
        process.wait.side_effect = subprocess.TimeoutExpired('controlled', 10)
        with self.assertRaisesRegex(RuntimeError, 'shutdown-timeout'):
            renderer.shutdown(None, None, process, LookupError)

    def fake_import(self, mode='success'):
        source = self.package([HEADER + connector() + FOOTER])
        (self.root / 'profile').mkdir()
        (self.root / 'out').mkdir()
        expected = plan.read_plan(source)[0][0]
        point = lambda x=0, y=0: types.SimpleNamespace(X=x, Y=y)
        shape = Mock()
        shape.Name = 'route'
        shape.StartShape, shape.EndShape = None, None
        shape.supportsService.side_effect = lambda service: service.endswith('ConnectorShape') and mode != 'ordinary-shape'
        collapsed = types.SimpleNamespace(Coordinates=((point(10, 20), point(110, 20), point(110, 220)),))
        shape.PolyPolygonBezier = collapsed
        shape.setPropertyValue.side_effect = lambda name, curve: setattr(shape, name, curve)
        page = Mock()
        page.getCount.return_value = 0 if mode == 'missing' else 2 if mode == 'duplicate' else 1
        page.getByIndex.return_value = shape
        pages = Mock()
        pages.getCount.return_value = 1
        pages.getByIndex.return_value = page
        document = Mock()
        document.supportsService.return_value = True
        document.getDrawPages.return_value = pages
        def export(url, properties):
            if mode == 'rerouted-during-export':
                shape.PolyPolygonBezier = collapsed
            (self.root / 'out/input.pdf').write_bytes(b'%PDF-controlled')
        document.storeToURL.side_effect = export
        desktop = Mock()
        desktop.loadComponentFromURL.return_value = document
        context = Mock()
        context.ServiceManager.createInstanceWithContext.return_value = desktop
        resolver = Mock()
        resolver.resolve.return_value = context
        local = Mock()
        local.ServiceManager.createInstanceWithContext.return_value = resolver
        uno = types.ModuleType('uno')
        uno.getComponentContext = lambda: local
        uno.Enum = lambda _name, value: value
        uno.getTypeByName = lambda name: name
        uno.queryInterface = lambda _kind, value: value
        unohelper = types.ModuleType('unohelper')
        unohelper.Base = type('UnoBase', (), {})
        modules = {'uno': uno, 'unohelper': unohelper}
        class Disposed(Exception):
            pass
        for name, attributes in {
            'com.sun.star.awt': {'Point': point},
            'com.sun.star.beans': {'PropertyValue': types.SimpleNamespace},
            'com.sun.star.document.MacroExecMode': {'NEVER_EXECUTE': 0},
            'com.sun.star.document.UpdateDocMode': {'NO_UPDATE': 0},
            'com.sun.star.drawing': {'PolyPolygonBezierCoords': types.SimpleNamespace},
            'com.sun.star.lang': {'DisposedException': Disposed},
            'com.sun.star.task': {'XInteractionHandler': type('HandlerInterface', (), {})},
        }.items():
            module = types.ModuleType(name)
            module.__dict__.update(attributes)
            modules[name] = module
        process = Mock()
        process.wait.return_value = 0
        process.poll.return_value = None
        with patch.dict(sys.modules, modules), patch.object(renderer.subprocess, 'Popen', return_value=process) as launch:
            if mode == 'success':
                result = renderer.render(str(self.root), 'input.pptx', 'controlled-soffice')
                self.assertEqual(result['restoredTracks'], 1)
                self.assertEqual(result['shutdown'], 'clean-exit')
                actual = tuple((p.X, p.Y) for p in shape.PolyPolygonBezier.Coordinates[0])
                self.assertEqual(actual, expected.points)
                options = {p.Name: p.Value for p in desktop.loadComponentFromURL.call_args.args[3]}
                self.assertEqual(options['MacroExecutionMode'], 0)
                self.assertEqual(options['UpdateDocMode'], 0)
                self.assertTrue(options['ReadOnly'])
                self.assertTrue(options['Hidden'])
                abort = Mock()
                request = Mock()
                request.getContinuations.return_value = [abort]
                options['InteractionHandler'].handle(request)
                abort.select.assert_called_once()
                self.assertNotIn('shell', launch.call_args.kwargs)
                self.assertFalse(result['renderedPathsVerified'])
                self.assertFalse(result['officeEditingVerified'])
            else:
                with self.assertRaises(ValueError):
                    renderer.render(str(self.root), 'input.pptx', 'controlled-soffice')
            document.close.assert_called_once_with(True)
            desktop.terminate.assert_called_once()
            process.wait.assert_called_once_with(timeout=10)

    def test_import_restores_native_track_and_disables_active_document_behavior(self):
        self.fake_import()

    def test_export_reroute_is_rejected(self):
        self.fake_import('rerouted-during-export')

    def test_missing_imported_connector_is_rejected(self):
        self.fake_import('missing')

    def test_duplicate_imported_connector_is_rejected(self):
        self.fake_import('duplicate')

    def test_ordinary_shape_cannot_replace_native_connector(self):
        self.fake_import('ordinary-shape')


if __name__ == '__main__':
    unittest.main(verbosity=2)

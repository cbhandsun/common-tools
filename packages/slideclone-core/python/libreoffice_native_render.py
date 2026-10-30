"""Restore authored tracks on native UNO connectors in a disposable copy only.

The Node parent owns the timeout, cancellation, process tree and workspace.
No shell, macros, link updates or user interaction are permitted here.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

# -I excludes the working directory and environment paths. Both additions are
# trusted installed code, never paths taken from the presentation contents.
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(sys.executable).resolve().parent))
from libreoffice_native_plan import read_plan  # noqa: E402


def paths(workspace: str, input_name: str) -> tuple[Path, Path, Path]:
    root = Path(workspace).resolve(strict=True)
    if not root.is_dir() or not root.name.startswith('slideclone-lo-'):
        raise ValueError('invalid-workspace')
    if input_name.lower() != 'input.pptx':
        raise ValueError('invalid-render-input')
    source, output, profile = root / input_name, root / 'out' / 'input.pdf', root / 'profile'
    for path in (source, output.parent, profile):
        if not path.resolve(strict=True).is_relative_to(root) or path.is_symlink():
            raise ValueError('invalid-render-path')
    if output.exists():
        raise ValueError('stale-render-output')
    return source, output, profile


def shutdown(document, desktop, process, disposed_type) -> str:
    errors, disposed = [], False
    try:
        if document is not None:
            document.close(True)
    except disposed_type:
        disposed = True
    except Exception:
        errors.append('document-close')
    try:
        if desktop is not None and not disposed:
            desktop.terminate()
    except disposed_type:
        disposed = True
    except Exception:
        errors.append('desktop-terminate')
    try:
        code = process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        # Do not kill only the launcher and orphan soffice.bin. The Node parent
        # terminates this helper and its owned descendants on failed conversion.
        raise RuntimeError('office-shutdown-timeout') from None
    if errors or code != 0:
        raise RuntimeError('office-shutdown-failed')
    # A completed close can dispose the bridge before its RPC returns. Accept
    # that specific lifecycle exception only with confirmed clean process exit.
    return 'bridge-disposed-clean-exit' if disposed else 'clean-exit'


def render(workspace: str, input_name: str, executable: str) -> dict:
    source, output, profile = paths(workspace, input_name)
    tracks, skipped = read_plan(source)
    if not tracks:
        raise ValueError('empty-track-plan')
    if not executable or len(executable) > 32768 or any(ord(c) < 32 for c in executable):
        raise ValueError('invalid-office-executable')
    import uno
    import unohelper
    from com.sun.star.awt import Point
    from com.sun.star.beans import PropertyValue
    from com.sun.star.document.MacroExecMode import NEVER_EXECUTE
    from com.sun.star.document.UpdateDocMode import NO_UPDATE
    from com.sun.star.drawing import PolyPolygonBezierCoords
    from com.sun.star.lang import DisposedException
    from com.sun.star.task import XInteractionHandler

    class AbortInteraction(unohelper.Base, XInteractionHandler):
        def handle(self, request):
            for continuation in request.getContinuations():
                abort = uno.queryInterface(uno.getTypeByName('com.sun.star.task.XInteractionAbort'), continuation)
                if abort is not None:
                    abort.select()
                    return

    def prop(name, value):
        result = PropertyValue()
        result.Name, result.Value = name, value
        return result

    def shapes(container):
        pending, count = [(container, 0)], 0
        while pending:
            parent, depth = pending.pop()
            if depth > 32:
                raise ValueError('imported-group-budget')
            for index in range(parent.getCount()):
                count += 1
                if count > 100000:
                    raise ValueError('imported-drawing-budget')
                shape = parent.getByIndex(index)
                yield shape
                if shape.supportsService('com.sun.star.drawing.GroupShape'):
                    pending.append((shape, depth + 1))

    def vertices(shape):
        return tuple(tuple((p.X, p.Y) for p in part) for part in shape.PolyPolygonBezier.Coordinates)

    def check(shape, track):
        if not shape.supportsService('com.sun.star.drawing.ConnectorShape'):
            raise ValueError('imported-shape-not-connector')
        if shape.StartShape is not None or shape.EndShape is not None:
            raise ValueError('imported-track-still-bound')
        if vertices(shape) != (track.points,):
            raise ValueError('imported-track-changed')

    name = 'slideclone_' + uuid.uuid4().hex
    process = subprocess.Popen([
        executable, '--headless', '--nologo', '--nodefault', '--norestore', '--nolockcheck',
        '-env:UserInstallation=' + profile.as_uri(),
        '--accept=pipe,name=' + name + ';urp;StarOffice.ComponentContext',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    document, desktop, result, failure = None, None, None, None
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for attempt in range(80):
            try:
                context = resolver.resolve('uno:pipe,name=' + name + ';urp;StarOffice.ComponentContext')
                break
            except Exception:
                if attempt == 79 or process.poll() is not None:
                    raise RuntimeError('office-connection-unavailable') from None
                time.sleep(.25)
        desktop = context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
        document = desktop.loadComponentFromURL(source.as_uri(), '_blank', 0, (
            prop('Hidden', True), prop('ReadOnly', True), prop('MacroExecutionMode', NEVER_EXECUTE),
            prop('UpdateDocMode', NO_UPDATE), prop('InteractionHandler', AbortInteraction())))
        if document is None or not document.supportsService('com.sun.star.presentation.PresentationDocument'):
            raise ValueError('invalid-imported-document')
        pages, matched, matched_keys = document.getDrawPages(), [], set()
        wanted = {(track.page, track.name): track for track in tracks}
        for index in range(pages.getCount()):
            for shape in shapes(pages.getByIndex(index)):
                track = wanted.get((index, shape.Name))
                if track is None:
                    continue
                key = (track.page, track.name)
                if key in matched_keys:
                    raise ValueError('ambiguous-imported-track')
                if not shape.supportsService('com.sun.star.drawing.ConnectorShape'):
                    raise ValueError('imported-shape-not-connector')
                curve = PolyPolygonBezierCoords()
                curve.Coordinates = (tuple(Point(x, y) for x, y in track.points),)
                curve.Flags = (tuple(uno.Enum('com.sun.star.drawing.PolygonFlags', 'NORMAL') for _ in track.points),)
                shape.setPropertyValue('PolyPolygonBezier', curve)
                check(shape, track)
                matched.append((shape, track))
                matched_keys.add(key)
        if len(matched) != len(tracks):
            raise ValueError('incomplete-imported-track-mapping')
        for shape, track in matched:
            check(shape, track)
        document.storeToURL(output.as_uri(), (prop('FilterName', 'impress_pdf_Export'), prop('Overwrite', False)))
        for shape, track in matched:
            check(shape, track)
        if not output.is_file() or output.stat().st_size < 5:
            raise ValueError('invalid-exported-pdf')
        with output.open('rb') as stream:
            if stream.read(5) != b'%PDF-':
                raise ValueError('invalid-exported-pdf')
        result = {'version': 1, 'restoredTracks': len(tracks), 'skippedNativeConnectors': skipped,
                  'nativeShapeTypesRetained': True, 'importedTracksVerified': True,
                  'renderedPathsVerified': False, 'officeEditingVerified': False}
    except Exception as error:
        failure = error
        raise
    finally:
        try:
            closed = shutdown(document, desktop, process, DisposedException)
        except Exception as cleanup_error:
            # On cleanup failure stay alive so the Node timeout still owns the
            # entire descendant tree. No launcher-only kill or successful exit.
            if process.poll() is None:
                sys.stderr.write(json.dumps({'code': 'office-cleanup-awaiting-parent'}) + '\n')
                sys.stderr.flush()
                while True:
                    time.sleep(1)
            if failure is not None:
                raise ExceptionGroup('native-render-and-cleanup-failed', [failure, cleanup_error]) from None
            raise
        else:
            if result is not None:
                result['shutdown'] = closed
    if result is None:
        raise RuntimeError('missing-render-result')
    return result


if __name__ == '__main__':
    try:
        if len(sys.argv) != 4:
            raise ValueError('invalid-arguments')
        report = render(*sys.argv[1:])
        sys.stdout.write(json.dumps(report) + '\n')
    except Exception as error:
        # Exceptions from Office can contain source paths or document content.
        # Emit only a bounded category, never exception text or a traceback.
        category = 'uno-unavailable' if isinstance(error, ModuleNotFoundError) else 'native-track-render-failed'
        sys.stderr.write(json.dumps({'code': category}) + '\n')
        sys.exit(1)

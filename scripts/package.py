#!/usr/bin/env python3
"""Create a source-only portfolio archive without credentials or dependencies."""
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

project = Path(__file__).resolve().parents[1]
output = project.parent / f'{project.name}.zip'
excluded_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'coverage',
                 'test-results', 'playwright-report', '.pytest_cache'}

def include(file):
    relative = file.relative_to(project)
    if file.is_symlink() or not file.is_file():
        return False
    if any(part in excluded_dirs for part in relative.parts):
        return False
    if file.name == '.env' or (file.name.startswith('.env.') and file.name != '.env.example'):
        return False
    if file.name == '.DS_Store' or file.suffix in {'.log', '.zip', '.pyc'} or file.name.endswith('.tar.gz'):
        return False
    return True

files = sorted(file for file in project.rglob('*') if include(file))
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, Path(project.name) / file.relative_to(project))
with ZipFile(output) as archive:
    assert archive.testzip() is None
checksum = sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{checksum}  {output.name}\n')
print(f'{output}\n{len(files)} files, {output.stat().st_size:,} bytes\nSHA-256 {checksum}')

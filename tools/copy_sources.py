"""Copy only publishable sources to an existing disposable checkout."""
from pathlib import Path
import shutil
import sys
from build_project import source_files

root, destination = (Path(value).resolve() for value in sys.argv[1:])
if destination == root or destination.is_relative_to(root):
    raise SystemExit("Destination must be outside the source project.")
for rel in source_files(root):
    target = destination / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / rel, target)

"""Package only the six public teaching files. No answers, receipts, or environments."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1] / "public/systems/tensor_lab"
with ZipFile(root / "tensor_lab.zip", "w", ZIP_DEFLATED) as archive:
    for name in ["README.md", "learner.py", "run.py", "test_lab.py", "cases.json", "requirements.txt"]:
        entry = ZipInfo(name, date_time=(2026, 10, 23, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, (root/name).read_bytes())

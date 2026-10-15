"""Write the API's OpenAPI document, the source the frontend's types are generated from (NFR-5.2).

python scripts/export_openapi.py            # -> backend/openapi.json
cd ../frontend && npm run gen:types         # -> src/lib/api-types.ts
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def main() -> None:
    # The document doesn't depend on the database, but building the app needs a URL.
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{Path(tempfile.mkdtemp()) / 'openapi.db'}")
    from app.main import create_app

    spec = create_app().openapi()
    out = BACKEND / "openapi.json"
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    paths = [(m.upper(), p) for p, ops in spec["paths"].items() for m in ops]
    print(f"Wrote {out} ({len(paths)} operations)")


if __name__ == "__main__":
    main()

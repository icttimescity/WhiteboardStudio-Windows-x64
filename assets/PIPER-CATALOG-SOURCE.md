# Piper voice catalog snapshot

Retrieved 2026-10-19 from the public upstream index:
https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json

177 official model entries; 53 distinct language.family values / 58 locales in this snapshot. Upstream README metadata may list an older language count. The application also retains Quang Huy / Ngọc Lan aliases for the shared community Vietnamese model (179 selectable entries, 178 unique downloadable models total).

The catalog contains file sizes and MD5 checksums. Downloaded model/config files are checked against those values before atomic replacement. Model cards are downloaded alongside models when available; each voice has a direct link to its source and license information. Dataset metadata does not imply one identical license for every voice.

The Catalog Update action validates upstream data, merges previous models to preserve old projects, and stores data/piper-catalog.json. Node and Python read the same cached index. No voice model binaries are distributed in this source ZIP.

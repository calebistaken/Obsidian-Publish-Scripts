import os
from pathlib import Path  # ✅ Fix: Import Path

# Absolute path of this script
script_path = Path(__file__).resolve()
script_dir = script_path.parent

# Path to JavaScript source files
js_source_dir = script_dir / "JavaScript"

# Vault root is two levels above this script
vault_root = script_path.parents[2]

# Output path for the combined publish.js
output_path = vault_root / "publish.js"

# Gather all .js files in sorted order
js_files = sorted([
    f for f in os.listdir(js_source_dir)
    if f.endswith(".js") and (js_source_dir / f).is_file()
])

# Combine files with IIFE isolation
with open(output_path, "w", encoding="utf-8") as outfile:
    for js_file in js_files:
        file_path = js_source_dir / js_file
        with open(file_path, "r", encoding="utf-8") as infile:
            code = infile.read()
            outfile.write(f"\n/* --- Begin {js_file} --- */\n")
            outfile.write(f"(function() {{\n{code}\n}})();\n")
            outfile.write(f"/* --- End {js_file} --- */\n")

print(f"✅ Combined {len(js_files)} JavaScript files into: {output_path}")

print("Writable?", os.access(vault_root, os.W_OK))

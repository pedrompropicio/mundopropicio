"""Task86 finite Deno harness; no Cloud, env permissions, tests requiring browser, or build restart.
Run from project root: python3 docs/testes/issue333/analysis86/run-local.py
"""
from pathlib import Path
import os, subprocess, tempfile

out = Path(tempfile.mkdtemp(prefix="issue333-analysis86-"))
env = {"PATH": os.environ.get("PATH", "/bin:/usr/bin"), "HOME": os.environ.get("HOME", "/root"), "NO_COLOR": "1"}
base = ["--no-config", "--no-lock", "--node-modules-dir=manual", "--no-remote"]
commands = [
    ["deno", "check", *base, "supabase/functions/_shared/issue333-ai/provider.ts", "supabase/functions/data-entry/analysis-stream.ts", "supabase/functions/data-entry/analysis-service.ts", "supabase/functions/data-entry/index.ts"],
    # SDK transitively imports @vercel/oidc, which reads hostname at module initialization.
    # Narrow sys permission only; no --allow-env, --allow-net, or --allow-read.
    ["deno", "test", *base, "--cached-only", "--allow-sys=hostname", "docs/testes/issue333/analysis86/runtime.test.ts"],
    ["deno", "bundle", *base, "--platform", "deno", "supabase/functions/data-entry/index.ts", "-o", str(out / "entry.bundle.js")],
]
for i, command in enumerate(commands):
    result = subprocess.run(command, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    text = "COMMAND: " + " ".join(command) + "\n" + result.stdout + "\nEXIT: " + str(result.returncode) + "\n"
    (out / f"{i+1}.log").write_text(text)
    print(text, end="")
    if result.returncode: raise SystemExit(result.returncode)
print("Evidence:", out)
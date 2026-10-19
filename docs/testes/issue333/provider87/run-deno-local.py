"""Task87 finite offline runtime/check/bundle; no Cloud or secret values."""
from pathlib import Path
import os, subprocess, tempfile

out = Path(tempfile.mkdtemp(prefix="issue333-provider87-deno-"))
env = {"PATH": os.environ.get("PATH", "/bin:/usr/bin"), "HOME": os.environ.get("HOME", "/root"), "NO_COLOR": "1"}
base = ["--no-config", "--no-lock", "--node-modules-dir=manual", "--no-remote"]
commands = [
    ["deno", "check", *base, "supabase/functions/_shared/issue333-ai/control.ts", "supabase/functions/_shared/issue333-ai/provider.ts", "supabase/functions/data-entry/analysis-service.ts", "supabase/functions/data-entry/analysis-stream.ts", "supabase/functions/data-entry/index.ts"],
    ["deno", "test", *base, "--cached-only", "--allow-sys=hostname", "--allow-env=OPENAI_BASE_URL", "docs/testes/issue333/provider87/runtime.test.ts", "docs/testes/issue333/analysis86/runtime.test.ts"],
    ["deno", "bundle", *base, "--platform", "deno", "supabase/functions/data-entry/index.ts", "-o", str(out / "entry.bundle.js")],
]
for i, command in enumerate(commands):
    r = subprocess.run(command, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    text = "COMMAND: " + " ".join(command) + "\n" + r.stdout + "\nEXIT: " + str(r.returncode) + "\n"
    (out / f"{i+1}.log").write_text(text)
    print(text, end="")
    if r.returncode: raise SystemExit(r.returncode)
print("Evidence:", out)
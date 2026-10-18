"""Create one deterministic minimal fictitious PDF; no identity or Cloud effects."""
import hashlib, json, os, subprocess, sys
from pathlib import Path
from reportlab.pdfgen import canvas
out=Path(sys.argv[1]).resolve()
if not str(out).startswith('/tmp/'): raise SystemExit('/tmp only')
out.mkdir(parents=True,exist_ok=True)
pdf=out/'pilot8-fiction.pdf'
if pdf.exists(): raise SystemExit('Preserve existing bytes; never overwrite')
os.umask(0o077)
c=canvas.Canvas(str(pdf),pagesize=(420,180),invariant=1,pageCompression=1)
c.setTitle('FICTITIOUS PILOT8 - NOT A FISCAL INVOICE')
c.setFont('Helvetica',10)
c.drawString(24,144,'FICTITIOUS PILOT8 - NOT A FISCAL INVOICE')
c.drawString(24,120,'One document + metadata. EUR 0.00 / VAT 0.00.')
c.drawString(24,96,'Synthetic supplier NIF: PT000000000. No financial effect.')
c.save();os.chmod(pdf,0o600)
info=subprocess.check_output(['pdfinfo',str(pdf)],text=True)
(out/'pdfinfo.txt').write_text(info)
raw=pdf.read_bytes()
manifest={'sha256':hashlib.sha256(raw).hexdigest(),'size_bytes':len(raw),'mime':'application/pdf','mode':oct(pdf.stat().st_mode & 0o777),'pdfinfo_ok':True}
(out/'pdf-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest))
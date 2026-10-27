"""Static safety gates. These tests do not certify native G1 or SQL idempotency."""
import collections,hashlib,json,pathlib,unittest
from sql_scan import inventory
from check_pii import scan
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE=ROOT/'supabase/baseline'
H=lambda b:hashlib.sha256(b).hexdigest()
class BaselineTests(unittest.TestCase):
 def test_exact_approved_scope_and_provenance(self):
  manifest=json.loads((BASE/'live-only/manifest.json').read_text())
  self.assertEqual(manifest['authorization'],6449906971)
  self.assertEqual(manifest['confirmation'],6450286547)
  self.assertEqual(collections.Counter(o['stage'] for o in manifest['operations']),{'historical':39,'tail':165,'reconcile':25,'membership':8,'acl':70})
  self.assertEqual(len({o['file'] for o in manifest['operations']}),307)
  for o in manifest['operations']:
   self.assertTrue(o['file'].startswith('supabase/baseline/live-only/'))
   self.assertTrue(o['origin']['review']);self.assertTrue(o['origin']['window'])
   self.assertTrue(o['origin'].get('oid')or o['origin'].get('attnum')or o['origin'].get('live_absence'))
   self.assertTrue(any(k.startswith('live_') and (k.endswith('sha256') or k=='live_absence') for k in o['origin']))
   raw=(ROOT/o['file']).read_bytes();self.assertEqual(H(raw),o['file_sha256'])
   begin='-- BEGIN OPERATION '+o['id']+'\n';end='-- END OPERATION '+o['id']+'\n'
   text=raw.decode();self.assertEqual(text.count(begin),1);self.assertEqual(text.count(end),1)
   self.assertEqual(H(text.split(begin)[1].split(end)[0].encode()),o['body_sha256'])
 def test_no_top_level_data_or_execution_statements(self):
  for path in (BASE/'live-only').glob('*.sql'):
   for statement in inventory(path.read_text()):
    self.assertIn(statement['kind'],{'CREATE','ALTER','DROP','DO','GRANT','REVOKE','SET','RESET'},str(path))
 def test_scanner_zero_and_bound_allowances(self):
  result=scan(ROOT)
  self.assertEqual(result['files'],307)
  self.assertEqual(result['occurrences'],0,result['findings'])
  self.assertFalse(result['json_errors'])
  self.assertEqual(result['reviewed_literals'],29)
 def test_no_historical_inputs_or_catalog_archives(self):
  self.assertFalse((BASE/'replay').exists())
  self.assertFalse(list(BASE.rglob('*.gz')))
  self.assertFalse(list(BASE.rglob('*.zip')))
if __name__=='__main__':unittest.main()

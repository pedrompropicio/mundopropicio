/** Hermetic synthetic contract fixture. NOT captured Cloud/upstream delivery evidence. */
export const QUERY70="SELECT 1024::integer AS n, repeat('ação — 東京|',1024) AS payload, jsonb_build_object('nullable',NULL,'items',jsonb_build_array(1,'ação',true)) AS nested_value";
export const FINGERPRINT70='9c1588ccaaef8c4fbcdb007da46ddd4668caf8932fe3eeca0810c80541c6042f';
export const syntheticEnvelope70=()=>Buffer.from(JSON.stringify({
  version:1,
  id:'proof70-synthetic-0001',
  query:QUERY70,
  fingerprint:FINGERPRINT70,
  source:'versioned-synthetic-contract-fixture-not-cloud',
  data:[{n:1024,payload:'ação — 東京|'.repeat(1024),nested_value:{nullable:null,items:[1,'ação',true]}}],
  rowCount:1,
}),'utf8');
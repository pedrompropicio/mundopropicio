SELECT t.ok('330','rollback unavailable',NOT (t.state(md5('race@example.invalid'))->>'available')::boolean);
SELECT t.ok('330','rollback keeps earned50',(t.state(md5('race@example.invalid'))->>'points')::int=50);
SELECT t.ok('330','ledger original bytes unchanged',NOT EXISTS(SELECT * FROM t.ledger330 EXCEPT SELECT id,points,event_id,ref_id FROM club_points));
SELECT t.ok('330','rollback keeps completion',(t.state(md5('race@example.invalid'))->>'reward_claimed')::boolean);
SELECT club_profile_configure('00000000-0000-4000-8000-0000000000a2','profile-v1',true);
SELECT t.ok('330','reactivation no reward',(t.call(md5('race@example.invalid'),t.payload())->>'awarded')::int=0);

-- #330 PENDENTE / INERTE. Não aplicar sem revisão e autorização concreta.
-- Perfil canónico do membro; raw de captação é histórico, nunca é reescrito nem promove crédito.
BEGIN;
CREATE TABLE public.club_profile_countries(code text PRIMARY KEY CHECK(code ~ '^[A-Z]{2}$'), name text NOT NULL);
REVOKE ALL ON public.club_profile_countries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.club_profile_countries TO service_role;
ALTER TABLE public.club_profile_countries ENABLE ROW LEVEL SECURITY;
INSERT INTO public.club_profile_countries(code,name) VALUES
('AD','Andorra'),
('AE','Emirados Árabes Unidos'),
('AF','Afeganistão'),
('AG','Antígua e Barbuda'),
('AI','Anguila'),
('AL','Albânia'),
('AM','Armênia'),
('AO','Angola'),
('AQ','Antártida'),
('AR','Argentina'),
('AS','Samoa Americana'),
('AT','Áustria'),
('AU','Austrália'),
('AW','Aruba'),
('AX','Ilhas Aland'),
('AZ','Azerbaijão'),
('BA','Bósnia e Herzegovina'),
('BB','Barbados'),
('BD','Bangladesh'),
('BE','Bélgica'),
('BF','Burquina Faso'),
('BG','Bulgária'),
('BH','Bahrein'),
('BI','Burundi'),
('BJ','Benin'),
('BL','São Bartolomeu'),
('BM','Bermudas'),
('BN','Brunei'),
('BO','Bolívia'),
('BQ','Países Baixos Caribenhos'),
('BR','Brasil'),
('BS','Bahamas'),
('BT','Butão'),
('BV','Ilha Bouvet'),
('BW','Botsuana'),
('BY','Bielorrússia'),
('BZ','Belize'),
('CA','Canadá'),
('CC','Ilhas Cocos (Keeling)'),
('CD','Congo - Kinshasa'),
('CF','República Centro-Africana'),
('CG','República do Congo'),
('CH','Suíça'),
('CI','Costa do Marfim'),
('CK','Ilhas Cook'),
('CL','Chile'),
('CM','Camarões'),
('CN','China'),
('CO','Colômbia'),
('CR','Costa Rica'),
('CU','Cuba'),
('CV','Cabo Verde'),
('CW','Curaçao'),
('CX','Ilha Christmas'),
('CY','Chipre'),
('CZ','Tchéquia'),
('DE','Alemanha'),
('DJ','Djibuti'),
('DK','Dinamarca'),
('DM','Dominica'),
('DO','República Dominicana'),
('DZ','Argélia'),
('EC','Equador'),
('EE','Estônia'),
('EG','Egito'),
('EH','Saara Ocidental'),
('ER','Eritreia'),
('ES','Espanha'),
('ET','Etiópia'),
('FI','Finlândia'),
('FJ','Fiji'),
('FK','Ilhas Malvinas'),
('FM','Micronésia'),
('FO','Ilhas Faroe'),
('FR','França'),
('GA','Gabão'),
('GB','Reino Unido'),
('GD','Granada'),
('GE','Geórgia'),
('GF','Guiana Francesa'),
('GG','Guernsey'),
('GH','Gana'),
('GI','Gibraltar'),
('GL','Groenlândia'),
('GM','Gâmbia'),
('GN','Guiné'),
('GP','Guadalupe'),
('GQ','Guiné Equatorial'),
('GR','Grécia'),
('GS','Ilhas Geórgia do Sul e Sandwich do Sul'),
('GT','Guatemala'),
('GU','Guam'),
('GW','Guiné-Bissau'),
('GY','Guiana'),
('HK','Hong Kong, RAE da China'),
('HM','Ilhas Heard e McDonald'),
('HN','Honduras'),
('HR','Croácia'),
('HT','Haiti'),
('HU','Hungria'),
('ID','Indonésia'),
('IE','Irlanda'),
('IL','Israel'),
('IM','Ilha de Man'),
('IN','Índia'),
('IO','Território Britânico do Oceano Índico'),
('IQ','Iraque'),
('IR','Irã'),
('IS','Islândia'),
('IT','Itália'),
('JE','Jersey'),
('JM','Jamaica'),
('JO','Jordânia'),
('JP','Japão'),
('KE','Quênia'),
('KG','Quirguistão'),
('KH','Camboja'),
('KI','Quiribati'),
('KM','Comores'),
('KN','São Cristóvão e Névis'),
('KP','Coreia do Norte'),
('KR','Coreia do Sul'),
('KW','Kuwait'),
('KY','Ilhas Cayman'),
('KZ','Cazaquistão'),
('LA','Laos'),
('LB','Líbano'),
('LC','Santa Lúcia'),
('LI','Liechtenstein'),
('LK','Sri Lanka'),
('LR','Libéria'),
('LS','Lesoto'),
('LT','Lituânia'),
('LU','Luxemburgo'),
('LV','Letônia'),
('LY','Líbia'),
('MA','Marrocos'),
('MC','Mônaco'),
('MD','Moldova'),
('ME','Montenegro'),
('MF','São Martinho'),
('MG','Madagascar'),
('MH','Ilhas Marshall'),
('MK','Macedônia do Norte'),
('ML','Mali'),
('MM','Mianmar (Birmânia)'),
('MN','Mongólia'),
('MO','Macau, RAE da China'),
('MP','Ilhas Marianas do Norte'),
('MQ','Martinica'),
('MR','Mauritânia'),
('MS','Montserrat'),
('MT','Malta'),
('MU','Maurício'),
('MV','Maldivas'),
('MW','Malaui'),
('MX','México'),
('MY','Malásia'),
('MZ','Moçambique'),
('NA','Namíbia'),
('NC','Nova Caledônia'),
('NE','Níger'),
('NF','Ilha Norfolk'),
('NG','Nigéria'),
('NI','Nicarágua'),
('NL','Países Baixos'),
('NO','Noruega'),
('NP','Nepal'),
('NR','Nauru'),
('NU','Niue'),
('NZ','Nova Zelândia'),
('OM','Omã'),
('PA','Panamá'),
('PE','Peru'),
('PF','Polinésia Francesa'),
('PG','Papua-Nova Guiné'),
('PH','Filipinas'),
('PK','Paquistão'),
('PL','Polônia'),
('PM','São Pedro e Miquelão'),
('PN','Ilhas Pitcairn'),
('PR','Porto Rico'),
('PS','Territórios palestinos'),
('PT','Portugal'),
('PW','Palau'),
('PY','Paraguai'),
('QA','Catar'),
('RE','Reunião'),
('RO','Romênia'),
('RS','Sérvia'),
('RU','Rússia'),
('RW','Ruanda'),
('SA','Arábia Saudita'),
('SB','Ilhas Salomão'),
('SC','Seicheles'),
('SD','Sudão'),
('SE','Suécia'),
('SG','Singapura'),
('SH','Santa Helena'),
('SI','Eslovênia'),
('SJ','Svalbard e Jan Mayen'),
('SK','Eslováquia'),
('SL','Serra Leoa'),
('SM','San Marino'),
('SN','Senegal'),
('SO','Somália'),
('SR','Suriname'),
('SS','Sudão do Sul'),
('ST','São Tomé e Príncipe'),
('SV','El Salvador'),
('SX','Sint Maarten'),
('SY','Síria'),
('SZ','Essuatíni'),
('TC','Ilhas Turcas e Caicos'),
('TD','Chade'),
('TF','Territórios Franceses do Sul'),
('TG','Togo'),
('TH','Tailândia'),
('TJ','Tadjiquistão'),
('TK','Tokelau'),
('TL','Timor-Leste'),
('TM','Turcomenistão'),
('TN','Tunísia'),
('TO','Tonga'),
('TR','Turquia'),
('TT','Trinidad e Tobago'),
('TV','Tuvalu'),
('TW','Taiwan'),
('TZ','Tanzânia'),
('UA','Ucrânia'),
('UG','Uganda'),
('UM','Ilhas Menores Distantes dos EUA'),
('US','Estados Unidos'),
('UY','Uruguai'),
('UZ','Uzbequistão'),
('VA','Cidade do Vaticano'),
('VC','São Vicente e Granadinas'),
('VE','Venezuela'),
('VG','Ilhas Virgens Britânicas'),
('VI','Ilhas Virgens Americanas'),
('VN','Vietnã'),
('VU','Vanuatu'),
('WF','Wallis e Futuna'),
('WS','Samoa'),
('YE','Iêmen'),
('YT','Mayotte'),
('ZA','África do Sul'),
('ZM','Zâmbia'),
('ZW','Zimbábue');
CREATE TABLE public.club_profile_settings(
 site_id uuid PRIMARY KEY REFERENCES public.portal_sites(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 version text NOT NULL DEFAULT 'profile-v1' CHECK(version='profile-v1'),
 points int NOT NULL DEFAULT 50 CHECK(points=50), enabled boolean NOT NULL DEFAULT false
);
REVOKE ALL ON public.club_profile_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.club_profile_settings TO authenticated;
GRANT ALL ON public.club_profile_settings TO service_role;
ALTER TABLE public.club_profile_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_settings_staff ON public.club_profile_settings FOR SELECT TO authenticated
 USING(public.portal_can_write() AND public.row_belongs_to_current_company(company_id));
CREATE TABLE public.club_member_profiles(
 member_id uuid PRIMARY KEY REFERENCES public.club_members(id),
 site_id uuid NOT NULL REFERENCES public.portal_sites(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 birth_date date, birth_country text REFERENCES public.club_profile_countries(code),
 residence_country text REFERENCES public.club_profile_countries(code), city text,
 completed_at timestamptz, award_event_id uuid REFERENCES public.events(id),
 award_id uuid REFERENCES public.club_points(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(city IS NULL OR (length(city) BETWEEN 1 AND 120 AND city !~ '[<>[:cntrl:]]')),
 CHECK((completed_at IS NULL AND award_event_id IS NULL AND award_id IS NULL)
    OR (completed_at IS NOT NULL AND award_event_id IS NOT NULL))
);
REVOKE ALL ON public.club_member_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.club_member_profiles TO authenticated;
GRANT ALL ON public.club_member_profiles TO service_role;
ALTER TABLE public.club_member_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_profile_staff ON public.club_member_profiles FOR SELECT TO authenticated
 USING(public.portal_can_write() AND public.row_belongs_to_current_company(company_id));
-- Unicité permanente, indépendante de ref, édition et void. Aucune ligne historique n'est modifiée.
CREATE UNIQUE INDEX club_profile_one_award ON public.club_points(member_id) WHERE rule_key='profile_complete';

CREATE FUNCTION public._club330_profile_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'profile_history_preserved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM portal_sites s WHERE s.id=NEW.site_id AND s.company_id=NEW.company_id) THEN RAISE EXCEPTION 'profile_scope'; END IF;
 IF TG_TABLE_NAME='club_member_profiles' THEN
  IF NOT EXISTS(SELECT 1 FROM club_members m WHERE m.id=NEW.member_id AND m.site_id=NEW.site_id AND m.company_id=NEW.company_id) THEN RAISE EXCEPTION 'profile_scope'; END IF;
  IF NEW.birth_date IS NOT NULL AND (NEW.birth_date>(now() AT TIME ZONE 'Europe/Lisbon')::date OR NOT isfinite(NEW.birth_date)) THEN RAISE EXCEPTION 'birth_date_invalid'; END IF;
  IF TG_OP='UPDATE' AND (OLD.member_id IS DISTINCT FROM NEW.member_id OR OLD.site_id IS DISTINCT FROM NEW.site_id OR OLD.company_id IS DISTINCT FROM NEW.company_id
    OR (OLD.completed_at IS NOT NULL AND (OLD.completed_at IS DISTINCT FROM NEW.completed_at OR OLD.award_event_id IS DISTINCT FROM NEW.award_event_id OR (OLD.award_id IS NOT NULL AND OLD.award_id IS DISTINCT FROM NEW.award_id)))) THEN RAISE EXCEPTION 'profile_completion_immutable'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND (OLD.site_id IS DISTINCT FROM NEW.site_id OR OLD.company_id IS DISTINCT FROM NEW.company_id) THEN RAISE EXCEPTION 'profile_scope_immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER club_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON public.club_member_profiles FOR EACH ROW EXECUTE FUNCTION public._club330_profile_guard();
CREATE TRIGGER club_profile_settings_guard BEFORE INSERT OR UPDATE OR DELETE ON public.club_profile_settings FOR EACH ROW EXECUTE FUNCTION public._club330_profile_guard();
CREATE FUNCTION public._club330_award_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.rule_key='profile_complete' THEN RAISE EXCEPTION 'profile_history_preserved'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.rule_key='profile_complete' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'profile_award_immutable'; END IF;
 IF NEW.rule_key='profile_complete' AND (NEW.points<>50 OR NOT EXISTS(
  SELECT 1 FROM club_member_profiles p JOIN club_profile_settings s ON s.site_id=p.site_id
  WHERE p.member_id=NEW.member_id AND p.company_id=NEW.company_id AND p.completed_at IS NOT NULL
   AND p.award_event_id=NEW.event_id AND NEW.ref_id=p.member_id::text AND p.award_id IS NULL AND s.enabled
 )) THEN RAISE EXCEPTION 'profile_award_invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER club_profile_award_guard BEFORE INSERT OR UPDATE OR DELETE ON public.club_points FOR EACH ROW EXECUTE FUNCTION public._club330_award_guard();
CREATE FUNCTION public._club330_rule_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; BEGIN
 IF TG_OP='DELETE' THEN IF OLD.rule_key='profile_complete' THEN RAISE EXCEPTION 'profile_rule_protected'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.rule_key='profile_complete' AND (NEW.rule_key IS DISTINCT FROM OLD.rule_key OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN RAISE EXCEPTION 'profile_rule_protected'; END IF;
 IF NEW.rule_key='profile_complete' THEN
  SELECT * INTO r FROM club_profile_settings WHERE site_id=NEW.site_id AND company_id=NEW.company_id;
  IF NOT FOUND OR NEW.points<>50 OR NEW.active IS DISTINCT FROM r.enabled THEN RAISE EXCEPTION 'profile_rule_protected'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER club_profile_rule_guard BEFORE INSERT OR UPDATE OR DELETE ON public.club_point_rules FOR EACH ROW EXECUTE FUNCTION public._club330_rule_guard();

CREATE FUNCTION public.club_profile_state(p_site uuid,p_session_hash text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; p club_member_profiles; s club_profile_settings; n int; BEGIN
 SELECT cm.* INTO m FROM club_member_sessions x JOIN club_members cm ON cm.id=x.member_id
 JOIN portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id
 WHERE x.site_id=p_site AND cm.site_id=p_site AND x.token_hash=p_session_hash AND x.purpose='access' AND x.expires_at>now() AND cm.confirmed_at IS NOT NULL AND ps.active AND ps.brand_key='newgang';
 IF NOT FOUND THEN RAISE EXCEPTION 'no_session'; END IF;
 SELECT * INTO p FROM club_member_profiles WHERE member_id=m.id;
 SELECT * INTO s FROM club_profile_settings WHERE site_id=p_site;
 SELECT coalesce(sum(points),0)::int INTO n FROM club_points WHERE member_id=m.id AND (rule_key='profile_complete' OR (rule_key='void' AND ref_id='profile_complete:'||m.id::text));
 RETURN jsonb_build_object('birth_date',p.birth_date,'birth_country',p.birth_country,'residence_country',p.residence_country,'city',p.city,'phone',m.phone,
  'complete',p.birth_date IS NOT NULL AND p.birth_country IS NOT NULL AND p.residence_country IS NOT NULL AND p.city IS NOT NULL,
  'completed_at',p.completed_at,'reward_claimed',p.completed_at IS NOT NULL,'eligible',coalesce(s.enabled,false) AND p.completed_at IS NULL,
  'available',coalesce(s.enabled,false),'points',n,'reward_points',50,'version',s.version,'scope','adesao','whatsapp',jsonb_build_object('status','adapter_pending','editable',false));
END $$;

CREATE FUNCTION public.club_profile_confirm(p_site uuid,p_session_hash text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; s club_profile_settings; p club_member_profiles; bd date; bc text; rc text; ct text; ev uuid; aid uuid; gained int:=0; BEGIN
 -- Identité résolue depuis la session; aucun member/company/event fourni par le client.
 SELECT cm.* INTO m FROM club_member_sessions x JOIN club_members cm ON cm.id=x.member_id JOIN portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id
 WHERE x.site_id=p_site AND cm.site_id=p_site AND x.token_hash=p_session_hash AND x.purpose='access' AND x.expires_at>now() AND cm.confirmed_at IS NOT NULL AND ps.active AND ps.brand_key='newgang';
 IF NOT FOUND THEN RAISE EXCEPTION 'no_session'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('confirm','birth_date','birth_country','residence_country','city','phone','op')) THEN RAISE EXCEPTION 'profile_payload'; END IF;
 PERFORM _club_site_lock(p_site,false);
 -- Le cutover ne peut plus attendre le site en tenant un KEY SHARE du membre.
 PERFORM 1 FROM club_members WHERE id=m.id FOR NO KEY UPDATE;
 -- Revalider une session expirée pendant l'attente.
 IF NOT EXISTS(SELECT 1 FROM club_member_sessions WHERE token_hash=p_session_hash AND site_id=p_site AND member_id=m.id AND purpose='access' AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'no_session'; END IF;
 SELECT * INTO p FROM club_member_profiles WHERE member_id=m.id;
 SELECT * INTO s FROM club_profile_settings WHERE site_id=p_site AND company_id=m.company_id;
 IF p_payload->>'op'='clear' THEN
  IF p_payload<>jsonb_build_object('op','clear') THEN RAISE EXCEPTION 'profile_payload'; END IF;
  UPDATE club_member_profiles SET birth_date=NULL,birth_country=NULL,residence_country=NULL,city=NULL,updated_at=now() WHERE member_id=m.id;
  RETURN jsonb_build_object('ok',true,'awarded',0,'profile',club_profile_state(p_site,p_session_hash));
 END IF;
 IF p_payload ? 'op' OR p_payload->'confirm' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'profile_confirmation_required'; END IF;
 IF jsonb_typeof(p_payload->'birth_date') IS DISTINCT FROM 'string' OR (p_payload->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'birth_date_invalid'; END IF;
 BEGIN bd:=(p_payload->>'birth_date')::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'birth_date_invalid'; END;
 IF NOT isfinite(bd) OR bd>(now() AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION 'birth_date_invalid'; END IF;
 -- Dépendance réelle: aucune preuve parentale vérifiable trouvée. Pas de faux booléen ni interdiction <18.
 IF bd>((now() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date THEN RAISE EXCEPTION 'parental_flow_required'; END IF;
 IF jsonb_typeof(p_payload->'birth_country') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'residence_country') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'country_invalid'; END IF;
 bc:=upper(btrim(p_payload->>'birth_country')); rc:=upper(btrim(p_payload->>'residence_country'));
 IF NOT EXISTS(SELECT 1 FROM club_profile_countries WHERE code=bc) OR NOT EXISTS(SELECT 1 FROM club_profile_countries WHERE code=rc) THEN RAISE EXCEPTION 'country_invalid'; END IF;
 IF jsonb_typeof(p_payload->'city') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'city_invalid'; END IF;
 ct:=regexp_replace(btrim(p_payload->>'city'),' +',' ','g');
 IF length(ct) NOT BETWEEN 1 AND 120 OR ct ~ '[<>[:cntrl:]]' THEN RAISE EXCEPTION 'city_invalid'; END IF;
 IF p_payload ? 'phone' AND p_payload->'phone'<>'null'::jsonb AND (jsonb_typeof(p_payload->'phone') IS DISTINCT FROM 'string' OR (p_payload->>'phone') !~ '^\+[1-9][0-9]{7,14}$') THEN RAISE EXCEPTION 'phone_invalid'; END IF;
 IF NOT coalesce(s.enabled,false) THEN RAISE EXCEPTION 'profile_unavailable'; END IF;
 SELECT event_id INTO ev FROM portal_sites WHERE id=p_site AND company_id=m.company_id;
 IF ev IS NULL OR NOT EXISTS(SELECT 1 FROM events WHERE id=ev AND company_id=m.company_id) THEN RAISE EXCEPTION 'profile_event_invalid'; END IF;
 INSERT INTO club_member_profiles(member_id,site_id,company_id,birth_date,birth_country,residence_country,city)
 VALUES(m.id,p_site,m.company_id,bd,bc,rc,ct) ON CONFLICT(member_id) DO UPDATE SET birth_date=EXCLUDED.birth_date,birth_country=EXCLUDED.birth_country,residence_country=EXCLUDED.residence_country,city=EXCLUDED.city,updated_at=now();
 IF p_payload ? 'phone' THEN UPDATE club_members SET phone=p_payload->>'phone',updated_at=now() WHERE id=m.id; END IF;
 IF p.completed_at IS NULL THEN
  UPDATE club_member_profiles SET completed_at=now(),award_event_id=ev WHERE member_id=m.id;
  gained:=_club_award_core(m.id,'profile_complete',m.id::text,50,NULL);
  IF gained<>50 THEN RAISE EXCEPTION 'profile_credit_failed'; END IF;
  SELECT id INTO aid FROM club_points WHERE member_id=m.id AND rule_key='profile_complete';
  UPDATE club_member_profiles SET award_id=aid WHERE member_id=m.id;
 END IF;
 RETURN jsonb_build_object('ok',true,'awarded',gained,'profile',club_profile_state(p_site,p_session_hash));
END $$;
CREATE FUNCTION public.club_profile_configure(p_site uuid,p_version text,p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; BEGIN
 IF p_version IS DISTINCT FROM 'profile-v1' OR p_enabled IS NULL THEN RAISE EXCEPTION 'profile_config_invalid'; END IF;
 PERFORM _club_site_lock(p_site,true);
 SELECT * INTO s FROM portal_sites WHERE id=p_site AND domain='newgangfestival.pt' AND brand_key='newgang' AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_site_invalid'; END IF;
 INSERT INTO club_profile_settings(site_id,company_id,enabled) VALUES(s.id,s.company_id,p_enabled)
 ON CONFLICT(site_id) DO UPDATE SET enabled=EXCLUDED.enabled;
 INSERT INTO club_point_rules(company_id,site_id,rule_key,label,points,active) VALUES(s.company_id,s.id,'profile_complete','Completa o teu perfil',50,p_enabled)
 ON CONFLICT(site_id,rule_key) DO UPDATE SET points=50,active=EXCLUDED.active;
END $$;
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['_club330_profile_guard()','_club330_award_guard()','_club330_rule_guard()','club_profile_state(uuid,text)','club_profile_confirm(uuid,text,jsonb)','club_profile_configure(uuid,text,boolean)'] LOOP
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.'||f||' FROM PUBLIC,anon,authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||f||' TO service_role';
 END LOOP;
END $$;
-- Pas d'activation, pas de backfill, pas de nouveau crédit. Configuration absente = indisponible.
COMMIT;
